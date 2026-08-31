import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ObjectId } from "mongodb";
import { logger } from "@/lib/logger";
import { AnthropicKeyError, createMessageWithRetries } from "./call";
import { recordUsage } from "./usage";
import {
  buildExtractionUserMessage,
  EXTRACTION_SYSTEM_PROMPT,
  REPAIR_INSTRUCTION,
  type ThreadSummaryInput,
} from "./prompts/extraction";

export const extractionResultSchema = z.object({
  threadId: z.string(),
  isJobApplication: z.boolean(),
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  role: z.string().nullable(),
  contactName: z.string().nullable(),
  source: z.enum(["direct", "linkedin", "ats", "referral", "unknown"]),
  // Tolerant on purpose: an older cached response or a model that omits or
  // mangles the field must not invalidate the whole batch.
  intent: z
    .enum(["application", "follow_up", "interview", "negotiation", "other"])
    .nullable()
    .catch(null),
});

export const extractionBatchSchema = z.array(extractionResultSchema);

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export { AnthropicKeyError } from "./call";

export const EXTRACTION_BATCH_SIZE = 10;

/** Strip ```json fences defensively before parsing (§5.5). */
export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

interface ExtractDeps {
  client: Anthropic;
  model: string;
  userId: ObjectId;
  syncJobId: ObjectId | null;
}

/**
 * One messages.create call through the shared retry ladder (see call.ts),
 * recording token usage from the response (§6.8).
 */
async function callModel(
  deps: ExtractDeps,
  messages: Anthropic.MessageParam[],
  kind: "extraction" | "reply_classification" = "extraction",
  system: string = EXTRACTION_SYSTEM_PROMPT
): Promise<string> {
  const res = await createMessageWithRetries(deps.client, {
    model: deps.model,
    max_tokens: 4096,
    system,
    messages,
  });
  await recordUsage({
    userId: deps.userId,
    kind,
    model: deps.model,
    usage: res.usage,
    syncJobId: deps.syncJobId,
  });
  return textOf(res);
}

function parseBatch(raw: string): ExtractionResult[] {
  const json: unknown = JSON.parse(stripFences(raw));
  return extractionBatchSchema.parse(json);
}

/**
 * Classify a batch of up to 10 threads. Never trusts the LLM's output shape:
 * the response is Zod-validated before anything touches the database (§0.3).
 *
 * Failure ladder: parse → retry once with a repair instruction → fall back to
 * per-thread calls. One bad thread must not discard the other nine.
 */
export async function extractThreadBatch(
  deps: ExtractDeps,
  threads: ThreadSummaryInput[]
): Promise<ExtractionResult[]> {
  if (threads.length === 0) return [];
  const userMessage = buildExtractionUserMessage(threads);

  const first = await callModel(deps, [{ role: "user", content: userMessage }]);
  try {
    return parseBatch(first);
  } catch {
    logger.warn("Extraction response failed validation; retrying with repair");
  }

  const repaired = await callModel(deps, [
    { role: "user", content: userMessage },
    { role: "assistant", content: first.slice(0, 4000) },
    { role: "user", content: REPAIR_INSTRUCTION },
  ]);
  try {
    return parseBatch(repaired);
  } catch {
    logger.warn("Repair attempt failed; falling back to per-thread calls");
  }

  // Per-thread fallback , a malformed response for one thread must not
  // discard the rest of the batch.
  const results: ExtractionResult[] = [];
  for (const thread of threads) {
    try {
      const single = await callModel(deps, [
        { role: "user", content: buildExtractionUserMessage([thread]) },
      ]);
      const parsed = parseBatch(single);
      if (parsed[0]) results.push(parsed[0]);
    } catch (e) {
      if (e instanceof AnthropicKeyError) throw e;
      logger.warn("Per-thread extraction failed; skipping thread", {
        threadId: thread.threadId,
      });
    }
  }
  return results;
}

const intentBatchSchema = z.array(
  z.object({
    id: z.string(),
    intent: z.enum(["application", "follow_up", "interview", "negotiation", "other"]),
  })
);

/**
 * Classifies the intent of the latest outbound mail for a batch of
 * applications (on-demand backfill for rows synced before the intent field
 * existed). Receives the whole outbound side of each thread plus whether the
 * company replied, so stage-dependent intents (interview thank-yous, offer
 * talk) classify correctly. Returns only the successfully classified items.
 */
export async function classifyIntentBatch(
  deps: ExtractDeps,
  items: Array<import("./prompts/intent").IntentInput>
): Promise<Map<string, "application" | "follow_up" | "interview" | "negotiation" | "other">> {
  const out = new Map<
    string,
    "application" | "follow_up" | "interview" | "negotiation" | "other"
  >();
  if (items.length === 0) return out;
  const { INTENT_SYSTEM_PROMPT, buildIntentUserMessage } = await import(
    "./prompts/intent"
  );
  try {
    const raw = await callModel(
      deps,
      [{ role: "user", content: buildIntentUserMessage(items) }],
      "extraction",
      INTENT_SYSTEM_PROMPT
    );
    for (const r of intentBatchSchema.parse(JSON.parse(stripFences(raw)))) {
      out.set(r.id, r.intent);
    }
  } catch (e) {
    if (e instanceof AnthropicKeyError) throw e;
    logger.warn("Intent batch classification failed; skipping batch");
  }
  return out;
}

const replySchema = z.object({
  classification: z.enum(["positive", "rejection", "neutral"]),
});

export async function classifyReply(
  deps: ExtractDeps,
  input: { subject: string; snippet: string }
): Promise<"positive" | "rejection" | "neutral" | null> {
  const { REPLY_CLASSIFICATION_SYSTEM_PROMPT, buildReplyClassificationUserMessage } =
    await import("./prompts/classify-reply");
  try {
    const raw = await callModel(
      deps,
      [{ role: "user", content: buildReplyClassificationUserMessage(input) }],
      "reply_classification",
      REPLY_CLASSIFICATION_SYSTEM_PROMPT
    );
    return replySchema.parse(JSON.parse(stripFences(raw))).classification;
  } catch (e) {
    if (e instanceof AnthropicKeyError) throw e;
    logger.warn("Reply classification failed; leaving unclassified");
    return null;
  }
}
