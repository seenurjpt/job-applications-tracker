import { ObjectId } from "mongodb";
import { resolveRange, type RangePreset } from "@/domain/date-range";
import * as syncJobs from "@/db/repositories/sync-jobs";
import * as rawMessages from "@/db/repositories/raw-messages";
import type { SyncJob } from "@/db/schemas";
import { processNextPage, type PageOutcome } from "./pipeline";

export async function createBackfillJob(input: {
  accountId: ObjectId;
  preset: RangePreset;
  custom?: { from: Date; to: Date };
  now?: Date;
}): Promise<SyncJob> {
  const existing = await syncJobs.findActiveForAccount(input.accountId);
  if (existing) return existing;

  const range = resolveRange(input.preset, input.now ?? new Date(), input.custom);
  return syncJobs.create({
    accountId: input.accountId,
    type: "backfill",
    rangeFrom: range.from,
    rangeTo: range.to,
  });
}

export async function resumeJob(jobId: ObjectId): Promise<void> {
  await syncJobs.requeueForResume(jobId);
}

/**
 * Runs pages until done or paused. The Inngest function wraps each page in its
 * own step; this direct loop exists for tests and the E2E inline runner.
 */
export async function runBackfillToCompletion(
  jobId: ObjectId,
  maxPages = 1000
): Promise<PageOutcome> {
  for (let i = 0; i < maxPages; i++) {
    const outcome = await processNextPage(jobId);
    if (outcome.kind !== "continue") return outcome;
  }
  throw new Error(`Backfill exceeded ${maxPages} pages; aborting`);
}

/**
 * Pre-backfill cost estimate (§6.8): a request count, which we know exactly,
 * not a dollar figure that depends on pricing we'd have to keep current.
 */
export function estimateRequests(threadCount: number): {
  threads: number;
  requests: number;
} {
  return { threads: threadCount, requests: Math.ceil(threadCount / 10) };
}

export async function storedMessageCount(accountId: ObjectId): Promise<number> {
  return rawMessages.countForAccount(accountId);
}
