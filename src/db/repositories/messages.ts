import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { Message } from "@/db/schemas";

const col = () => getDb().collection<Message>("messages");

export type MessageUpsert = Omit<Message, "_id">;

/**
 * Idempotent by the unique {accountId, gmailMessageId} index.
 */
export async function upsertMany(messages: MessageUpsert[]): Promise<void> {
  if (messages.length === 0) return;
  await col().bulkWrite(
    messages.map((m) => ({
      updateOne: {
        filter: { accountId: m.accountId, gmailMessageId: m.gmailMessageId },
        update: { $set: m },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

export async function findByApplication(
  applicationId: ObjectId
): Promise<Message[]> {
  return col().find({ applicationId }).sort({ sentAt: 1 }).toArray();
}

export async function findByThread(
  accountId: ObjectId,
  threadId: string
): Promise<Message[]> {
  return col().find({ accountId, threadId }).sort({ sentAt: 1 }).toArray();
}

export async function countForAccount(accountId: ObjectId): Promise<number> {
  return col().countDocuments({ accountId });
}
