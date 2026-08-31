import { describe, it, expect } from "vitest";
import { fixture, client } from "./setup";
import { addInboundOnlyThread } from "../fixtures/gmail-fixture";
import { seedSyncReady } from "./helpers";
import { runBackfillToCompletion } from "@/services/sync/backfill";
import * as syncJobsRepo from "@/db/repositories/sync-jobs";
import type { Application, Message } from "@/db/schemas";

describe("ATS inbox pass (§5.4, phase 8)", () => {
  it("captures an ATS confirmation that never appears in sent mail", async () => {
    const { job } = await seedSyncReady();
    // A normal sent application...
    fixture.addSentThread({
      threadId: "sent-app",
      subject: "Application for Backend Engineer",
      to: ["careers@acme.com"],
    });
    // ...and an Easy-Apply-style confirmation, INBOX only.
    addInboundOnlyThread(fixture, {
      threadId: "ats-confirm",
      subject: "Your application to Quill was received",
      from: "no-reply@boards.greenhouse.io",
    });
    // Inbox noise from a non-ATS sender must NOT be picked up.
    addInboundOnlyThread(fixture, {
      threadId: "newsletter",
      subject: "Your application-themed newsletter",
      from: "digest@substack.com",
    });

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");

    const apps = await client
      .db("test")
      .collection<Application>("applications")
      .find()
      .sort({ threadId: 1 })
      .toArray();
    expect(apps.map((a) => a.threadId)).toEqual(["ats-confirm", "sent-app"]);

    const ats = apps.find((a) => a.threadId === "ats-confirm")!;
    expect(ats.source).toBe("ats"); // unknown/inferred sources coerce to ats
    expect(ats.followUpCount).toBe(0);
    expect(ats.contactEmail).toBe("no-reply@boards.greenhouse.io");
    expect(ats.appliedAt).toEqual(new Date(Date.UTC(2026, 0, 1)));

    const msgs = await client
      .db("test")
      .collection<Message>("messages")
      .find({ threadId: "ats-confirm" })
      .toArray();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.direction).toBe("inbound");
  });

  it("a later rejection in the ATS thread flips the status", async () => {
    const { job } = await seedSyncReady();
    addInboundOnlyThread(fixture, {
      threadId: "ats-rejected",
      subject: "Your application to Quill was received",
      from: "no-reply@boards.greenhouse.io",
      days: [0, 5],
    });
    // The default reply-classifier answer is neutral; make it a rejection.
    fixture.anthropicMode = { kind: "auto" };
    const { server } = await import("./setup");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        const body = (await request.json()) as { system?: string; model: string };
        if (body.system?.includes("classify replies")) {
          return HttpResponse.json({
            id: "m",
            type: "message",
            role: "assistant",
            model: body.model,
            content: [
              { type: "text", text: JSON.stringify({ classification: "rejection" }) },
            ],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        }
        // fall through to the default handler behaviour for extraction
        return HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  threadId: "ats-rejected",
                  isJobApplication: true,
                  confidence: 0.95,
                  company: "Quill",
                  role: "Staff Engineer",
                  contactName: null,
                  source: "ats",
                },
              ]),
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        });
      })
    );

    await runBackfillToCompletion(job._id);

    const app = await client
      .db("test")
      .collection<Application>("applications")
      .findOne({ threadId: "ats-rejected" });
    expect(app?.status).toBe("rejected");
    expect(app?.company).toBe("Quill");
  });

  it("re-running does not re-bill inbox-pass threads", async () => {
    const { job, account } = await seedSyncReady();
    addInboundOnlyThread(fixture, {
      threadId: "ats-confirm",
      subject: "Your application to Quill was received",
      from: "no-reply@boards.greenhouse.io",
    });
    await runBackfillToCompletion(job._id);
    const callsAfterFirst = fixture.anthropicCalls().length;

    const job2 = await syncJobsRepo.create({
      accountId: account._id,
      type: "backfill",
      rangeFrom: job.rangeFrom,
      rangeTo: job.rangeTo,
    });
    await runBackfillToCompletion(job2._id);

    const extractionCalls = fixture
      .anthropicCalls()
      .slice(callsAfterFirst)
      .filter((c) => JSON.stringify(c.body).includes('"threadId"'));
    expect(extractionCalls).toHaveLength(0);
  });
});
