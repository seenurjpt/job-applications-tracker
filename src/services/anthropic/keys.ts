import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/result";
import { logger } from "@/lib/logger";
import * as apiKeys from "@/db/repositories/api-keys";
import { recordUsage } from "./usage";
import type { KeyStatusValue, UserApiKey } from "@/db/schemas";

export type KeyErrorCode = "invalid" | "no_access" | "no_credit" | "unknown";

export function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Masked display, e.g. sk-ant-••••••••a4f2. No reveal feature exists (§6.2). */
export function maskedKey(keyHint: string): string {
  return `sk-ant-••••••••${keyHint}`;
}

/**
 * Verify with a real one-token call. Format checks alone catch typos but not
 * revoked keys or billing problems.
 *
 * A 429 means the key is VALID, just throttled — marking it invalid there
 * locks users out of their own working key (§6.3).
 */
export async function verifyKey(
  key: string,
  model: string
): Promise<
  Result<{ usage?: { input_tokens: number; output_tokens: number } }, KeyErrorCode>
> {
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return ok({ usage: res.usage });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return err("invalid");
    if (e instanceof Anthropic.PermissionDeniedError) return err("no_access");
    if (e instanceof Anthropic.RateLimitError) return ok({});
    if (
      e instanceof Anthropic.APIError &&
      e.status === 400 &&
      /credit|billing/i.test(e.message)
    ) {
      return err("no_credit");
    }
    logger.warn("Key verification failed for an unclassified reason", e);
    return err("unknown");
  }
}

export interface SaveKeyResult {
  status: KeyStatusValue;
  keyHint: string;
  unchanged: boolean;
}

/**
 * Save + verify. Trims first — paste whitespace is the single most common
 * "my key doesn't work" report. Saving an identical key (same fingerprint)
 * is a no-op, not a re-verification (§6.10).
 */
export async function saveKey(
  userId: ObjectId,
  rawKey: string,
  models?: { extractionModel?: string; draftModel?: string }
): Promise<SaveKeyResult> {
  const key = rawKey.trim(); // paste artifacts are extremely common
  if (!key.startsWith("sk-ant-")) {
    return { status: "invalid", keyHint: key.slice(-4).padStart(4, "•"), unchanged: false };
  }

  const fp = fingerprint(key);
  const existing = await apiKeys.findByUser(userId);
  const extractionModel =
    models?.extractionModel ??
    existing?.extractionModel ??
    env.ANTHROPIC_EXTRACTION_MODEL;
  const draftModel =
    models?.draftModel ?? existing?.draftModel ?? env.ANTHROPIC_DRAFT_MODEL;

  if (existing && existing.fingerprint === fp) {
    return { status: existing.status, keyHint: existing.keyHint, unchanged: true };
  }

  await apiKeys.upsert(userId, {
    keyEnc: encrypt(key),
    keyHint: key.slice(-4),
    fingerprint: fp,
    status: "unverified",
    extractionModel,
    draftModel,
  });

  const status = await verifyAndRecord(userId, key, extractionModel);
  return { status, keyHint: key.slice(-4), unchanged: false };
}

async function verifyAndRecord(
  userId: ObjectId,
  key: string,
  model: string
): Promise<KeyStatusValue> {
  const result = await verifyKey(key, model);
  if (result.ok) {
    await apiKeys.setStatus(userId, "valid");
    await recordUsage({
      userId,
      kind: "key_verification",
      model,
      usage: result.value.usage,
    });
    return "valid";
  }
  const status: KeyStatusValue =
    result.error === "unknown" ? "unverified" : result.error;
  await apiKeys.setStatus(userId, status, result.error);
  return status;
}

/**
 * Re-verify the stored key against a (possibly new) model choice.
 * Used when the user changes models — a key may not have access to every model.
 */
export async function reverifyStoredKey(
  userId: ObjectId,
  decryptedKey: string,
  model: string
): Promise<KeyStatusValue> {
  return verifyAndRecord(userId, decryptedKey, model);
}

export async function deleteKey(userId: ObjectId): Promise<void> {
  // Existing applications are untouched — extraction already happened,
  // that data is theirs (§6.10).
  await apiKeys.remove(userId);
}

/** Safe projection for the UI. The raw key NEVER crosses this boundary. */
export interface ApiKeyView {
  masked: string;
  status: KeyStatusValue;
  lastVerifiedAt: Date | null;
  lastErrorCode: string | null;
  extractionModel: string;
  draftModel: string;
  maxConcurrency: number;
}

export function toView(rec: UserApiKey): ApiKeyView {
  return {
    masked: maskedKey(rec.keyHint),
    status: rec.status,
    lastVerifiedAt: rec.lastVerifiedAt,
    lastErrorCode: rec.lastErrorCode,
    extractionModel: rec.extractionModel,
    draftModel: rec.draftModel,
    maxConcurrency: rec.maxConcurrency,
  };
}
