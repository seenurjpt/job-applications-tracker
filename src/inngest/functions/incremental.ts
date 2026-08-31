import { ObjectId } from "mongodb";
import { inngest } from "@/inngest/client";
import { getDb } from "@/db/client";
import { runIncrementalSync } from "@/services/sync/incremental";
import type { GmailAccount } from "@/db/schemas";

/** Manual refresh — one account. */
export const incrementalFunction = inngest.createFunction(
  { id: "sync-incremental", retries: 2 },
  { event: "sync/incremental.requested" },
  async ({ event, step }) => {
    const accountId = new ObjectId(event.data.accountId);
    return step.run("incremental-sync", () => runIncrementalSync(accountId));
  }
);

/**
 * Hourly cron across all active accounts. Requires Production publishing
 * status — in Testing mode refresh tokens die after 7 days (§2.3) and this
 * quietly degrades to sync-on-login.
 */
export const incrementalCron = inngest.createFunction(
  { id: "sync-incremental-cron", retries: 1 },
  { cron: "0 * * * *" },
  async ({ step }) => {
    const accounts = await step.run("list-active-accounts", async () => {
      const rows = await getDb()
        .collection<GmailAccount>("gmail_accounts")
        .find({ status: "active" })
        .project<{ _id: GmailAccount["_id"] }>({ _id: 1 })
        .toArray();
      return rows.map((r) => r._id.toHexString());
    });

    for (const id of accounts) {
      await step.sendEvent(`fan-out-${id}`, {
        name: "sync/incremental.requested",
        data: { accountId: id },
      });
    }
    return { accounts: accounts.length };
  }
);
