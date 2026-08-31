// BYO-key tests , these are security tests, not feature tests (§8.2).

import { describe, it, expect } from "vitest";
import { fixture, logLines } from "./setup";
import {
  seedAccount,
  seedBackfillJob,
  seedKey,
  seedSyncReady,
  seedUser,
} from "./helpers";
import { anthropicFor } from "@/services/anthropic/client";
import { extractThreadBatch } from "@/services/anthropic/extract";
import { saveKey, toView } from "@/services/anthropic/keys";
import { runBackfillToCompletion } from "@/services/sync/backfill";
import { processNextPage } from "@/services/sync/pipeline";
import { logger } from "@/lib/logger";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import * as syncJobsRepo from "@/db/repositories/sync-jobs";
import * as usageRepo from "@/db/repositories/usage";
import type { ObjectId } from "mongodb";

async function extractFor(userId: ObjectId) {
  const res = await anthropicFor(userId);
  if (!res.ok) throw new Error(`no client: ${res.error}`);
  return extractThreadBatch(
    {
      client: res.value.client,
      model: res.value.config.extractionModel,
      userId,
      syncJobId: null,
    },
    [
      {
        threadId: `t-${userId.toHexString()}`,
        subject: "Application for Engineer",
        snippet: "resume attached",
        to: ["careers@acme.com"],
        date: "2026-01-05",
      },
    ]
  );
}

describe("cross-user key isolation , the one that matters", () => {
  it("never sends one user's key on another user's request", async () => {
    const a = await seedUser("a@example.com");
    const b = await seedUser("b@example.com");
    await seedKey(a._id, "sk-ant-aaaa-key-0001");
    await seedKey(b._id, "sk-ant-bbbb-key-0002");

    await Promise.all([extractFor(a._id), extractFor(b._id)]);

    const seen = fixture.anthropicCalls().map((c) => c.apiKey);
    expect(seen).toHaveLength(2);
    expect(new Set(seen)).toEqual(
      new Set(["sk-ant-aaaa-key-0001", "sk-ant-bbbb-key-0002"])
    );
  });

  it("fires many interleaved requests and every call carries its own user's key", async () => {
    const users = await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedUser(`u${i}@example.com`))
    );
    await Promise.all(
      users.map((u, i) => seedKey(u._id, `sk-ant-user-${i}-key-xyz${i}`))
    );

    await Promise.all(users.flatMap((u) => [extractFor(u._id), extractFor(u._id)]));

    // Each request's key must match the threadId (which embeds the userId).
    for (const call of fixture.anthropicCalls()) {
      const body = JSON.stringify(call.body);
      const m = body.match(/t-([0-9a-f]{24})/);
      expect(m).not.toBeNull();
      const owner = users.findIndex((u) => u._id.toHexString() === m![1]);
      expect(call.apiKey).toBe(`sk-ant-user-${owner}-key-xyz${owner}`);
    }
  });
});

describe("the key never leaves the server boundary", () => {
  it("saveKey results and views serialise without the key", async () => {
    const user = await seedUser();
    const result = await saveKey(user._id, "sk-ant-super-secret-key-a4f2");
    expect(JSON.stringify(result)).not.toMatch(/sk-ant-super-secret/);

    const rec = (await apiKeysRepo.findByUser(user._id))!;
    const view = toView(rec);
    expect(JSON.stringify(view)).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(view.masked).toBe("sk-ant-••••••••a4f2");
    // No reveal path exists: the view carries only the hint.
    expect(Object.values(view).join(" ")).not.toContain("super-secret");
  });

  it("the stored record never contains the plaintext key", async () => {
    const user = await seedUser();
    await saveKey(user._id, "sk-ant-super-secret-key-a4f2");
    const rec = (await apiKeysRepo.findByUser(user._id))!;
    expect(JSON.stringify(rec)).not.toContain("sk-ant-super-secret");
    expect(rec.keyHint).toBe("a4f2");
    expect(rec.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("logger redacts keys end-to-end", async () => {
    logger.error("key failed", { apiKey: "sk-ant-leaky-key-123", code: 401 });
    const all = logLines.join("\n");
    expect(all).not.toContain("sk-ant-leaky-key-123");
    expect(all).toContain("401");
  });
});

describe("sync gating and failure handling", () => {
  it("sync with no key pauses at step 0 and makes ZERO Gmail calls", async () => {
    const user = await seedUser();
    const account = await seedAccount(user._id);
    const job = await seedBackfillJob(account._id);

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome).toEqual({ kind: "paused", reason: "key_missing" });
    expect(fixture.gmailCalls()).toHaveLength(0);

    const paused = await syncJobsRepo.findById(job._id);
    expect(paused?.status).toBe("paused");
    expect(paused?.pausedReason).toBe("key_missing");
  });

  it("401 mid-sync sets invalid, pauses at the cursor; resume continues without re-listing or re-billing", async () => {
    const { job, user } = await seedSyncReady();
    for (let i = 0; i < 110; i++) {
      fixture.addSentThread({
        threadId: `page1-${i}`,
        subject: i < 5 ? `Application for Engineer ${i}` : `Note ${i}`,
        to: i < 5 ? ["careers@acme.com"] : ["self@gmail.com"],
        days: [29 - (i % 30)],
      });
    }
    fixture.addSentThread({
      threadId: "page2-app",
      subject: "Application for Platform Engineer",
      to: ["careers@zeta.com"],
      days: [0],
    });

    // Page 1 succeeds.
    const first = await processNextPage(job._id);
    expect(first.kind).toBe("continue");
    const classifyCallsAfterPage1 = fixture.anthropicCalls().length;
    expect(classifyCallsAfterPage1).toBeGreaterThan(0);

    // Page 2: the key dies.
    fixture.anthropicMode = {
      kind: "error",
      status: 401,
      errorType: "authentication_error",
      message: "invalid x-api-key",
    };
    const second = await processNextPage(job._id);
    expect(second).toEqual({ kind: "paused", reason: "key_invalid" });

    const midJob = await syncJobsRepo.findById(job._id);
    expect(midJob?.status).toBe("paused");
    expect(midJob?.pageToken).toBe("100"); // cursor preserved
    expect((await apiKeysRepo.findByUser(user._id))?.status).toBe("invalid");

    // User fixes the key → resume continues from the cursor.
    fixture.anthropicMode = { kind: "auto" };
    await apiKeysRepo.setStatus(user._id, "valid");
    await syncJobsRepo.requeueForResume(job._id);
    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome.kind).toBe("done");

    // Never re-listed page 1 (the ATS inbox pass's in:inbox query excluded)...
    const listCalls = fixture
      .gmailCalls()
      .filter(
        (c) =>
          new URL(c.url).pathname.endsWith("/messages") &&
          !(new URL(c.url).searchParams.get("q") ?? "").includes("in:inbox")
      );
    const tokens = listCalls.map((c) => new URL(c.url).searchParams.get("pageToken"));
    expect(tokens.filter((t) => t === null)).toHaveLength(1);
    // ...and never re-classified page-1 threads (no double charge).
    const extractionBodies = fixture
      .anthropicCalls()
      .slice(classifyCallsAfterPage1)
      .map((c) => JSON.stringify(c.body));
    expect(extractionBodies.filter((b) => b.includes("page1-")).length).toBe(0);
  });

  it("429 from Anthropic backs off, retries, and does NOT mark the key invalid", async () => {
    const user = await seedUser();
    await seedKey(user._id);
    fixture.anthropicMode = {
      kind: "error",
      status: 429,
      errorType: "rate_limit_error",
      message: "rate limited",
      retryAfter: "0",
      times: 2,
    };

    const results = await extractFor(user._id);
    expect(results).toHaveLength(1);
    expect((await apiKeysRepo.findByUser(user._id))?.status).toBe("valid");
  });

  it("400 with a billing message sets no_credit, not invalid", async () => {
    const { job, user } = await seedSyncReady();
    fixture.addSentThread({
      threadId: "t1",
      subject: "Application for Engineer",
      to: ["careers@acme.com"],
    });
    fixture.anthropicMode = {
      kind: "error",
      status: 400,
      errorType: "invalid_request_error",
      message: "Your credit balance is too low to access the Anthropic API.",
    };

    const outcome = await runBackfillToCompletion(job._id);
    expect(outcome).toEqual({ kind: "paused", reason: "key_no_credit" });
    expect((await apiKeysRepo.findByUser(user._id))?.status).toBe("no_credit");
  });
});

describe("key lifecycle", () => {
  it("trims pasted whitespace and verifies successfully", async () => {
    const user = await seedUser();
    const result = await saveKey(user._id, "   sk-ant-padded-key-a4f2\n");
    expect(result.status).toBe("valid");
    expect(result.keyHint).toBe("a4f2");

    const verifyCall = fixture.anthropicCalls()[0]!;
    expect(verifyCall.apiKey).toBe("sk-ant-padded-key-a4f2"); // trimmed
  });

  it("saving an identical key is a no-op, not a re-verification", async () => {
    const user = await seedUser();
    await saveKey(user._id, "sk-ant-same-key-a4f2");
    const callsAfterFirst = fixture.anthropicCalls().length;
    expect(callsAfterFirst).toBe(1);

    const second = await saveKey(user._id, "sk-ant-same-key-a4f2");
    expect(second.unchanged).toBe(true);
    expect(fixture.anthropicCalls().length).toBe(callsAfterFirst); // no new call
  });

  it("a key failing verification with 401 is stored as invalid with a clear code", async () => {
    const user = await seedUser();
    fixture.anthropicMode = {
      kind: "error",
      status: 401,
      errorType: "authentication_error",
      message: "invalid x-api-key",
    };
    const result = await saveKey(user._id, "sk-ant-revoked-key-0000");
    expect(result.status).toBe("invalid");
    const rec = (await apiKeysRepo.findByUser(user._id))!;
    expect(rec.status).toBe("invalid");
    expect(rec.lastErrorCode).toBe("invalid");
  });

  it("usage events are written with the token counts from the response", async () => {
    const user = await seedUser();
    await seedKey(user._id);
    await extractFor(user._id);

    const events = await usageRepo.listByUser(user._id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "extraction",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 120,
      outputTokens: 45,
    });
  });
});
