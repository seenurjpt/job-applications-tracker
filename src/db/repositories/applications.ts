import { ObjectId, type Filter, type Sort } from "mongodb";
import { getDb } from "@/db/client";
import type {
  Application,
  ApplicationSourceValue,
  ApplicationStatusValue,
  MailIntentValue,
} from "@/db/schemas";

const col = () => getDb().collection<Application>("applications");

export async function findById(id: ObjectId): Promise<Application | null> {
  return col().findOne({ _id: id });
}

export async function findByThread(
  accountId: ObjectId,
  threadId: string
): Promise<Application | null> {
  return col().findOne({ accountId, threadId });
}

export interface ApplicationQuery {
  userId: ObjectId;
  status?: ApplicationStatusValue;
  appliedFrom?: Date;
  appliedTo?: Date;
  search?: string;
  sortBy?: "appliedAt" | "lastActivityAt" | "company" | "status";
  sortDir?: "asc" | "desc";
  limit?: number;
  skip?: number;
}

export async function query(q: ApplicationQuery): Promise<{
  items: Application[];
  total: number;
}> {
  const filter: Filter<Application> = { userId: q.userId };
  if (q.status) filter.status = q.status;
  else filter.status = { $ne: "not_an_application" };
  if (q.appliedFrom || q.appliedTo) {
    filter.appliedAt = {
      ...(q.appliedFrom ? { $gte: q.appliedFrom } : {}),
      ...(q.appliedTo ? { $lte: q.appliedTo } : {}),
    };
  }
  if (q.search) filter.$text = { $search: q.search };

  const sort: Sort = { [q.sortBy ?? "appliedAt"]: q.sortDir === "asc" ? 1 : -1 };
  const [items, total] = await Promise.all([
    col()
      .find(filter)
      .sort(sort)
      .skip(q.skip ?? 0)
      .limit(q.limit ?? 100)
      .toArray(),
    col().countDocuments(filter),
  ]);
  return { items, total };
}

export interface ExtractionUpsert {
  userId: ObjectId;
  accountId: ObjectId;
  threadId: string;
  company: string | null;
  role: string | null;
  contactName: string | null;
  contactEmail: string | null;
  source: ApplicationSourceValue;
  appliedAt: Date;
  lastOutboundAt: Date;
  lastInboundAt: Date | null;
  lastActivityAt: Date;
  status: ApplicationStatusValue;
  followUpCount: number;
  confidence: number;
  extractedBy: string;
  mailIntent: MailIntentValue | null;
}

/**
 * Idempotent upsert keyed by the unique {accountId, threadId} index.
 * User edits win: any field named in userEditedFields is never overwritten,
 * and a user-overridden status is preserved (§0.6).
 */
export async function upsertFromExtraction(
  input: ExtractionUpsert
): Promise<Application> {
  const now = new Date();
  const existing = await findByThread(input.accountId, input.threadId);

  const editable: Array<keyof ExtractionUpsert> = [
    "company",
    "role",
    "contactName",
    "contactEmail",
    "source",
  ];

  const $set: Record<string, unknown> = {
    appliedAt: input.appliedAt,
    lastOutboundAt: input.lastOutboundAt,
    lastInboundAt: input.lastInboundAt,
    lastActivityAt: input.lastActivityAt,
    followUpCount: input.followUpCount,
    confidence: input.confidence,
    extractedBy: input.extractedBy,
    updatedAt: now,
  };
  // Never null out an intent we already have (cache-hit re-hydrations).
  if (input.mailIntent !== null || !existing?.mailIntent) {
    $set.mailIntent = input.mailIntent;
  }

  const edited = new Set(existing?.userEditedFields ?? []);
  for (const field of editable) {
    if (!edited.has(field)) $set[field] = input[field];
  }
  if (!existing?.statusOverriddenByUser) $set.status = input.status;

  const res = await col().findOneAndUpdate(
    { accountId: input.accountId, threadId: input.threadId },
    {
      $set,
      $setOnInsert: {
        userId: input.userId,
        statusOverriddenByUser: false,
        replyClassification: null,
        userEditedFields: [],
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!res) throw new Error("upsertFromExtraction returned no document");
  return res;
}

/** Applications still lacking an AI mail-intent flag (for on-demand backfill). */
export async function findMissingIntent(
  userId: ObjectId,
  limit = 200
): Promise<Application[]> {
  return col()
    .find({
      userId,
      status: { $ne: "not_an_application" },
      $or: [{ mailIntent: null }, { mailIntent: { $exists: false } }],
    })
    .limit(limit)
    .toArray();
}

export async function setMailIntent(
  id: ObjectId,
  intent: MailIntentValue
): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { mailIntent: intent, updatedAt: new Date() } }
  );
}

/** Inline edit from the UI. Records the field so no sync ever overwrites it. */
export async function applyUserEdit(
  id: ObjectId,
  userId: ObjectId,
  edits: Partial<
    Pick<Application, "company" | "role" | "contactName" | "contactEmail" | "source">
  >
): Promise<Application | null> {
  const fields = Object.keys(edits);
  if (fields.length === 0) return findById(id);
  return col().findOneAndUpdate(
    { _id: id, userId },
    {
      $set: { ...edits, updatedAt: new Date() },
      $addToSet: { userEditedFields: { $each: fields } },
    },
    { returnDocument: "after" }
  );
}

export async function overrideStatus(
  id: ObjectId,
  userId: ObjectId,
  status: ApplicationStatusValue
): Promise<void> {
  await col().updateOne(
    { _id: id, userId },
    { $set: { status, statusOverriddenByUser: true, updatedAt: new Date() } }
  );
}

/** Re-derivation after new messages arrive. Skips user-overridden statuses. */
export async function updateDerived(
  id: ObjectId,
  update: {
    status: ApplicationStatusValue;
    followUpCount: number;
    lastOutboundAt: Date;
    lastInboundAt: Date | null;
    lastActivityAt: Date;
    replyClassification?: "positive" | "rejection" | "neutral" | null;
  }
): Promise<void> {
  const { status, ...rest } = update;
  await col().updateOne(
    { _id: id },
    { $set: { ...rest, updatedAt: new Date() } }
  );
  await col().updateOne(
    { _id: id, statusOverriddenByUser: { $ne: true } },
    { $set: { status } }
  );
}

export async function countByStatus(
  userId: ObjectId
): Promise<Record<string, number>> {
  const rows = await col()
    .aggregate<{ _id: string; n: number }>([
      { $match: { userId } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}
