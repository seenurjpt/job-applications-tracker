import { describe, it, expect } from "vitest";
import { fixture, client } from "./setup";
import { seedSyncReady } from "./helpers";
import { runBackfillToCompletion } from "@/services/sync/backfill";
import { runIncrementalSync } from "@/services/sync/incremental";
import * as accountsRepo from "@/db/repositories/accounts";
import type { Application } from "@/db/schemas";

async function apps() {
  return client
    .db("test")
    .collection<Application>("applications")
    .find()
    .sort({ threadId: 1 })
    .toArray();
}

describe("incremental sync (phase 7)", () => {
  it("a new sent email appears after the next sync without a full re-scan", async () => {
    const { job, account } = await seedSyncReady();
    fixture.addSentThread({
      threadId: "old-app",
      subject: "Application for Engineer",
      to: ["careers@acme.com"],
    });
    await runBackfillToCompletion(job._id);
    expect(await apps()).toHaveLength(1);
    const listCallsAfterBackfill = fixture
      .gmailCalls()
      .filter((c) => new URL(c.url).pathname.endsWith("/messages")).length;

    // A new application is sent; history reports it.
    fixture.addSentThread({
      threadId: "new-app",
      subject: "Applying for Staff Engineer role",
      to: ["jobs@newco.com"],
      days: [20],
    });
    fixture.historyAdds = [
      { id: "new-app-out-0", threadId: "new-app", labelIds: ["SENT"] },
    ];

    const outcome = await runIncrementalSync(account._id);
    expect(outcome).toEqual({ kind: "synced", newMessages: 1 });

    const all = await apps();
    expect(all.map((a) => a.threadId)).toEqual(["new-app", "old-app"]);

    // No full re-scan: the messages.list endpoint was never called again.
    const listCallsAfter = fixture
      .gmailCalls()
      .filter((c) => new URL(c.url).pathname.endsWith("/messages")).length;
    expect(listCallsAfter).toBe(listCallsAfterBackfill);

    // historyId advanced.
    const acc = await accountsRepo.findById(account._id);
    expect(acc?.historyId).toBe("hist-1"); // profile call refreshes it
  });

  it("an expired historyId degrades gracefully to a bounded 7-day backfill", async () => {
    const { job, account } = await seedSyncReady();
    fixture.addSentThread({
      threadId: "old-app",
      subject: "Application for Engineer",
      to: ["careers@acme.com"],
    });
    await runBackfillToCompletion(job._id);

    fixture.historyAdds = "expired";
    const outcome = await runIncrementalSync(account._id);
    expect(outcome).toEqual({ kind: "fell_back_to_backfill" });

    // The fallback listed messages again (bounded window) without crashing,
    // and state stayed consistent.
    expect(await apps()).toHaveLength(1);
  });

  it("skips cleanly when the account needs reconnecting", async () => {
    const { account } = await seedSyncReady();
    await accountsRepo.setStatus(account._id, "needs_reconnect");
    const outcome = await runIncrementalSync(account._id);
    expect(outcome).toEqual({ kind: "skipped", reason: "needs_reconnect" });
    expect(fixture.gmailCalls()).toHaveLength(0);
  });

  it("skips cleanly with no usable key , and makes no Gmail calls", async () => {
    const { user, account } = await seedSyncReady();
    const { setStatus } = await import("@/db/repositories/api-keys");
    await setStatus(user._id, "invalid");
    const outcome = await runIncrementalSync(account._id);
    expect(outcome).toEqual({ kind: "skipped", reason: "key_invalid" });
    expect(fixture.gmailCalls()).toHaveLength(0);
  });

  it("falls back to a bounded backfill when no historyId is stored yet", async () => {
    // Seed WITHOUT a queued job , the bounded backfill must create its own.
    const { seedUser, seedAccount, seedKey } = await import("./helpers");
    const user = await seedUser();
    const account = await seedAccount(user._id);
    await seedKey(user._id);
    fixture.addSentThread({
      threadId: "t-app",
      subject: "Application for Engineer",
      to: ["careers@acme.com"],
    });
    // historyId is null , never synced before.
    const outcome = await runIncrementalSync(account._id);
    expect(outcome).toEqual({ kind: "fell_back_to_backfill" });
    expect(await apps()).toHaveLength(1);
  });
});
