import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { UsageEvent } from "@/db/schemas";

const col = () => getDb().collection<UsageEvent>("usage_events");

export async function record(input: {
  userId: ObjectId;
  kind: UsageEvent["kind"];
  model: string;
  inputTokens: number;
  outputTokens: number;
  syncJobId: ObjectId | null;
}): Promise<void> {
  await col().insertOne({
    _id: new ObjectId(),
    userId: input.userId,
    at: new Date(),
    kind: input.kind,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    syncJobId: input.syncJobId,
  });
}

export interface UsageSummaryRow {
  kind: UsageEvent["kind"];
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** Tokens used since `from`, broken down by kind (§6.8). */
export async function summarySince(
  userId: ObjectId,
  from: Date
): Promise<UsageSummaryRow[]> {
  return col()
    .aggregate<UsageSummaryRow>([
      { $match: { userId, at: { $gte: from } } },
      {
        $group: {
          _id: "$kind",
          calls: { $sum: 1 },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
      {
        $project: {
          _id: 0,
          kind: "$_id",
          calls: 1,
          inputTokens: 1,
          outputTokens: 1,
        },
      },
    ])
    .toArray();
}

export async function listByUser(userId: ObjectId): Promise<UsageEvent[]> {
  return col().find({ userId }).sort({ at: -1 }).limit(500).toArray();
}
