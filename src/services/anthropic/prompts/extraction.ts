export const EXTRACTION_SYSTEM_PROMPT = `You classify email threads as job applications and extract structured details.

For each thread you receive, decide whether it is an email the sender wrote to apply
for a job, or a direct follow-up to such an application.

NOT job applications: newsletters, job alerts from job boards, recruiter cold outreach
TO the user, generic networking messages, interview scheduling for a job the user did
not apply to through email.

Extraction rules:
- company: the hiring organisation, not a recruiting agency, not an ATS vendor. If the
  recipient domain is an ATS (greenhouse.io, lever.co, myworkday.com), infer the company
  from the subject or body instead of the domain.
- role: the job title as written. Do not normalise or expand it.
- contactName: the human recipient, if a specific person. null for careers@ or
  no-reply addresses.
- confidence: your certainty that this is a job application, 0 to 1.
- intent: what the sender's email is doing , "application" (sending the
  application itself), "follow_up" (chasing status after applying),
  "interview" (scheduling, prep, or a post-interview thank-you),
  "negotiation" (offer, salary, joining details), or "other".
- Use null for anything not clearly stated. Never guess.

Return ONLY a JSON array. One object per input thread, in the same order. No preamble,
no markdown fences, no explanation.

[{"threadId": "...", "isJobApplication": bool, "confidence": 0.0-1.0,
  "company": string|null, "role": string|null, "contactName": string|null,
  "source": "direct"|"linkedin"|"ats"|"referral"|"unknown",
  "intent": "application"|"follow_up"|"interview"|"negotiation"|"other"|null}]`;

export const REPAIR_INSTRUCTION = `Your previous response was not valid JSON matching the required schema. Return ONLY the JSON array described in the system prompt , no markdown fences, no prose, one object per input thread in input order.`;

export interface ThreadSummaryInput {
  threadId: string;
  subject: string;
  snippet: string;
  to: string[];
  date: string; // ISO date
}

/**
 * Send subject, snippet, recipients, and date per thread. Do NOT send full
 * message bodies , worse cost, worse signal, and a materially larger
 * third-party data transfer under Google's Limited Use policy (§5.5).
 */
export function buildExtractionUserMessage(threads: ThreadSummaryInput[]): string {
  return JSON.stringify(
    threads.map((t) => ({
      threadId: t.threadId,
      subject: t.subject,
      snippet: t.snippet,
      recipients: t.to,
      date: t.date,
    })),
    null,
    2
  );
}
