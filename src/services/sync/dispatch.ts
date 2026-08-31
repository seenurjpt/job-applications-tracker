// Fire-and-forget job dispatch: each backfill page runs in its own request
// to /api/jobs/process, which processes the page after responding and then
// dispatches the next one. The chain lives entirely server-side, so a user
// refreshing, logging out, or closing the tab never stops a sync , only
// cancelling the job does (each link re-reads the job and stops on
// "cancelled"). The stall heartbeat + resume remains the safety net if a
// link dies (deploy, crash, timeout).

import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import { env } from "@/lib/env";

/** Derived from AUTH_SECRET so no extra env var is needed on either side. */
export function jobsDispatchSecret(): string {
  return createHash("sha256")
    .update(`${env.AUTH_SECRET}|jobs-dispatch-v1`)
    .digest("hex");
}

/**
 * Triggers processing of the job's next page. Resolves as soon as the
 * receiving invocation has accepted the work (202) , the page itself is
 * processed after that response, keeping every invocation short.
 */
export async function dispatchProcessJob(jobId: ObjectId): Promise<void> {
  const res = await fetch(`${env.AUTH_URL}/api/jobs/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-jobs-secret": jobsDispatchSecret(),
    },
    body: JSON.stringify({ jobId: jobId.toHexString() }),
  });
  if (!res.ok) {
    throw new Error(`job dispatch failed: HTTP ${res.status}`);
  }
}
