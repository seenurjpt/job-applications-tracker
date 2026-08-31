import { z } from "zod";
import { ObjectId } from "mongodb";

const objectId = z.instanceof(ObjectId);

// ---------------------------------------------------------------------------
// Users (Auth.js JWT sessions; we keep our own user record keyed by email)
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  _id: objectId,
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  settings: z.object({
    followUpAfterDays: z.number().int().min(1).default(7),
    ghostAfterDays: z.number().int().min(1).default(30),
    // Gmail date operators use the MAILBOX timezone (§5.3); we cannot read it
    // from the API, so the user can correct it in settings.
    timezone: z.string().default("UTC"),
  }),
  createdAt: z.date(),
});

// ---------------------------------------------------------------------------
// Gmail accounts
// ---------------------------------------------------------------------------

export const AccountStatus = z.enum([
  "active",
  "needs_reconnect", // invalid_grant , user must re-consent
  "revoked",
]);

export const gmailAccountSchema = z.object({
  _id: objectId,
  userId: objectId,
  email: z.string().email(),
  accessTokenEnc: z.string(),
  refreshTokenEnc: z.string(),
  expiresAt: z.date(),
  scopes: z.array(z.string()),
  historyId: z.string().nullable(),
  lastSyncAt: z.date().nullable(),
  status: AccountStatus,
  connectedAt: z.date(),
});

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const ApplicationStatus = z.enum([
  "applied",
  "needs_follow_up",
  "replied",
  "interviewing",
  "rejected",
  "ghosted",
  "not_an_application", // user-corrected false positive
]);

export const ApplicationSource = z.enum([
  "direct",
  "linkedin",
  "ats",
  "referral",
  "unknown",
]);

/** Intent of the user's latest outbound mail in the thread. */
export const MailIntent = z.enum([
  "application", // sent the application itself
  "follow_up", // chased status after applying
  "interview", // scheduling, prep, or post-interview thank-you
  "negotiation", // offer, salary, joining details
  "other",
]);

export const applicationSchema = z.object({
  _id: objectId,
  userId: objectId,
  accountId: objectId,
  threadId: z.string(),

  company: z.string().nullable(),
  role: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  source: ApplicationSource,

  appliedAt: z.date(),
  lastOutboundAt: z.date(),
  lastInboundAt: z.date().nullable(),
  lastActivityAt: z.date(),

  status: ApplicationStatus,
  statusOverriddenByUser: z.boolean().default(false),
  followUpCount: z.number().int().min(0),

  replyClassification: z.enum(["positive", "rejection", "neutral"]).nullable().default(null),

  // What the user's latest outbound mail in the thread was about , the
  // at-a-glance "why did I email them" flag on the applications table.
  mailIntent: MailIntent.nullable().default(null),

  confidence: z.number().min(0).max(1),
  extractedBy: z.string(), // model id, for eval regression tracking
  userEditedFields: z.array(z.string()).default([]),

  createdAt: z.date(),
  updatedAt: z.date(),
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messageSchema = z.object({
  _id: objectId,
  applicationId: objectId,
  accountId: objectId,
  gmailMessageId: z.string(),
  threadId: z.string(),
  direction: z.enum(["outbound", "inbound"]),
  subject: z.string(),
  snippet: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  sentAt: z.date(),
  rfcMessageId: z.string().nullable(), // for In-Reply-To threading
  references: z.array(z.string()).default([]),
  isFollowUp: z.boolean(),
});

// ---------------------------------------------------------------------------
// Raw messages (phase 2 , sent-mail metadata stored before any AI runs)
// ---------------------------------------------------------------------------

export const rawMessageSchema = z.object({
  _id: objectId,
  accountId: objectId,
  gmailMessageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  snippet: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  sentAt: z.date(),
  rfcMessageId: z.string().nullable(),
  references: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Thread classifications (negative cache , never charge twice for a thread)
// ---------------------------------------------------------------------------

export const threadClassificationSchema = z.object({
  _id: objectId,
  accountId: objectId,
  threadId: z.string(),
  isJobApplication: z.boolean(),
  confidence: z.number().min(0).max(1),
  model: z.string(),
  at: z.date(),
});

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export const DraftTone = z.enum(["polite_nudge", "value_add", "final_check_in"]);

export const draftSchema = z.object({
  _id: objectId,
  applicationId: objectId,
  accountId: objectId,
  gmailDraftId: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  tone: DraftTone,
  status: z.enum(["generated", "created", "failed"]),
  error: z.string().nullable(),
  createdAt: z.date(),
});

// ---------------------------------------------------------------------------
// User API keys (BYO Anthropic key)
// ---------------------------------------------------------------------------

export const KeyStatus = z.enum([
  "unverified", // saved but not yet checked
  "valid",
  "invalid", // 401 , revoked, typo, or wrong key type
  "no_credit", // key works, account cannot be billed
  "no_access", // key works, no permission for the selected model
]);

export const userApiKeySchema = z.object({
  _id: objectId,
  userId: objectId,
  provider: z.literal("anthropic"),

  keyEnc: z.string(), // AES-256-GCM, same crypto as Gmail tokens
  keyHint: z.string().length(4), // last 4 chars, for masked display
  fingerprint: z.string().length(64), // sha256(key) , compare/dedupe without decrypting

  status: KeyStatus,
  lastVerifiedAt: z.date().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorAt: z.date().nullable(),

  extractionModel: z.string(),
  draftModel: z.string(),
  maxConcurrency: z.number().int().min(1).max(10).default(2),

  createdAt: z.date(),
  updatedAt: z.date(),
});

// ---------------------------------------------------------------------------
// Usage events
// ---------------------------------------------------------------------------

export const usageEventSchema = z.object({
  _id: objectId,
  userId: objectId,
  at: z.date(),
  kind: z.enum(["extraction", "draft", "reply_classification", "key_verification"]),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  syncJobId: objectId.nullable(),
});

// ---------------------------------------------------------------------------
// Sync jobs
// ---------------------------------------------------------------------------

export const SyncJobStatus = z.enum([
  "queued",
  "running",
  "paused", // key problem , resumable at pageToken once fixed (§6.5)
  "completed",
  "failed",
  "cancelled",
]);

export const syncJobSchema = z.object({
  _id: objectId,
  accountId: objectId,
  type: z.enum(["backfill", "incremental"]),
  rangeFrom: z.date().nullable(),
  rangeTo: z.date().nullable(),
  status: SyncJobStatus,
  pageToken: z.string().nullable(), // resumability cursor
  pausedReason: z.string().nullable().default(null),
  stats: z.object({
    listed: z.number(),
    prefiltered: z.number(),
    classified: z.number(),
    applications: z.number(),
  }),
  error: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  // Bumped on every page/stat write. A queued/running job whose heartbeat has
  // gone stale was orphaned (crash, deploy, timeout) and is safe to reclaim.
  heartbeatAt: z.date().nullable().default(null),
});

export type User = z.infer<typeof userSchema>;
export type RawMessage = z.infer<typeof rawMessageSchema>;
export type ThreadClassification = z.infer<typeof threadClassificationSchema>;
export type GmailAccount = z.infer<typeof gmailAccountSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type SyncJob = z.infer<typeof syncJobSchema>;
export type UserApiKey = z.infer<typeof userApiKeySchema>;
export type UsageEvent = z.infer<typeof usageEventSchema>;

export type ApplicationStatusValue = z.infer<typeof ApplicationStatus>;
export type ApplicationSourceValue = z.infer<typeof ApplicationSource>;
export type MailIntentValue = z.infer<typeof MailIntent>;
export type AccountStatusValue = z.infer<typeof AccountStatus>;
export type KeyStatusValue = z.infer<typeof KeyStatus>;
export type SyncJobStatusValue = z.infer<typeof SyncJobStatus>;
export type DraftToneValue = z.infer<typeof DraftTone>;
