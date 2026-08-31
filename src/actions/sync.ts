"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/auth";
import * as accounts from "@/db/repositories/accounts";
import * as syncJobs from "@/db/repositories/sync-jobs";
import {
  createBackfillJob,
  resumeJob,
  runBackfillToCompletion,
} from "@/services/sync/backfill";
import { runIncrementalSync } from "@/services/sync/incremental";

const startSchema = z.object({
  accountId: z.string().refine(ObjectId.isValid),
  preset: z.enum(["today", "last_week", "last_month", "last_3_months", "last_6_months"]),
});

export async function startBackfill(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const account = await accounts.findById(new ObjectId(parsed.data.accountId));
  if (!account || !account.userId.equals(userId))
    return { ok: false as const, error: "account_not_found" };

  const job = await createBackfillJob({
    accountId: account._id,
    preset: parsed.data.preset,
  });
  await runBackfillToCompletion(job._id);
  revalidatePath("/dashboard");
  return { ok: true as const, jobId: job._id.toHexString() };
}

/**
 * Pre-backfill cost transparency (§6.8): a request count the user can reason
 * about, not a dollar figure that depends on pricing we'd have to hardcode.
 */
export async function estimateBackfill(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const account = await accounts.findById(new ObjectId(parsed.data.accountId));
  if (!account || !account.userId.equals(userId))
    return { ok: false as const, error: "account_not_found" };

  const { estimateForRange } = await import("@/services/sync/estimate");
  const est = await estimateForRange(account._id, parsed.data.preset);
  if (!est.ok) return { ok: false as const, error: est.error };
  return { ok: true as const, ...est.value };
}

/** How long without a heartbeat before a queued/running job counts as dead. */
const STALL_AFTER_MS = 90_000;

/**
 * Resumes a sync from its persisted cursor. Handles both paused jobs (key
 * problems, fixed by the user) and stalled ones — a crash, redeploy, or
 * timeout killed the runner mid-backfill. The pageToken lives in MongoDB, so
 * resumption continues where the dead run stopped, and the classification
 * cache means a re-run page is never billed twice.
 */
export async function resumeSync(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({ jobId: z.string().refine(ObjectId.isValid) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const jobId = new ObjectId(parsed.data.jobId);
  const job = await syncJobs.findById(jobId);
  if (!job) return { ok: false as const, error: "job_not_found" };
  const account = await accounts.findById(job.accountId);
  if (!account || !account.userId.equals(userId))
    return { ok: false as const, error: "job_not_found" };

  if (job.status === "paused") {
    await resumeJob(jobId);
    await runBackfillToCompletion(jobId);
    revalidatePath("/dashboard");
    return { ok: true as const };
  }

  // Stalled queued/running job: claim it atomically so a still-live runner
  // (or a concurrent resume from another tab) is never duplicated.
  const staleBefore = new Date(Date.now() - STALL_AFTER_MS);
  const claimed = await syncJobs.claimStalled(jobId, staleBefore);
  if (!claimed) return { ok: false as const, error: "job_still_active" };

  if (job.type === "incremental") {
    // Incremental jobs are short and restartable from history — no cursor.
    await syncJobs.cancel(jobId);
    await runIncrementalSync(account._id);
  } else {
    await runBackfillToCompletion(jobId);
  }
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function refreshNow(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({ accountId: z.string().refine(ObjectId.isValid) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const account = await accounts.findById(new ObjectId(parsed.data.accountId));
  if (!account || !account.userId.equals(userId))
    return { ok: false as const, error: "account_not_found" };

  await runIncrementalSync(account._id);
  revalidatePath("/dashboard");
  return { ok: true as const };
}
