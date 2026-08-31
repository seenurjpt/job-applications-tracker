import type { ObjectId } from "mongodb";
import * as usage from "@/db/repositories/usage";
import type { UsageEvent } from "@/db/schemas";

/** Record token usage from a response's `usage` field (§6.8). */
export async function recordUsage(input: {
  userId: ObjectId;
  kind: UsageEvent["kind"];
  model: string;
  usage: { input_tokens: number; output_tokens: number } | undefined;
  syncJobId?: ObjectId | null;
}): Promise<void> {
  await usage.record({
    userId: input.userId,
    kind: input.kind,
    model: input.model,
    inputTokens: input.usage?.input_tokens ?? 0,
    outputTokens: input.usage?.output_tokens ?? 0,
    syncJobId: input.syncJobId ?? null,
  });
}
