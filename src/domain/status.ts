// PURE. No I/O, no db, no framework imports.
// The status union is declared locally so the domain layer has zero imports
// from db/. It must stay assignable to ApplicationStatus in db/schemas.ts ,
// a unit test asserts the two stay in sync.

export type DerivedApplicationStatus =
  | "applied"
  | "needs_follow_up"
  | "replied"
  | "interviewing"
  | "rejected"
  | "ghosted";

export type ReplyClassification = "positive" | "rejection" | "neutral";

export interface StatusInput {
  lastOutboundAt: Date;
  lastInboundAt: Date | null;
  replyClassification: ReplyClassification | null;
  now: Date;
}

export interface StatusConfig {
  followUpAfterDays: number; // default 7
  ghostAfterDays: number; // default 30
}

export const DEFAULT_STATUS_CONFIG: StatusConfig = {
  followUpAfterDays: 7,
  ghostAfterDays: 30,
};

export function deriveStatus(
  i: StatusInput,
  c: StatusConfig
): DerivedApplicationStatus {
  const daysSinceOutbound =
    (i.now.getTime() - i.lastOutboundAt.getTime()) / 86_400_000;

  if (i.lastInboundAt) {
    if (i.replyClassification === "rejection") return "rejected";
    if (i.replyClassification === "positive") return "interviewing";
    return "replied";
  }

  if (daysSinceOutbound >= c.ghostAfterDays) return "ghosted";
  if (daysSinceOutbound >= c.followUpAfterDays) return "needs_follow_up";
  return "applied";
}
