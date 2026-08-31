import type Anthropic from "@anthropic-ai/sdk";
import type { ObjectId } from "mongodb";
import { differenceInMilliseconds } from "date-fns";
import { createMessageWithRetries } from "./call";
import { recordUsage } from "./usage";
import {
  buildComposeUserMessage,
  COMPOSE_SYSTEM_PROMPT,
  type ComposeThreadMessage,
} from "./prompts/compose";
import type { Application, DraftToneValue } from "@/db/schemas";

export interface ComposedDraft {
  subject: string;
  body: string;
}

export interface ComposeExtras {
  /** Name to sign with, mirrored from the reference email when present. */
  senderName: string | null;
  /** Whole thread as stored metadata, oldest first. */
  thread: ComposeThreadMessage[];
  /** Full text of the sender's own earlier email, as a style reference. */
  referenceEmail: string | null;
}

/**
 * Generates a follow-up email body for an application. This is user-visible
 * prose , the draft model (Sonnet by default) is worth its cost here (§6.9).
 */
export async function composeFollowUp(
  deps: { client: Anthropic; model: string; userId: ObjectId },
  application: Pick<
    Application,
    | "company"
    | "role"
    | "contactName"
    | "appliedAt"
    | "followUpCount"
    | "lastOutboundAt"
    | "replyClassification"
  >,
  lastSubject: string,
  tone: DraftToneValue,
  extras: ComposeExtras,
  now = new Date()
): Promise<ComposedDraft> {
  const userMessage = buildComposeUserMessage({
    company: application.company,
    role: application.role,
    contactName: application.contactName,
    senderName: extras.senderName,
    appliedAt: application.appliedAt.toISOString().slice(0, 10),
    followUpCount: application.followUpCount,
    daysSinceLastOutbound:
      differenceInMilliseconds(now, application.lastOutboundAt) / 86_400_000,
    replyClassification: application.replyClassification,
    tone,
    lastSubject,
    thread: extras.thread,
    referenceEmail: extras.referenceEmail,
  });

  // createMessageWithRetries maps key failures to AnthropicKeyError and
  // retries throttling , the same ladder the sync pipeline uses.
  const res = await createMessageWithRetries(deps.client, {
    model: deps.model,
    max_tokens: 1024,
    system: COMPOSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  await recordUsage({
    userId: deps.userId,
    kind: "draft",
    model: deps.model,
    usage: res.usage,
  });
  const body = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const subject = lastSubject.startsWith("Re:")
    ? lastSubject
    : `Re: ${lastSubject}`;
  return { subject, body };
}
