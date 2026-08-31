// Internal endpoint driving the server-side sync chain. Secured by a secret
// derived from AUTH_SECRET , never called by browsers, only by the app
// itself (see src/services/sync/dispatch.ts).

import { after, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { logger } from "@/lib/logger";
import { processNextPage } from "@/services/sync/pipeline";
import { dispatchProcessJob, jobsDispatchSecret } from "@/services/sync/dispatch";

export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-jobs-secret");
  if (!secret || secret !== jobsDispatchSecret()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let jobId: ObjectId;
  try {
    const body = (await req.json()) as { jobId?: string };
    if (!body.jobId || !ObjectId.isValid(body.jobId)) throw new Error("bad id");
    jobId = new ObjectId(body.jobId);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Accept immediately; do the actual page work after the response so the
  // dispatching invocation isn't held open for it.
  after(async () => {
    try {
      const outcome = await processNextPage(jobId);
      // "continue" chains the next page; "done"/"paused" ends the chain
      // (a cancelled job reports "done" on its next link).
      if (outcome.kind === "continue") {
        await dispatchProcessJob(jobId);
      }
    } catch (e) {
      logger.warn("job chain link failed; stall detection will offer resume", {
        jobId: jobId.toHexString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
