import type Anthropic from "@anthropic-ai/sdk";
import { backoffDelay, sleep } from "@/lib/async";
import { logger } from "@/lib/logger";
import {
  classifyAnthropicError,
  isKeyFailure,
  isRetryable,
  retryAfterMs,
  type KeyFailure,
} from "./errors";

/** Thrown when the user's key itself is the problem , the sync must PAUSE. */
export class AnthropicKeyError extends Error {
  constructor(public readonly kind: KeyFailure) {
    super(`Anthropic key failure: ${kind}`);
    this.name = "AnthropicKeyError";
  }
}

export const MAX_API_RETRIES = 5;

/**
 * The single retry ladder for every Anthropic call (§6.5, §6.7):
 * exponential backoff with jitter on 429/529/transient errors, honouring
 * retry-after; key failures (401/403/credit) become AnthropicKeyError so the
 * caller pauses at its cursor rather than failing.
 *
 * Retries live HERE, not in the SDK client (clients are constructed with
 * maxRetries: 0) , one retry layer, one policy, and it keeps throttling
 * observable as progress information instead of vanishing inside the SDK.
 */
export async function createMessageWithRetries(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (e) {
      const kind = classifyAnthropicError(e);
      if (isKeyFailure(kind)) throw new AnthropicKeyError(kind);
      if (!isRetryable(kind) || attempt === MAX_API_RETRIES - 1) throw e;
      lastError = e;
      const delay = retryAfterMs(e) ?? backoffDelay(attempt, 1000);
      logger.warn("Anthropic call throttled/unavailable, backing off", {
        kind,
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }
  throw lastError;
}
