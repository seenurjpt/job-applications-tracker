import type { DraftToneValue } from "@/db/schemas";

export const COMPOSE_SYSTEM_PROMPT = `You write short, professional follow-up emails for job applications on behalf of the sender.

Rules:
- Under 120 words. No filler, no apology for following up.
- Reference the specific role and company naturally.
- Never invent facts, achievements, interview dates, or conversation history that
  was not provided.
- No subject line, no signature block, no placeholder brackets — return only the
  email body text, ready to send.
- Write in plain text. No markdown.`;

const TONE_GUIDANCE: Record<DraftToneValue, string> = {
  polite_nudge:
    "Tone: a brief, warm check-in. One sentence restating interest, one asking about the timeline.",
  value_add:
    "Tone: add one concrete, relevant point — a recent achievement provided in the context, or a specific reason for fit — then reaffirm interest.",
  final_check_in:
    "Tone: a respectful final note. Make clear this is the last follow-up, keep the door open, thank them for their time.",
};

export function buildComposeUserMessage(input: {
  company: string | null;
  role: string | null;
  contactName: string | null;
  appliedAt: string; // ISO date
  followUpCount: number;
  daysSinceLastOutbound: number;
  tone: DraftToneValue;
  lastSubject: string;
}): string {
  return [
    TONE_GUIDANCE[input.tone],
    "",
    "Context:",
    `- Company: ${input.company ?? "unknown"}`,
    `- Role: ${input.role ?? "unknown"}`,
    `- Contact: ${input.contactName ?? "unknown (generic inbox)"}`,
    `- Applied on: ${input.appliedAt}`,
    `- Follow-ups already sent: ${input.followUpCount}`,
    `- Days since last outbound email: ${Math.floor(input.daysSinceLastOutbound)}`,
    `- Original subject: ${input.lastSubject}`,
  ].join("\n");
}
