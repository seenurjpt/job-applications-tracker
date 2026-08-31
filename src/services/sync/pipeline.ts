import type Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { toGmailQuery } from "@/domain/date-range";
import { looksLikeApplication } from "@/domain/prefilter";
import { assembleThread } from "@/domain/thread";
import { deriveStatus, type StatusConfig } from "@/domain/status";
import { logger } from "@/lib/logger";
import { mapWithConcurrency } from "@/lib/async";
import * as accountsRepo from "@/db/repositories/accounts";
import * as usersRepo from "@/db/repositories/users";
import * as syncJobs from "@/db/repositories/sync-jobs";
import * as rawMessages from "@/db/repositories/raw-messages";
import * as applicationsRepo from "@/db/repositories/applications";
import * as messagesRepo from "@/db/repositories/messages";
import * as apiKeys from "@/db/repositories/api-keys";
import { anthropicFor } from "@/services/anthropic/client";
import {
  AnthropicKeyError,
  classifyReply,
  EXTRACTION_BATCH_SIZE,
  extractThreadBatch,
  type ExtractionResult,
} from "@/services/anthropic/extract";
import type { ThreadSummaryInput } from "@/services/anthropic/prompts/extraction";
import { getValidAccessToken } from "@/services/gmail/tokens";
import {
  getMetadataBatch,
  getProfile,
  getThread,
  listMessages,
  type ParsedMessageMeta,
} from "@/services/gmail/messages";
import type { GmailAccount, SyncJob, User } from "@/db/schemas";

export const CONFIDENCE_THRESHOLD = 0.5;
export const PAGE_SIZE = 100;

export type PageOutcome =
  | { kind: "done" }
  | { kind: "continue" }
  | { kind: "paused"; reason: string };

export interface SyncContext {
  job: SyncJob;
  account: GmailAccount;
  user: User;
  accessToken: string;
  client: Anthropic;
  extractionModel: string;
  maxConcurrency: number;
}

/**
 * Resolves everything a page needs, in the spec-mandated order: the KEY is
 * checked before any Gmail call (§6.6) , discovering a missing key three
 * thousand Gmail calls in wastes the user's quota.
 */
async function buildContext(
  jobId: ObjectId
): Promise<
  | { ok: true; ctx: SyncContext }
  | { ok: false; outcome: PageOutcome }
> {
  const job = await syncJobs.findById(jobId);
  if (!job || job.status === "cancelled" || job.status === "completed") {
    return { ok: false, outcome: { kind: "done" } };
  }
  const account = await accountsRepo.findById(job.accountId);
  if (!account) {
    await syncJobs.fail(jobId, "gmail account no longer exists");
    return { ok: false, outcome: { kind: "done" } };
  }
  const user = await usersRepo.findById(account.userId);
  if (!user) {
    await syncJobs.fail(jobId, "user no longer exists");
    return { ok: false, outcome: { kind: "done" } };
  }

  // Step 0 , key check, before any Gmail call.
  const keyCheck = await anthropicFor(user._id);
  if (!keyCheck.ok) {
    const reason = `key_${keyCheck.error}`;
    await syncJobs.pause(jobId, reason);
    return { ok: false, outcome: { kind: "paused", reason } };
  }

  const token = await getValidAccessToken(account._id);
  if (!token.ok) {
    await syncJobs.pause(jobId, token.error);
    return { ok: false, outcome: { kind: "paused", reason: token.error } };
  }

  return {
    ok: true,
    ctx: {
      job,
      account,
      user,
      accessToken: token.value,
      client: keyCheck.value.client,
      extractionModel: keyCheck.value.config.extractionModel,
      maxConcurrency: keyCheck.value.config.maxConcurrency,
    },
  };
}

function statusConfig(user: User): StatusConfig {
  return {
    followUpAfterDays: user.settings.followUpAfterDays,
    ghostAfterDays: user.settings.ghostAfterDays,
  };
}

/**
 * Processes ONE page of the mailbox listing, then persists the cursor.
 * Called in a loop by the Inngest backfill function; each invocation is a
 * separate step, so a crash resumes at the stored pageToken , never from
 * the start (§0.5).
 */
export async function processNextPage(jobId: ObjectId): Promise<PageOutcome> {
  const built = await buildContext(jobId);
  if (!built.ok) return built.outcome;
  const ctx = built.ctx;
  const { job, account, user } = ctx;

  if (job.status !== "running") await syncJobs.markRunning(job._id);

  // 1. list , IDs only, paginated
  if (!job.rangeFrom || !job.rangeTo) {
    await syncJobs.fail(job._id, "backfill job has no date range");
    return { kind: "done" };
  }
  const q = toGmailQuery(
    { from: job.rangeFrom, to: job.rangeTo },
    user.settings.timezone
  );
  const page = await listMessages(ctx.accessToken, q, job.pageToken, PAGE_SIZE);

  // 2. metadata , batch fetch, concurrency 10
  const metas = await getMetadataBatch(
    ctx.accessToken,
    page.ids.map((m) => m.id)
  );
  await syncJobs.addStats(job._id, { listed: metas.length });

  const outcome = await processMetadataBatch(ctx, metas);
  if (outcome) return outcome; // paused mid-page , cursor NOT advanced

  if (page.nextPageToken) {
    await syncJobs.savePageToken(job._id, page.nextPageToken);
    return { kind: "continue" };
  }

  await syncJobs.complete(job._id);
  await accountsRepo.setLastSyncAt(account._id, new Date());
  try {
    const profile = await getProfile(ctx.accessToken);
    await accountsRepo.setHistoryId(account._id, profile.historyId);
  } catch {
    logger.warn("Could not store historyId after sync; incremental will backfill");
  }
  return { kind: "done" };
}

/**
 * Stages 3–8 for a set of message metadata: store raw, prefilter, group,
 * classify, hydrate, upsert, derive. Shared by backfill pages and
 * incremental sync. Returns a paused outcome on a key failure, else null.
 */
export async function processMetadataBatch(
  ctx: SyncContext,
  metas: ParsedMessageMeta[]
): Promise<PageOutcome | null> {
  const { job, account, user } = ctx;

  // Store raw sent-mail metadata (phase 2 , survives even if AI stages fail).
  await rawMessages.upsertMany(
    metas.map((m) => ({
      accountId: account._id,
      gmailMessageId: m.gmailMessageId,
      threadId: m.threadId,
      subject: m.subject,
      snippet: m.snippet,
      from: m.from,
      to: m.to,
      sentAt: m.sentAt,
      rfcMessageId: m.rfcMessageId,
      references: m.references,
    }))
  );

  // 3. prefilter , free, recall-oriented
  const candidates = metas.filter((m) =>
    looksLikeApplication({ subject: m.subject, snippet: m.snippet, to: m.to })
  );
  await syncJobs.addStats(job._id, { prefiltered: candidates.length });

  // 4. group by threadId
  const byThread = new Map<string, ParsedMessageMeta[]>();
  for (const m of candidates) {
    const list = byThread.get(m.threadId) ?? [];
    list.push(m);
    byThread.set(m.threadId, list);
  }
  const threadIds = [...byThread.keys()];

  // Never charge the user twice for a thread: skip already-classified ones.
  const cached = await rawMessages.findClassifications(account._id, threadIds);
  const toClassify = threadIds.filter((t) => !cached.has(t));
  const confirmedFromCache = threadIds.filter(
    (t) =>
      (cached.get(t)?.isJobApplication ?? false) &&
      (cached.get(t)?.confidence ?? 0) >= CONFIDENCE_THRESHOLD
  );

  // 5. classify , batches of 10, concurrency from the user's key config
  const summaries: ThreadSummaryInput[] = toClassify.map((threadId) => {
    const first = byThread.get(threadId)![0]!;
    return {
      threadId,
      subject: first.subject,
      snippet: first.snippet,
      to: first.to,
      date: first.sentAt.toISOString().slice(0, 10),
    };
  });
  const batches: ThreadSummaryInput[][] = [];
  for (let i = 0; i < summaries.length; i += EXTRACTION_BATCH_SIZE) {
    batches.push(summaries.slice(i, i + EXTRACTION_BATCH_SIZE));
  }

  let results: ExtractionResult[];
  try {
    const nested = await mapWithConcurrency(
      batches,
      ctx.maxConcurrency,
      (batch) =>
        extractThreadBatch(
          {
            client: ctx.client,
            model: ctx.extractionModel,
            userId: user._id,
            syncJobId: job._id,
          },
          batch
        )
    );
    results = nested.flat();
  } catch (e) {
    if (e instanceof AnthropicKeyError) {
      // §6.5: pause, never fail. Cursor stays put; Resume re-runs this page
      // and the classification cache prevents double billing.
      await apiKeys.setStatus(user._id, e.kind, e.kind);
      await syncJobs.pause(job._id, `key_${e.kind}`);
      return { kind: "paused", reason: `key_${e.kind}` };
    }
    throw e;
  }

  await syncJobs.addStats(job._id, { classified: results.length });
  await rawMessages.saveClassifications(
    results.map((r) => ({
      accountId: account._id,
      threadId: r.threadId,
      isJobApplication: r.isJobApplication,
      confidence: r.confidence,
      model: ctx.extractionModel,
    }))
  );

  // 6–8. hydrate + upsert + derive for confirmed applications
  const confirmed = results.filter(
    (r) => r.isJobApplication && r.confidence >= CONFIDENCE_THRESHOLD
  );
  const cacheHits = new Map<string, ExtractionResult>();
  for (const t of confirmedFromCache) {
    const existing = await applicationsRepo.findByThread(account._id, t);
    if (existing) {
      cacheHits.set(t, {
        threadId: t,
        isJobApplication: true,
        confidence: existing.confidence,
        company: existing.company,
        role: existing.role,
        contactName: existing.contactName,
        source: existing.source,
        intent: existing.mailIntent,
      });
    }
  }

  let newApplications = 0;
  for (const result of [...confirmed, ...cacheHits.values()]) {
    try {
      const created = await hydrateAndUpsert(ctx, result);
      if (created) newApplications++;
    } catch (e) {
      if (e instanceof AnthropicKeyError) {
        await apiKeys.setStatus(user._id, e.kind, e.kind);
        await syncJobs.pause(job._id, `key_${e.kind}`);
        return { kind: "paused", reason: `key_${e.kind}` };
      }
      logger.warn("Failed to hydrate thread; will retry on next sync", {
        threadId: result.threadId,
      });
    }
  }
  await syncJobs.addStats(job._id, { applications: newApplications });
  return null;
}

/** Full thread fetch ONLY for confirmed applications , picks up inbound replies. */
async function hydrateAndUpsert(
  ctx: SyncContext,
  extraction: ExtractionResult
): Promise<boolean> {
  const { account, user } = ctx;
  const threadMessages = await getThread(ctx.accessToken, extraction.threadId);

  const withDirection = threadMessages.map((m) => ({
    meta: m,
    direction: (m.labelIds.includes("SENT") || m.from === account.email
      ? "outbound"
      : "inbound") as "outbound" | "inbound",
  }));

  const stats = assembleThread(
    withDirection.map((m) => ({
      id: m.meta.gmailMessageId,
      direction: m.direction,
      sentAt: m.meta.sentAt,
    }))
  );
  // No outbound message means the user never sent anything in this thread
  // (e.g. a no-reply portal notification) , not an application they made.
  if (!stats) return false;

  // Reply classification (phase 8): classify the latest inbound reply.
  let replyClassification: "positive" | "rejection" | "neutral" | null = null;
  const lastInbound = [...withDirection]
    .filter((m) => m.direction === "inbound")
    .sort((a, b) => a.meta.sentAt.getTime() - b.meta.sentAt.getTime())
    .pop();
  if (lastInbound) {
    const existing = await applicationsRepo.findByThread(
      account._id,
      extraction.threadId
    );
    if (
      existing?.replyClassification &&
      existing.lastInboundAt?.getTime() === lastInbound.meta.sentAt.getTime()
    ) {
      replyClassification = existing.replyClassification;
    } else {
      replyClassification = await classifyReply(
        {
          client: ctx.client,
          model: ctx.extractionModel,
          userId: user._id,
          syncJobId: ctx.job._id,
        },
        {
          subject: lastInbound.meta.subject,
          snippet: lastInbound.meta.snippet,
        }
      );
    }
  }

  const status = deriveStatus(
    {
      lastOutboundAt: stats.lastOutboundAt,
      lastInboundAt: stats.lastInboundAt,
      replyClassification,
      now: new Date(),
    },
    statusConfig(user)
  );

  const before = await applicationsRepo.findByThread(
    account._id,
    extraction.threadId
  );
  const firstOutbound = withDirection.find((m) => m.direction === "outbound")!;
  const app = await applicationsRepo.upsertFromExtraction({
    userId: user._id,
    accountId: account._id,
    threadId: extraction.threadId,
    company: extraction.company,
    role: extraction.role,
    contactName: extraction.contactName,
    contactEmail: firstOutbound.meta.to[0] ?? null,
    source: extraction.source,
    appliedAt: stats.appliedAt,
    lastOutboundAt: stats.lastOutboundAt,
    lastInboundAt: stats.lastInboundAt,
    lastActivityAt: stats.lastActivityAt,
    status,
    followUpCount: stats.followUpCount,
    confidence: extraction.confidence,
    extractedBy: ctx.extractionModel,
    mailIntent: extraction.intent,
  });
  if (replyClassification) {
    await applicationsRepo.updateDerived(app._id, {
      status,
      followUpCount: stats.followUpCount,
      lastOutboundAt: stats.lastOutboundAt,
      lastInboundAt: stats.lastInboundAt,
      lastActivityAt: stats.lastActivityAt,
      replyClassification,
    });
  }

  await messagesRepo.upsertMany(
    withDirection.map((m) => ({
      applicationId: app._id,
      accountId: account._id,
      gmailMessageId: m.meta.gmailMessageId,
      threadId: m.meta.threadId,
      direction: m.direction,
      subject: m.meta.subject,
      snippet: m.meta.snippet,
      from: m.meta.from,
      to: m.meta.to,
      sentAt: m.meta.sentAt,
      rfcMessageId: m.meta.rfcMessageId,
      references: m.meta.references,
      isFollowUp: stats.followUpIds.has(m.meta.gmailMessageId),
    }))
  );

  return before === null;
}
