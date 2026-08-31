// Backfill prompt: classify the intent of the user's latest outbound email
// per application, from stored subject+snippet only (no Gmail calls).

export const INTENT_SYSTEM_PROMPT = `You classify what a sent email is doing in a job-application thread.

For each input, pick exactly one intent:
- "application": sending the job application itself (cover letter, resume, interest in a role)
- "follow_up": chasing the status of an application already sent
- "interview": interview scheduling, preparation, or a post-interview thank-you
- "negotiation": offer discussion, salary, joining date, paperwork
- "other": anything else

Return ONLY a JSON array, one object per input, same order. No preamble, no
markdown fences.

[{"id": "...", "intent": "application"|"follow_up"|"interview"|"negotiation"|"other"}]`;

export interface IntentInput {
  id: string;
  subject: string;
  snippet: string;
}

export function buildIntentUserMessage(items: IntentInput[]): string {
  return JSON.stringify(
    items.map((i) => ({ id: i.id, subject: i.subject, snippet: i.snippet })),
    null,
    2
  );
}
