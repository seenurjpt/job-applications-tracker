// PURE. No I/O, no db, no framework imports.
//
// Assembles per-thread facts from plain message data. The sync pipeline feeds
// the output into status derivation and the application upsert.

import { detectFollowUps, type ThreadMessage } from "./follow-up";

export interface ThreadStats {
  /** First outbound message — the application itself. */
  appliedAt: Date;
  lastOutboundAt: Date;
  lastInboundAt: Date | null;
  lastActivityAt: Date;
  followUpCount: number;
  /** ids of outbound messages that are follow-ups. */
  followUpIds: Set<string>;
}

/**
 * Returns null when the thread has no outbound message — such a thread cannot
 * be an application the user sent.
 */
export function assembleThread(messages: ThreadMessage[]): ThreadStats | null {
  const ordered = [...messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  );

  const outbound = ordered.filter((m) => m.direction === "outbound");
  if (outbound.length === 0) return null;
  const inbound = ordered.filter((m) => m.direction === "inbound");

  const followUpIds = detectFollowUps(ordered);
  const last = ordered[ordered.length - 1]!;

  return {
    appliedAt: outbound[0]!.sentAt,
    lastOutboundAt: outbound[outbound.length - 1]!.sentAt,
    lastInboundAt: inbound.length > 0 ? inbound[inbound.length - 1]!.sentAt : null,
    lastActivityAt: last.sentAt,
    followUpCount: followUpIds.size,
    followUpIds,
  };
}
