import { ObjectId } from "mongodb";
import { inngest } from "@/inngest/client";
import { processNextPage } from "@/services/sync/pipeline";

/**
 * Durable backfill. Each page is its own step, so steps are memoised: a
 * failure at page 12 replays from page 12, not page 0 — and the DB-persisted
 * pageToken survives even a fully lost run (§7).
 */
export const backfillFunction = inngest.createFunction(
  { id: "sync-backfill", retries: 3, concurrency: { limit: 5 } },
  { event: "sync/backfill.requested" },
  async ({ event, step }) => {
    const jobId = new ObjectId(event.data.jobId);

    for (let page = 0; page < 1000; page++) {
      const outcome = await step.run(`page-${page}`, () =>
        processNextPage(jobId)
      );
      if (outcome.kind === "paused") return { paused: outcome.reason };
      if (outcome.kind === "done") return { done: true, pages: page + 1 };
    }
    return { done: false, error: "page limit exceeded" };
  }
);
