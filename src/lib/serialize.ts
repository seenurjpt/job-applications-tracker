// DTOs crossing the server→client boundary. ObjectIds and Dates become
// strings; encrypted fields and keys NEVER appear here.

import type { Application, Draft, GmailAccount, Message, SyncJob } from "@/db/schemas";

/**
 * Gmail snippets come back HTML-entity-encoded ("I&#39;d", "&amp;"). Decode
 * for display; `&amp;` last so double-encoded input can't smuggle entities.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export interface ApplicationDTO {
  id: string;
  threadId: string;
  company: string | null;
  role: string | null;
  contactName: string | null;
  contactEmail: string | null;
  source: Application["source"];
  appliedAt: string;
  lastOutboundAt: string;
  lastInboundAt: string | null;
  lastActivityAt: string;
  status: Application["status"];
  statusOverriddenByUser: boolean;
  followUpCount: number;
  confidence: number;
  userEditedFields: string[];
}

export function toApplicationDTO(a: Application): ApplicationDTO {
  return {
    id: a._id.toHexString(),
    threadId: a.threadId,
    company: a.company ? decodeEntities(a.company) : a.company,
    role: a.role ? decodeEntities(a.role) : a.role,
    contactName: a.contactName,
    contactEmail: a.contactEmail,
    source: a.source,
    appliedAt: a.appliedAt.toISOString(),
    lastOutboundAt: a.lastOutboundAt.toISOString(),
    lastInboundAt: a.lastInboundAt?.toISOString() ?? null,
    lastActivityAt: a.lastActivityAt.toISOString(),
    status: a.status,
    statusOverriddenByUser: a.statusOverriddenByUser,
    followUpCount: a.followUpCount,
    confidence: a.confidence,
    userEditedFields: a.userEditedFields,
  };
}

export interface MessageDTO {
  id: string;
  direction: Message["direction"];
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  sentAt: string;
  isFollowUp: boolean;
}

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m._id.toHexString(),
    direction: m.direction,
    subject: decodeEntities(m.subject),
    snippet: decodeEntities(m.snippet),
    from: m.from,
    to: m.to,
    sentAt: m.sentAt.toISOString(),
    isFollowUp: m.isFollowUp,
  };
}

export interface AccountDTO {
  id: string;
  email: string;
  status: GmailAccount["status"];
  lastSyncAt: string | null;
}

export function toAccountDTO(a: GmailAccount): AccountDTO {
  return {
    id: a._id.toHexString(),
    email: a.email,
    status: a.status,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
  };
}

export interface SyncJobDTO {
  id: string;
  type: SyncJob["type"];
  status: SyncJob["status"];
  pausedReason: string | null;
  stats: SyncJob["stats"];
  error: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
}

export function toSyncJobDTO(j: SyncJob): SyncJobDTO {
  return {
    id: j._id.toHexString(),
    type: j.type,
    status: j.status,
    pausedReason: j.pausedReason,
    stats: j.stats,
    error: j.error,
    startedAt: j.startedAt?.toISOString() ?? null,
    heartbeatAt: j.heartbeatAt?.toISOString() ?? null,
  };
}

export interface DraftDTO {
  id: string;
  applicationId: string;
  subject: string;
  body: string;
  tone: Draft["tone"];
  status: Draft["status"];
  error: string | null;
}

export function toDraftDTO(d: Draft): DraftDTO {
  return {
    id: d._id.toHexString(),
    applicationId: d.applicationId.toHexString(),
    subject: d.subject,
    body: d.body,
    tone: d.tone,
    status: d.status,
    error: d.error,
  };
}
