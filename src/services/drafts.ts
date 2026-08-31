import { ObjectId } from "mongodb";
import { err, ok, type Result } from "@/lib/result";
import { mapWithConcurrency } from "@/lib/async";
import { logger } from "@/lib/logger";
import * as applicationsRepo from "@/db/repositories/applications";
import * as messagesRepo from "@/db/repositories/messages";
import * as accountsRepo from "@/db/repositories/accounts";
import * as draftsRepo from "@/db/repositories/drafts";
import { anthropicFor } from "@/services/anthropic/client";
import { composeFollowUp } from "@/services/anthropic/compose";
import { buildRawMessage, createDraft } from "@/services/gmail/drafts";
import { getValidAccessToken } from "@/services/gmail/tokens";
import type { Draft, DraftToneValue } from "@/db/schemas";

export type DraftError =
  | "application_not_found"
  | "no_outbound_message"
  | "key_missing"
  | "key_invalid"
  | "key_no_credit"
  | "gmail_needs_reconnect"
  | "compose_failed"
  | "create_failed";

/** Generate a follow-up body with the user's draft model. Does NOT touch Gmail. */
export async function generateDraft(
  userId: ObjectId,
  applicationId: ObjectId,
  tone: DraftToneValue
): Promise<Result<Draft, DraftError>> {
  const app = await applicationsRepo.findById(applicationId);
  if (!app || !app.userId.equals(userId)) return err("application_not_found");

  const keyCheck = await anthropicFor(userId);
  if (!keyCheck.ok) {
    if (keyCheck.error === "missing") return err("key_missing");
    if (keyCheck.error === "no_credit") return err("key_no_credit");
    return err("key_invalid");
  }

  const thread = await messagesRepo.findByApplication(applicationId);
  const lastOutbound = [...thread]
    .filter((m) => m.direction === "outbound")
    .pop();
  if (!lastOutbound) return err("no_outbound_message");

  try {
    const composed = await composeFollowUp(
      {
        client: keyCheck.value.client,
        model: keyCheck.value.config.draftModel,
        userId,
      },
      app,
      lastOutbound.subject,
      tone
    );
    const draft = await draftsRepo.insertGenerated({
      applicationId,
      accountId: app.accountId,
      subject: composed.subject,
      body: composed.body,
      tone,
    });
    return ok(draft);
  } catch (e) {
    logger.error("Draft composition failed", e);
    return err("compose_failed");
  }
}

/**
 * Push a generated (and possibly user-edited) draft into Gmail, threaded
 * correctly with In-Reply-To/References + threadId (§5.6).
 */
export async function createDraftInGmail(
  userId: ObjectId,
  draftId: ObjectId,
  edited?: { subject?: string; body?: string }
): Promise<Result<{ gmailDraftId: string }, DraftError>> {
  const draft = await draftsRepo.findById(draftId);
  if (!draft) return err("application_not_found");
  const app = await applicationsRepo.findById(draft.applicationId);
  if (!app || !app.userId.equals(userId)) return err("application_not_found");
  const account = await accountsRepo.findById(draft.accountId);
  if (!account) return err("gmail_needs_reconnect");

  if (edited && (edited.subject !== undefined || edited.body !== undefined)) {
    await draftsRepo.updateBody(draftId, edited);
  }
  const subject = edited?.subject ?? draft.subject;
  const body = edited?.body ?? draft.body;

  const token = await getValidAccessToken(account._id);
  if (!token.ok) {
    await draftsRepo.markFailed(draftId, "gmail_needs_reconnect");
    return err("gmail_needs_reconnect");
  }

  const thread = await messagesRepo.findByApplication(draft.applicationId);
  const lastMessage = thread[thread.length - 1];
  const lastOutbound = [...thread]
    .filter((m) => m.direction === "outbound")
    .pop();
  const to =
    app.contactEmail ?? lastOutbound?.to[0] ?? lastMessage?.to[0] ?? null;
  if (!to) {
    await draftsRepo.markFailed(draftId, "no recipient");
    return err("create_failed");
  }

  // Reply to the most recent message in the thread for correct threading.
  const replyTarget = lastMessage ?? lastOutbound;
  const raw = buildRawMessage({
    to,
    from: account.email,
    subject,
    body,
    inReplyTo: replyTarget?.rfcMessageId ?? null,
    references: replyTarget?.references ?? [],
  });

  try {
    const created = await createDraft(token.value, {
      raw,
      threadId: app.threadId,
    });
    await draftsRepo.markCreated(draftId, created.id);
    return ok({ gmailDraftId: created.id });
  } catch (e) {
    logger.error("Gmail draft creation failed", e);
    await draftsRepo.markFailed(
      draftId,
      e instanceof Error ? e.message : "unknown error"
    );
    return err("create_failed");
  }
}

export interface BulkRowResult {
  applicationId: string;
  draftId: string | null;
  subject: string | null;
  body: string | null;
  ok: boolean;
  error: DraftError | null;
}

/** Generate bodies for many applications. Per-row failures never roll back the rest. */
export async function bulkGenerate(
  userId: ObjectId,
  applicationIds: ObjectId[],
  tone: DraftToneValue
): Promise<BulkRowResult[]> {
  return mapWithConcurrency(applicationIds, 2, async (id) => {
    const res = await generateDraft(userId, id, tone);
    return res.ok
      ? {
          applicationId: id.toHexString(),
          draftId: res.value._id.toHexString(),
          subject: res.value.subject,
          body: res.value.body,
          ok: true,
          error: null,
        }
      : {
          applicationId: id.toHexString(),
          draftId: null,
          subject: null,
          body: null,
          ok: false,
          error: res.error,
        };
  });
}

/**
 * Queue Gmail draft creation at concurrency 3–5 (drafts.create costs 10 quota
 * units against a 250 units/sec per-user limit). One failing row leaves the
 * other rows created and retryable , no total rollback (§ phase 6).
 */
export async function bulkCreate(
  userId: ObjectId,
  rows: Array<{ draftId: ObjectId; subject?: string; body?: string }>
): Promise<Array<{ draftId: string; ok: boolean; error: DraftError | null }>> {
  return mapWithConcurrency(rows, 3, async (row) => {
    const res = await createDraftInGmail(userId, row.draftId, {
      subject: row.subject,
      body: row.body,
    });
    return {
      draftId: row.draftId.toHexString(),
      ok: res.ok,
      error: res.ok ? null : res.error,
    };
  });
}
