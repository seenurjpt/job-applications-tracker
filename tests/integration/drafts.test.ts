import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { fixture, client } from "./setup";
import { seedSyncReady } from "./helpers";
import { runBackfillToCompletion } from "@/services/sync/backfill";
import {
  bulkCreate,
  bulkGenerate,
  createDraftInGmail,
  generateDraft,
} from "@/services/drafts";
import * as applicationsRepo from "@/db/repositories/applications";
import * as draftsRepo from "@/db/repositories/drafts";
import type { Application, Draft } from "@/db/schemas";

function decodeRaw(raw: string): string {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

async function seedApplications(count: number) {
  const ready = await seedSyncReady();
  for (let i = 0; i < count; i++) {
    fixture.addSentThread({
      threadId: `app-${i}`,
      subject: `Application for Engineer ${i}`,
      to: [`careers@company${i}.com`],
      days: [i],
    });
  }
  await runBackfillToCompletion(ready.job._id);
  const apps = await client
    .db("test")
    .collection<Application>("applications")
    .find()
    .sort({ threadId: 1 })
    .toArray();
  expect(apps).toHaveLength(count);
  return { ...ready, apps };
}

describe("single draft (phase 5)", () => {
  it("generates a body and creates a correctly threaded Gmail draft", async () => {
    const { user, apps } = await seedApplications(1);
    const app = apps[0]!;

    const gen = await generateDraft(user._id, app._id, "polite_nudge");
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    expect(gen.value.subject.startsWith("Re:")).toBe(true);
    expect(gen.value.body.length).toBeGreaterThan(10);

    const created = await createDraftInGmail(user._id, gen.value._id);
    expect(created.ok).toBe(true);

    // Inspect what actually went to Gmail: raw MIME + threadId both present.
    const call = fixture
      .gmailCalls()
      .find((c) => c.url.endsWith("/drafts") && c.method === "POST")!;
    const body = call.body as { message: { raw: string; threadId: string } };
    expect(body.message.threadId).toBe(app.threadId);
    const mime = decodeRaw(body.message.raw);
    expect(mime).toContain("In-Reply-To: <app-0-out-0@mail.example.com>");
    expect(mime).toContain("References: <app-0-out-0@mail.example.com>");
    expect(mime).toContain("To: careers@company0.com");

    const stored = (await draftsRepo.findById(gen.value._id))!;
    expect(stored.status).toBe("created");
    expect(stored.gmailDraftId).toBe("draft-1");
  });

  it("records an edited body before creating", async () => {
    const { user, apps } = await seedApplications(1);
    const gen = await generateDraft(user._id, apps[0]!._id, "value_add");
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    await createDraftInGmail(user._id, gen.value._id, {
      body: "My hand-edited follow-up.",
    });
    const call = fixture
      .gmailCalls()
      .find((c) => c.url.endsWith("/drafts") && c.method === "POST")!;
    const mime = decodeRaw((call.body as { message: { raw: string } }).message.raw);
    const b64Body = mime.slice(mime.indexOf("\r\n\r\n") + 4);
    expect(Buffer.from(b64Body, "base64").toString("utf8")).toBe(
      "My hand-edited follow-up."
    );
    const stored = (await draftsRepo.findById(gen.value._id))!;
    expect(stored.body).toBe("My hand-edited follow-up.");
  });

  it("a paused key blocks generation with a typed error", async () => {
    const { user, apps } = await seedApplications(1);
    const { setStatus } = await import("@/db/repositories/api-keys");
    await setStatus(user._id, "invalid");
    const gen = await generateDraft(user._id, apps[0]!._id, "polite_nudge");
    expect(gen).toEqual({ ok: false, error: "key_invalid" });
  });
});

describe("bulk drafts (phase 6)", () => {
  it("creates 20 drafts; a mid-batch failure leaves 19 successes and one retryable failure", async () => {
    const { user, apps } = await seedApplications(20);

    const generated = await bulkGenerate(
      user._id,
      apps.map((a) => a._id),
      "polite_nudge"
    );
    expect(generated.filter((r) => r.ok)).toHaveLength(20);

    // Fail the 7th drafts.create call.
    fixture.failDraftCreateAt = 7;
    const created = await bulkCreate(
      user._id,
      generated.map((r) => ({ draftId: new ObjectId(r.draftId!) }))
    );

    const okRows = created.filter((r) => r.ok);
    const failedRows = created.filter((r) => !r.ok);
    expect(okRows).toHaveLength(19);
    expect(failedRows).toHaveLength(1);

    // The failure is recorded and retryable — not a rollback.
    const db = client.db("test");
    const drafts = await db.collection<Draft>("drafts").find().toArray();
    expect(drafts.filter((d) => d.status === "created")).toHaveLength(19);
    const failed = drafts.filter((d) => d.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toBeTruthy();

    // Retry just the failed row — now it succeeds.
    fixture.failDraftCreateAt = null;
    const retry = await bulkCreate(user._id, [{ draftId: failed[0]!._id }]);
    expect(retry[0]!.ok).toBe(true);
    const after = await db.collection<Draft>("drafts").find({ status: "created" }).toArray();
    expect(after).toHaveLength(20);
  });

  it("per-row generation failure does not sink the batch", async () => {
    const { user, apps } = await seedApplications(3);
    // An application whose messages were wiped can't be drafted.
    await client
      .db("test")
      .collection("messages")
      .deleteMany({ applicationId: apps[1]!._id });

    const rows = await bulkGenerate(
      user._id,
      apps.map((a) => a._id),
      "final_check_in"
    );
    expect(rows.filter((r) => r.ok)).toHaveLength(2);
    expect(rows.find((r) => !r.ok)?.error).toBe("no_outbound_message");
  });

  it("cannot draft against another user's application", async () => {
    const { apps } = await seedApplications(1);
    const stranger = new ObjectId();
    const res = await generateDraft(stranger, apps[0]!._id, "polite_nudge");
    expect(res).toEqual({ ok: false, error: "application_not_found" });
  });
});

describe("status override interplay", () => {
  it("a user-overridden status survives re-derivation", async () => {
    const { user, account, apps, job } = await seedApplications(1);
    await applicationsRepo.overrideStatus(apps[0]!._id, user._id, "interviewing");

    await client.db("test").collection("thread_classifications").deleteMany({});
    const { create } = await import("@/db/repositories/sync-jobs");
    const job2 = await create({
      accountId: account._id,
      type: "backfill",
      rangeFrom: job.rangeFrom,
      rangeTo: job.rangeTo,
    });
    await runBackfillToCompletion(job2._id);

    const after = await applicationsRepo.findById(apps[0]!._id);
    expect(after?.status).toBe("interviewing");
    expect(after?.statusOverriddenByUser).toBe(true);
  });
});
