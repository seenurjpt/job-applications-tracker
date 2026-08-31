"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { currentUserId } from "@/auth";
import { inngest } from "@/inngest/client";
import * as accounts from "@/db/repositories/accounts";
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

async function dispatchBackfill(jobId: ObjectId): Promise<void> {
  // E2E runs inline — no Inngest dev server in CI.
  if (env.E2E_TEST_MODE) {
    await runBackfillToCompletion(jobId);
    return;
  }
  await inngest.send({
    name: "sync/backfill.requested",
    data: { jobId: jobId.toHexString() },
  });
}

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
  await dispatchBackfill(job._id);
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

export async function resumeSync(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({ jobId: z.string().refine(ObjectId.isValid) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const jobId = new ObjectId(parsed.data.jobId);
  await resumeJob(jobId);
  await dispatchBackfill(jobId);
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

  if (env.E2E_TEST_MODE) {
    await runIncrementalSync(account._id);
  } else {
    await inngest.send({
      name: "sync/incremental.requested",
      data: { accountId: account._id.toHexString() },
    });
  }
  revalidatePath("/dashboard");
  return { ok: true as const };
}
