export const REPLY_CLASSIFICATION_SYSTEM_PROMPT = `You classify replies to job applications.

Given the subject and snippet of an inbound reply to a job application, classify it:
- "positive": interview invitation, request for availability, moving forward, assessment/test invitation
- "rejection": position filled, not moving forward, no longer considering
- "neutral": acknowledgement, auto-reply, "we received your application", anything ambiguous

Return ONLY a JSON object: {"classification": "positive"|"rejection"|"neutral"}
No preamble, no markdown fences.`;

import { redactForModel } from "@/domain/redact";

export function buildReplyClassificationUserMessage(input: {
  subject: string;
  snippet: string;
}): string {
  return JSON.stringify({
    subject: redactForModel(input.subject),
    snippet: redactForModel(input.snippet),
  });
}
