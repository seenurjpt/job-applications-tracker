import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { AccountStatusValue, GmailAccount } from "@/db/schemas";

const col = () => getDb().collection<GmailAccount>("gmail_accounts");

export async function findById(id: ObjectId): Promise<GmailAccount | null> {
  return col().findOne({ _id: id });
}

export async function findByUser(userId: ObjectId): Promise<GmailAccount[]> {
  return col().find({ userId }).sort({ connectedAt: 1 }).toArray();
}

export async function upsertConnection(input: {
  userId: ObjectId;
  email: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
  scopes: string[];
}): Promise<GmailAccount> {
  const res = await col().findOneAndUpdate(
    { userId: input.userId, email: input.email },
    {
      $set: {
        accessTokenEnc: input.accessTokenEnc,
        refreshTokenEnc: input.refreshTokenEnc,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        status: "active",
      },
      $setOnInsert: {
        userId: input.userId,
        email: input.email,
        historyId: null,
        lastSyncAt: null,
        connectedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!res) throw new Error("upsertConnection returned no document");
  return res;
}

export async function setStatus(
  id: ObjectId,
  status: AccountStatusValue
): Promise<void> {
  await col().updateOne({ _id: id }, { $set: { status } });
}

export async function updateTokens(
  id: ObjectId,
  update: { accessTokenEnc: string; expiresAt: Date }
): Promise<void> {
  await col().updateOne({ _id: id }, { $set: update });
}

export async function setHistoryId(
  id: ObjectId,
  historyId: string | null
): Promise<void> {
  await col().updateOne({ _id: id }, { $set: { historyId } });
}

export async function setLastSyncAt(id: ObjectId, at: Date): Promise<void> {
  await col().updateOne({ _id: id }, { $set: { lastSyncAt: at } });
}

/** Disconnecting a mailbox purges its messages, applications, and drafts (§10). */
export async function disconnectAndPurge(id: ObjectId): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.collection("messages").deleteMany({ accountId: id }),
    db.collection("drafts").deleteMany({ accountId: id }),
    db.collection("applications").deleteMany({ accountId: id }),
    db.collection("sync_jobs").deleteMany({ accountId: id }),
  ]);
  await col().deleteOne({ _id: id });
}
