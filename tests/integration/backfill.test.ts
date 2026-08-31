import { describe, it, expect } from "vitest";
import { fixture, client } from "./setup";
import { seedSyncReady } from "./helpers";
import { runBackfillToCompletion } from "@/services/sync/backfill";
import { processNextPage } from "@/services/sync/pipeline";
import * as syncJobsRepo from "@/db/repositories/sync-jobs";
import * as applicationsRepo from "@/db/repositories/applications";
import * as accountsRepo from "@/db/repositories/accounts";
import type { Application, Message, RawMessage } from "@/db/schemas";

function seedMailbox() {
  // 3 real applications, 2 noise threads, 1 ATS-domain thread the classifier
  // rejects. Auto-classifier flags subjects matching /application|applying|engineer|resume|role/i.
  fixture.addSentThread({
    threadId: "t1",
    subject: "Application for Backend Engineer",
    to: ["careers@acme.com"],
    days: [0, 8], // one follow-up
  });
  fixture.addSentThread({
    threadId: "t2",
    subject: "Applying for Frontend role",
    to: ["jobs@beta.io"],
    days: [0],
    inboundDays: [2], // got a reply
  });
  fixture.addSentThread({
    threadId: "t5",
    subject: "Resume for Data Scientist position",
    to: ["hr@gamma.com"],
    days: [0, 5, 12], // two follow-ups
  });
  fixture.addSentThread({
    threadId: "t3",
    subject: "Dinner plans",
    to: ["friend@gmail.com"],
  });
  fixture.addSentThread({
    threadId: "t4",
    subject: "Invoice #12 attached",
    to: ["billing@vendor.com"],
  });
  fixture.addSentThread({
    threadId: "t6",
    subject: "Hello there",
    to: ["apply@boards.greenhouse.io"], // passes prefilter via ATS domain
  });
}

async function collections() {
  const db = client.db("test");
  return {
    applications: await db.collection<Application>("applications").find().sort({ threadId: 1 }).toArray(),
    messages: await db.collection<Message>("messages").find().sort({ gmailMessageId: 1 }).toArray(),
    raw: await db.collection<RawMessage>("raw_messages").find().toArray(),
  };
}

describe("backfill pipeline", () => {
  it("produces the expected applications from a fixture mailbox", async () => {
    const { job, account } = await seedSyncReady();
    seedMailbox();

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");

    const { applications, messages, raw } = await collections();

    // All 9 sent messages stored raw (phase 2), regardless of AI outcome.
    expect(raw).toHaveLength(9);

    // Exactly the three real applications.
    expect(applications.map((a) => a.threadId)).toEqual(["t1", "t2", "t5"]);

    const t1 = applications.find((a) => a.threadId === "t1")!;
    expect(t1.company).toBe("Company for t1");
    expect(t1.role).toBe("Software Engineer");
    expect(t1.followUpCount).toBe(1);
    expect(t1.lastInboundAt).toBeNull();
    expect(t1.extractedBy).toBe("claude-haiku-4-5-20251001");

    const t2 = applications.find((a) => a.threadId === "t2")!;
    expect(t2.lastInboundAt).not.toBeNull();
    expect(t2.status).toBe("replied"); // auto reply-classifier says neutral

    const t5 = applications.find((a) => a.threadId === "t5")!;
    expect(t5.followUpCount).toBe(2);

    // Hydrated messages include the inbound reply on t2.
    const t2Messages = messages.filter((m) => m.threadId === "t2");
    expect(t2Messages.map((m) => m.direction).sort()).toEqual(["inbound", "outbound"]);

    // Job bookkeeping.
    const finished = await syncJobsRepo.findById(job._id);
    expect(finished?.status).toBe("completed");
    expect(finished?.stats.listed).toBe(9);
    expect(finished?.stats.applications).toBe(3);

    // historyId stored for incremental sync.
    const acc = await accountsRepo.findById(account._id);
    expect(acc?.historyId).toBe("hist-1");
    expect(acc?.lastSyncAt).not.toBeNull();
  });

  it("running the same backfill twice produces identical state and no double billing", async () => {
    const { job, account } = await seedSyncReady();
    seedMailbox();

    await runBackfillToCompletion(job._id);
    const first = await collections();
    const anthropicCallsAfterFirst = fixture.anthropicCalls().length;

    const job2 = await syncJobsRepo.create({
      accountId: account._id,
      type: "backfill",
      rangeFrom: job.rangeFrom,
      rangeTo: job.rangeTo,
    });
    await runBackfillToCompletion(job2._id);
    const second = await collections();

    // Identical state: same applications/messages (ignore updatedAt).
    expect(second.applications.map((a) => ({ ...a, updatedAt: null }))).toEqual(
      first.applications.map((a) => ({ ...a, updatedAt: null }))
    );
    expect(second.messages).toEqual(first.messages);
    expect(second.raw).toEqual(first.raw);

    // The classification cache means the rerun makes NO extraction calls —
    // the user is never charged twice for the same threads.
    const extractionCallsInRerun = fixture
      .anthropicCalls()
      .slice(anthropicCallsAfterFirst)
      .filter((c) => JSON.stringify(c.body).includes('"threadId"'));
    expect(extractionCallsInRerun).toHaveLength(0);
  });

  it("a sync that dies mid-way resumes from pageToken without duplicating", async () => {
    const { job } = await seedSyncReady();
    // 130 noise messages + the real mailbox forces two pages (PAGE_SIZE 100).
    for (let i = 0; i < 130; i++) {
      fixture.addSentThread({
        threadId: `noise-${i}`,
        subject: `Note to self ${i}`,
        to: ["self@gmail.com"],
        days: [i % 30],
      });
    }
    seedMailbox();

    // Page 1 only — then the process "dies".
    const first = await processNextPage(job._id);
    expect(first.kind).toBe("continue");
    const midJob = await syncJobsRepo.findById(job._id);
    expect(midJob?.pageToken).toBe("100");

    // Restart: resumes from the cursor.
    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");

    const { raw, applications } = await collections();
    expect(raw).toHaveLength(139); // no duplicates thanks to the unique index
    expect(applications.map((a) => a.threadId).sort()).toEqual(["t1", "t2", "t5"]);

    // The resumed listing continued from offset 100, never re-listing page 1.
    // (The final ATS inbox pass issues its own in:inbox query — excluded.)
    const listCalls = fixture
      .gmailCalls()
      .filter(
        (c) =>
          new URL(c.url).pathname.endsWith("/messages") &&
          !(new URL(c.url).searchParams.get("q") ?? "").includes("in:inbox")
      );
    const pageTokens = listCalls.map((c) => new URL(c.url).searchParams.get("pageToken"));
    expect(pageTokens.filter((t) => t === null)).toHaveLength(1);
    expect(pageTokens.filter((t) => t === "100")).toHaveLength(1);
  });

  it("a user-edited company survives a subsequent sync", async () => {
    const { job, account, user } = await seedSyncReady();
    seedMailbox();
    await runBackfillToCompletion(job._id);

    const app = (await applicationsRepo.findByThread(account._id, "t1"))!;
    await applicationsRepo.applyUserEdit(app._id, user._id, { company: "Edited Co" });

    // Clear the classification cache to force full re-extraction, the
    // worst case for clobbering user edits.
    await client.db("test").collection("thread_classifications").deleteMany({});

    const job2 = await syncJobsRepo.create({
      accountId: account._id,
      type: "backfill",
      rangeFrom: job.rangeFrom,
      rangeTo: job.rangeTo,
    });
    await runBackfillToCompletion(job2._id);

    const after = (await applicationsRepo.findByThread(account._id, "t1"))!;
    expect(after.company).toBe("Edited Co");
    expect(after.userEditedFields).toContain("company");
    // Non-edited fields still refresh from extraction.
    expect(after.role).toBe("Software Engineer");
  });

  it("invalid_grant during sync sets needs_reconnect and does not throw", async () => {
    const { job, account } = await seedSyncReady();
    seedMailbox();
    // Force the refresh path, and make Google reject it.
    await accountsRepo.updateTokens(account._id, {
      accessTokenEnc: (await accountsRepo.findById(account._id))!.accessTokenEnc,
      expiresAt: new Date(Date.now() - 60_000),
    });
    fixture.tokenMode = { kind: "invalid_grant" };

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome).toEqual({ kind: "paused", reason: "needs_reconnect" });

    const acc = await accountsRepo.findById(account._id);
    expect(acc?.status).toBe("needs_reconnect");
    const paused = await syncJobsRepo.findById(job._id);
    expect(paused?.status).toBe("paused");
  });

  it("a malformed Anthropic response does not discard the whole batch", async () => {
    const { job } = await seedSyncReady();
    seedMailbox();
    // First call malformed, repair attempt malformed too → per-thread fallback.
    fixture.anthropicMode = { kind: "malformed", text: "I think these are jobs!", times: 2 };

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");

    const { applications } = await collections();
    expect(applications.map((a) => a.threadId).sort()).toEqual(["t1", "t2", "t5"]);
  });

  it("a 429 from Gmail triggers backoff and eventually succeeds", async () => {
    const { job } = await seedSyncReady();
    seedMailbox();
    fixture.gmail429Remaining = 2;

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");
    const { applications } = await collections();
    expect(applications).toHaveLength(3);
  });
});
