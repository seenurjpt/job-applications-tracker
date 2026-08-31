import type { Db } from "mongodb";

/** Run on boot. Idempotent , createIndex is a no-op when the index exists. */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  await db
    .collection("gmail_accounts")
    .createIndex({ userId: 1, email: 1 }, { unique: true });

  // The unique index on {accountId, threadId} is what makes the whole sync
  // idempotent , re-running a backfill upserts rather than duplicating.
  await db
    .collection("applications")
    .createIndex({ accountId: 1, threadId: 1 }, { unique: true });
  await db.collection("applications").createIndex({ userId: 1, appliedAt: -1 });
  await db
    .collection("applications")
    .createIndex({ userId: 1, status: 1, lastActivityAt: -1 });
  await db
    .collection("applications")
    .createIndex({ company: "text", role: "text", contactName: "text" });

  await db
    .collection("raw_messages")
    .createIndex({ accountId: 1, gmailMessageId: 1 }, { unique: true });
  await db.collection("raw_messages").createIndex({ accountId: 1, threadId: 1 });

  await db
    .collection("thread_classifications")
    .createIndex({ accountId: 1, threadId: 1 }, { unique: true });

  await db
    .collection("messages")
    .createIndex({ accountId: 1, gmailMessageId: 1 }, { unique: true });
  await db.collection("messages").createIndex({ applicationId: 1, sentAt: 1 });

  await db.collection("drafts").createIndex({ applicationId: 1, createdAt: -1 });
  await db.collection("sync_jobs").createIndex({ accountId: 1, status: 1 });

  await db
    .collection("user_api_keys")
    .createIndex({ userId: 1, provider: 1 }, { unique: true });
  await db.collection("usage_events").createIndex({ userId: 1, at: -1 });
}
