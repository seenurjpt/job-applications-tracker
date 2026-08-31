import type { ObjectId } from "mongodb";
import { resolveRange, toGmailQuery, type RangePreset } from "@/domain/date-range";
import { err, ok, type Result } from "@/lib/result";
import * as accountsRepo from "@/db/repositories/accounts";
import * as usersRepo from "@/db/repositories/users";
import { getValidAccessToken } from "@/services/gmail/tokens";
import { listMessages } from "@/services/gmail/messages";
import { EXTRACTION_BATCH_SIZE } from "@/services/anthropic/extract";

export interface BackfillEstimate {
  /** Gmail's estimate of sent messages in the range. */
  messages: number;
  /** Upper bound on classification requests, assuming the prefilter drops ~85%. */
  approxRequests: number;
}

/**
 * One cheap messages.list call for the resultSizeEstimate. The request count
 * shown is an upper bound: the free prefilter kills 80–90% of sent mail
 * before anything is billed (§5.4).
 */
export async function estimateForRange(
  accountId: ObjectId,
  preset: RangePreset
): Promise<Result<BackfillEstimate, "needs_reconnect" | "revoked" | "account_not_found">> {
  const account = await accountsRepo.findById(accountId);
  if (!account) return err("account_not_found");
  const user = await usersRepo.findById(account.userId);
  if (!user) return err("account_not_found");

  const token = await getValidAccessToken(accountId);
  if (!token.ok) return err(token.error);

  const range = resolveRange(preset, new Date());
  const q = toGmailQuery(range, user.settings.timezone);
  const page = await listMessages(token.value, q, null, 1);

  const survivors = Math.ceil(page.resultSizeEstimate * 0.15);
  return ok({
    messages: page.resultSizeEstimate,
    approxRequests: Math.ceil(survivors / EXTRACTION_BATCH_SIZE),
  });
}
