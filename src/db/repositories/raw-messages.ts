import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { RawMessage, ThreadClassification } from "@/db/schemas";

const col = () => getDb().collection<RawMessage>("raw_messages");
const classCol = () =>
  getDb().collection<ThreadClassification>("thread_classifications");

export type RawMessageUpsert = Omit<RawMessage, "_id">;

export async function upsertMany(messages: RawMessageUpsert[]): Promise<void> {
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

export async function countForAccount(accountId: ObjectId): Promise<number> {
  return col().countDocuments({ accountId });
}

export async function findByThread(
  accountId: ObjectId,
  threadId: string
): Promise<RawMessage[]> {
  return col().find({ accountId, threadId }).sort({ sentAt: 1 }).toArray();
}

// --- classification cache: a thread is billed to the user at most once -------

export async function findClassifications(
  accountId: ObjectId,
  threadIds: string[]
): Promise<Map<string, ThreadClassification>> {
  if (threadIds.length === 0) return new Map();
  const rows = await classCol()
    .find({ accountId, threadId: { $in: threadIds } })
    .toArray();
  return new Map(rows.map((r) => [r.threadId, r]));
}

export async function saveClassifications(
  entries: Array<Omit<ThreadClassification, "_id" | "at">>
): Promise<void> {
  if (entries.length === 0) return;
  const at = new Date();
  await classCol().bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { accountId: e.accountId, threadId: e.threadId },
        update: { $set: { ...e, at } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
