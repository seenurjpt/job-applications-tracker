// Intent backfill prompt: classify what the user's latest outbound email in
// each application thread was doing, from stored metadata only.

import { redactForModel } from "@/domain/redact";

export const INTENT_SYSTEM_PROMPT = `You classify what the sender's LATEST outbound email in a job-application thread is doing.

Intents, with decision rules:
- "application": the email submits the candidacy itself , a cover letter,
  expression of interest, or resume submission. Usually the first outbound
  message in the thread.
- "follow_up": chasing a response after applying , "any update?", "checking
  in", "wanted to follow up", re-sending materials after silence.
- "interview": anything around interviews , scheduling or rescheduling,
  confirming a time, preparation questions, or a post-interview thank-you.
- "negotiation": offer-stage discussion , salary, compensation, joining date,
  notice period, paperwork, accepting or declining an offer.
- "other": none of the above (e.g. withdrawing, referral chatter, admin).

Tie-breaks:
- Classify the LATEST outbound message, using the earlier messages only as
  context for what stage the conversation had reached.
- A thank-you AFTER an interview is "interview", not "follow_up".
- Asking about the status of an interviewed application is "follow_up".
- If the thread shows an offer was made, money/date talk is "negotiation".
- When genuinely ambiguous between "application" and "follow_up": the first
  outbound message in a thread is "application"; later ones are "follow_up".

Return ONLY a JSON array, one object per input, same order. No preamble, no
markdown fences.

[{"id": "...", "intent": "application"|"follow_up"|"interview"|"negotiation"|"other"}]`;

export interface IntentInput {
  id: string;
  /** Sender's outbound messages, oldest first (subject + snippet + date). */
  outbound: Array<{ date: string; subject: string; snippet: string }>;
  /** Whether the company has replied in this thread. */
  hasReply: boolean;
}

export function buildIntentUserMessage(items: IntentInput[]): string {
  return JSON.stringify(
    items.map((i) => ({
      id: i.id,
      companyReplied: i.hasReply,
      outboundMessages: i.outbound.map((m) => ({
        date: m.date,
        subject: redactForModel(m.subject),
        snippet: redactForModel(m.snippet),
      })),
    })),
    null,
    2
  );
}
