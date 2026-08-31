import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { addHours, subDays } from "date-fns";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { fingerprint } from "@/services/anthropic/keys";
import { getDb } from "@/db/client";
import { ensureIndexes } from "@/db/indexes";
import * as usersRepo from "@/db/repositories/users";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import type { Application, Message } from "@/db/schemas";

/**
 * E2E-ONLY seeding endpoint. Registered behavior is refused entirely unless
 * E2E_TEST_MODE is set, and the env schema refuses that flag in production.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!env.E2E_TEST_MODE) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    op: string;
    email?: string;
    status?: string;
    count?: number;
  };
  const db = getDb();

  if (body.op === "reset") {
    for (const c of await db.collections()) {
      await c.deleteMany({});
    }
    await ensureIndexes(db);
    return NextResponse.json({ ok: true });
  }

  if (!body.email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const user = await usersRepo.upsertByEmail({
    email: body.email,
    name: "E2E User",
    image: null,
  });

  switch (body.op) {
    case "connect-gmail": {
      const account = await accountsRepo.upsertConnection({
        userId: user._id,
        email: body.email,
        accessTokenEnc: encrypt("e2e-access-token"),
        refreshTokenEnc: encrypt("e2e-refresh-token"),
        expiresAt: addHours(new Date(), 1),
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose",
        ],
      });
      return NextResponse.json({ ok: true, accountId: account._id.toHexString() });
    }
    case "set-account-status": {
      const accounts = await accountsRepo.findByUser(user._id);
      const account = accounts[0];
      if (!account) return NextResponse.json({ error: "no account" }, { status: 400 });
      await accountsRepo.setStatus(
        account._id,
        body.status as "active" | "needs_reconnect" | "revoked"
      );
      return NextResponse.json({ ok: true });
    }
    case "seed-key": {
      const key = "sk-ant-e2e-test-key-000000000000a4f2";
      await apiKeysRepo.upsert(user._id, {
        keyEnc: encrypt(key),
        keyHint: key.slice(-4),
        fingerprint: fingerprint(key),
        status: (body.status ?? "valid") as "valid",
        extractionModel: env.ANTHROPIC_EXTRACTION_MODEL,
        draftModel: env.ANTHROPIC_DRAFT_MODEL,
      });
      return NextResponse.json({ ok: true });
    }
    case "seed-applications": {
      const accounts = await accountsRepo.findByUser(user._id);
      const account = accounts[0];
      if (!account) return NextResponse.json({ error: "no account" }, { status: 400 });
      const count = body.count ?? 5;
      const now = new Date();
      const apps = db.collection<Application>("applications");
      const msgs = db.collection<Message>("messages");
      for (let i = 0; i < count; i++) {
        const appId = new ObjectId();
        const threadId = `e2e-thread-${i}`;
        const appliedAt = subDays(now, count - i);
        await apps.updateOne(
          { accountId: account._id, threadId },
          {
            $set: {
              userId: user._id,
              accountId: account._id,
              threadId,
              company: `Company ${i}`,
              role: `Engineer ${i}`,
              contactName: null,
              contactEmail: `careers@company${i}.example.com`,
              source: "direct" as const,
              appliedAt,
              lastOutboundAt: appliedAt,
              lastInboundAt: null,
              lastActivityAt: appliedAt,
              status: i % 2 === 0 ? ("applied" as const) : ("needs_follow_up" as const),
              statusOverriddenByUser: false,
              followUpCount: 0,
              replyClassification: null,
              confidence: 0.95,
              extractedBy: "e2e",
              userEditedFields: [],
              createdAt: now,
              updatedAt: now,
            },
            $setOnInsert: { _id: appId },
          },
          { upsert: true }
        );
        const stored = await apps.findOne({ accountId: account._id, threadId });
        await msgs.updateOne(
          { accountId: account._id, gmailMessageId: `e2e-msg-${i}` },
          {
            $set: {
              applicationId: stored!._id,
              accountId: account._id,
              gmailMessageId: `e2e-msg-${i}`,
              threadId,
              direction: "outbound" as const,
              subject: `Application for Engineer ${i}`,
              snippet: "Please find my resume attached.",
              from: body.email,
              to: [`careers@company${i}.example.com`],
              sentAt: appliedAt,
              rfcMessageId: `<e2e-${i}@mail.example.com>`,
              references: [],
              isFollowUp: false,
            },
          },
          { upsert: true }
        );
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
}
