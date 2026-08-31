import Anthropic from "@anthropic-ai/sdk";
import type { ObjectId } from "mongodb";
import { decrypt } from "@/lib/crypto";
import { err, ok, type Result } from "@/lib/result";
import * as apiKeys from "@/db/repositories/api-keys";
import type { UserApiKey } from "@/db/schemas";

// There is deliberately no module-level client here. Do not add one.
// A cached module-scope client serves one user's key to another user's
// request , the most severe bug this architecture can produce (§0.8).

export type KeyErrorCode =
  | "missing"
  | "invalid"
  | "no_credit"
  | "no_access"
  | "unknown";

export async function anthropicFor(
  userId: ObjectId
): Promise<Result<{ client: Anthropic; config: UserApiKey }, KeyErrorCode>> {
  const rec = await apiKeys.findByUser(userId, "anthropic");

  if (!rec) return err("missing");
  if (rec.status === "invalid") return err("invalid");
  if (rec.status === "no_credit") return err("no_credit");

  // maxRetries: 0 , retries are handled by ONE explicit policy in call.ts
  // (backoff + jitter + retry-after + key-failure mapping, §6.5/§6.7), not
  // duplicated inside the SDK where throttling would be invisible.
  return ok({
    client: new Anthropic({ apiKey: decrypt(rec.keyEnc), maxRetries: 0 }),
    config: rec,
  });
}
