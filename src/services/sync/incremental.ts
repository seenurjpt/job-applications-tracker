import { ObjectId } from "mongodb";
import { subDays } from "date-fns";
import { logger } from "@/lib/logger";
import * as accountsRepo from "@/db/repositories/accounts";
import * as syncJobs from "@/db/repositories/sync-jobs";
import * as usersRepo from "@/db/repositories/users";
import { anthropicFor } from "@/services/anthropic/client";
import { getValidAccessToken } from "@/services/gmail/tokens";
import {
  getMetadataBatch,
  getProfile,
  listHistory,
} from "@/services/gmail/messages";
import { processMetadataBatch, type SyncContext } from "./pipeline";
import { runBackfillToCompletion } from "./backfill";

export type IncrementalOutcome =
  | { kind: "synced"; newMessages: number }
  | { kind: "fell_back_to_backfill" }
  | { kind: "skipped"; reason: string };

/**
 * historyId-based incremental sync (§7). On HTTP 404 the history window has
 * expired (Gmail retains roughly a week) — fall back to a bounded 7-day
 * backfill rather than a full re-scan.
 */
export async function runIncrementalSync(
  accountId: ObjectId
): Promise<IncrementalOutcome> {
  const account = await accountsRepo.findById(accountId);
  if (!account) return { kind: "skipped", reason: "account_missing" };
  if (account.status !== "active")
    return { kind: "skipped", reason: account.status };

  const user = await usersRepo.findById(account.userId);
  if (!user) return { kind: "skipped", reason: "user_missing" };

  // Key first — same gate as backfill (§6.6).
  const keyCheck = await anthropicFor(user._id);
  if (!keyCheck.ok) return { kind: "skipped", reason: `key_${keyCheck.error}` };

  const token = await getValidAccessToken(accountId);
  if (!token.ok) return { kind: "skipped", reason: token.error };

  if (!account.historyId) {
    await boundedBackfill(accountId);
    return { kind: "fell_back_to_backfill" };
  }

  // Collect new SENT messages across all history pages.
  const newIds: string[] = [];
  let pageToken: string | null = null;
  for (;;) {
    const page = await listHistory(token.value, account.historyId, pageToken);
    if (page.expired) {
      logger.info("historyId expired; falling back to bounded backfill", {
        accountId: accountId.toHexString(),
      });
      await boundedBackfill(accountId);
      return { kind: "fell_back_to_backfill" };
    }
    for (const m of page.messagesAdded) {
      if (m.labelIds.includes("SENT")) newIds.push(m.id);
    }
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  if (newIds.length > 0) {
    const job = await syncJobs.create({
      accountId,
      type: "incremental",
      rangeFrom: null,
      rangeTo: null,
    });
    await syncJobs.markRunning(job._id);

    const metas = await getMetadataBatch(token.value, newIds);
    const ctx: SyncContext = {
      job,
      account,
      user,
      accessToken: token.value,
      client: keyCheck.value.client,
      extractionModel: keyCheck.value.config.extractionModel,
      maxConcurrency: keyCheck.value.config.maxConcurrency,
    };
    const paused = await processMetadataBatch(ctx, metas);
    if (paused) return { kind: "skipped", reason: paused.kind };
    await syncJobs.complete(job._id);
  }

  const profile = await getProfile(token.value);
  await accountsRepo.setHistoryId(accountId, profile.historyId);
  await accountsRepo.setLastSyncAt(accountId, new Date());
  return { kind: "synced", newMessages: newIds.length };
}

async function boundedBackfill(accountId: ObjectId): Promise<void> {
  const now = new Date();
  const existing = await syncJobs.findActiveForAccount(accountId);
  if (existing) return;
  const job = await syncJobs.create({
    accountId,
    type: "backfill",
    rangeFrom: subDays(now, 7),
    rangeTo: now,
  });
  await runBackfillToCompletion(job._id);
}
