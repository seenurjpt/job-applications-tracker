import { env } from "@/lib/env";
import { backoffDelay, sleep } from "@/lib/async";
import { logger } from "@/lib/logger";

export class GmailAuthError extends Error {}

export class GmailApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

const MAX_ATTEMPTS = 5;

/**
 * Authenticated fetch against the Gmail API with exponential backoff + jitter
 * on 429 and 5xx, honouring Retry-After when present.
 */
export async function gmailFetch<T>(
  accessToken: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, string | undefined>;
    body?: unknown;
  } = {}
): Promise<T> {
  const url = new URL(path, env.GMAIL_API_BASE);
  for (const [k, v] of Object.entries(options.params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  let lastError: Error = new GmailApiError("gmailFetch: no attempt made", 0);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (e) {
      // Network failure — retryable.
      lastError = e instanceof Error ? e : new Error(String(e));
      await sleep(backoffDelay(attempt));
      continue;
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status === 401) {
      throw new GmailAuthError(`Gmail API returned 401 for ${url.pathname}`);
    }

    const retryable = res.status === 429 || res.status >= 500;
    lastError = new GmailApiError(
      `Gmail API ${res.status} for ${url.pathname}`,
      res.status
    );
    if (!retryable || attempt === MAX_ATTEMPTS - 1) throw lastError;

    const retryAfter = res.headers.get("retry-after");
    const delay = retryAfter
      ? Number(retryAfter) * 1000
      : backoffDelay(attempt);
    logger.warn("Gmail API throttled, backing off", {
      status: res.status,
      attempt,
      delayMs: delay,
    });
    await sleep(delay);
  }
  throw lastError;
}
