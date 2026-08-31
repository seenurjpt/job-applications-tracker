import Anthropic from "@anthropic-ai/sdk";

/**
 * Every Anthropic error is a user-facing state under BYO keys (§6.5).
 *
 *  401  → invalid      pause job, banner: key rejected
 *  403  → no_access    pause job, banner: no access to model
 *  400 credit/billing → no_credit  pause job, banner: add credit
 *  429  → rate_limit   backoff + retry; the key stays VALID (§6.3)
 *  529  → overloaded   backoff + retry
 *  network/5xx → transient
 */
export type AnthropicErrorKind =
  | "invalid"
  | "no_access"
  | "no_credit"
  | "rate_limit"
  | "overloaded"
  | "transient"
  | "unknown";

/** Kinds that pause the sync job and change the stored key status. */
export type KeyFailure = Extract<
  AnthropicErrorKind,
  "invalid" | "no_access" | "no_credit"
>;

export function classifyAnthropicError(e: unknown): AnthropicErrorKind {
  if (e instanceof Anthropic.AuthenticationError) return "invalid";
  if (e instanceof Anthropic.PermissionDeniedError) return "no_access";
  if (e instanceof Anthropic.RateLimitError) return "rate_limit";
  if (e instanceof Anthropic.APIError) {
    const status = e.status;
    if (status === 400 && /credit|billing/i.test(e.message)) return "no_credit";
    if (status === 529) return "overloaded";
    if (status !== undefined && status >= 500) return "transient";
    if (e instanceof Anthropic.APIConnectionError) return "transient";
    return "unknown";
  }
  return "unknown";
}

export function isKeyFailure(kind: AnthropicErrorKind): kind is KeyFailure {
  return kind === "invalid" || kind === "no_access" || kind === "no_credit";
}

export function isRetryable(kind: AnthropicErrorKind): boolean {
  return kind === "rate_limit" || kind === "overloaded" || kind === "transient";
}

/** retry-after seconds if the SDK error carries one. */
export function retryAfterMs(e: unknown): number | null {
  if (e instanceof Anthropic.APIError) {
    const h = e.headers;
    const value =
      h && typeof (h as Headers).get === "function"
        ? (h as Headers).get("retry-after")
        : null;
    if (value) {
      const secs = Number(value);
      if (Number.isFinite(secs)) return secs * 1000;
    }
  }
  return null;
}
