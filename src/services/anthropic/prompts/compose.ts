import type { DraftToneValue } from "@/db/schemas";

export const COMPOSE_SYSTEM_PROMPT = `You write follow-up emails for job applications on behalf of the sender. Your output must read as if the sender wrote it themselves.

Style , the most important rule:
- A REFERENCE EMAIL (the sender's own, from this thread) may be provided. Mirror
  it faithfully: the same greeting style ("Dear X," / "Hi X," / "Hello team,"),
  the same paragraph rhythm and line-break formatting, a similar level of
  formality, and the SAME closing and signature (e.g. "Best regards,\\nName").
- If no reference email is provided, use a professional default: a greeting
  using the contact's first name if known (otherwise "Hi," or "Dear Hiring
  Team,"), short paragraphs separated by blank lines, and end with
  "Best regards," followed by the sender's name on the next line.

Content:
- Under 150 words of body text. No filler, never apologise for following up.
- Reference the specific role and company naturally.
- Ground every claim in the provided thread context. NEVER invent facts,
  achievements, interview dates, names, or conversation history that was not
  provided.
- If the thread shows a reply from the company, acknowledge the conversation
  naturally instead of writing as if there was silence.
- Mention how long it has been only when it strengthens the note (e.g. "since
  applying two weeks ago") , never sound like a countdown.

Format:
- Plain text only. No markdown, no placeholder brackets, no subject line.
- Separate paragraphs with a single blank line.
- Return ONLY the complete email body, greeting through signature, ready to
  send exactly as-is.`;

const TONE_GUIDANCE: Record<DraftToneValue, string> = {
  polite_nudge:
    "Tone: a brief, warm check-in. Restate interest in one sentence, ask about the timeline or next steps in another. Light, confident, easy to answer.",
  value_add:
    "Tone: lead with one concrete, relevant point drawn ONLY from the provided context (a specific skill or experience already mentioned in the reference email, or a concrete reason for fit with this role), then reaffirm interest. Make the email worth reading on its own.",
  final_check_in:
    "Tone: a respectful final note. Make clear this is the last follow-up, keep the door open for the future, and thank them genuinely for their time.",
};

export interface ComposeThreadMessage {
  direction: "outbound" | "inbound";
  date: string; // ISO date
  subject: string;
  snippet: string;
}

export function buildComposeUserMessage(input: {
  company: string | null;
  role: string | null;
  contactName: string | null;
  senderName: string | null;
  appliedAt: string; // ISO date
  followUpCount: number;
  daysSinceLastOutbound: number;
  replyClassification: "positive" | "rejection" | "neutral" | null;
  tone: DraftToneValue;
  lastSubject: string;
  thread: ComposeThreadMessage[];
  referenceEmail: string | null;
}): string {
  const lines = [
    TONE_GUIDANCE[input.tone],
    "",
    "Context:",
    `- Company: ${input.company ?? "unknown"}`,
    `- Role: ${input.role ?? "unknown"}`,
    `- Contact: ${input.contactName ?? "unknown (generic inbox)"}`,
    `- Sender (signature name): ${input.senderName ?? "unknown"}`,
    `- Applied on: ${input.appliedAt}`,
    `- Follow-ups already sent: ${input.followUpCount}`,
    `- Days since last outbound email: ${Math.floor(input.daysSinceLastOutbound)}`,
    `- Company reply so far: ${input.replyClassification ?? "none"}`,
    `- Original subject: ${input.lastSubject}`,
    "",
    "Thread so far (oldest first, snippets only):",
    ...input.thread.map(
      (m) =>
        `- [${m.direction === "outbound" ? "sender" : "company"} · ${m.date}] ${m.subject}: ${m.snippet}`
    ),
  ];
  if (input.referenceEmail) {
    lines.push(
      "",
      "REFERENCE EMAIL (the sender's own earlier email in this thread , match its greeting, formatting, tone, and signature):",
      "---",
      input.referenceEmail,
      "---"
    );
  }
  return lines.join("\n");
}
