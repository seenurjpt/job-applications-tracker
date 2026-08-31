// PURE. No I/O, no db, no framework imports.

export interface ThreadMessage {
  id: string;
  direction: "outbound" | "inbound";
  sentAt: Date;
}

/**
 * Returns the ids of outbound messages that are follow-ups.
 *
 * An outbound message is a follow-up ONLY if no inbound message arrived
 * between it and the previous outbound message. If a reply came in between,
 * it's a conversation, not a nudge.
 *
 * The first outbound message is the application itself, never a follow-up.
 */
export function detectFollowUps(messages: ThreadMessage[]): Set<string> {
  const ordered = [...messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  );

  const followUps = new Set<string>();
  let seenOutbound = false;
  let inboundSinceLastOutbound = false;

  for (const m of ordered) {
    if (m.direction === "inbound") {
      inboundSinceLastOutbound = true;
      continue;
    }
    if (seenOutbound && !inboundSinceLastOutbound) {
      followUps.add(m.id);
    }
    seenOutbound = true;
    inboundSinceLastOutbound = false;
  }

  return followUps;
}
