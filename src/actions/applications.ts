"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/auth";
import * as applications from "@/db/repositories/applications";
import { ApplicationSource, ApplicationStatus } from "@/db/schemas";

const editSchema = z.object({
  id: z.string().refine(ObjectId.isValid),
  company: z.string().min(1).nullable().optional(),
  role: z.string().min(1).nullable().optional(),
  contactName: z.string().min(1).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  source: ApplicationSource.optional(),
});

export async function editApplication(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const { id, ...edits } = parsed.data;
  await applications.applyUserEdit(new ObjectId(id), userId, edits);
  revalidatePath("/applications");
  return { ok: true as const };
}

export async function getApplicationThread(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({ id: z.string().refine(ObjectId.isValid) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const app = await applications.findById(new ObjectId(parsed.data.id));
  if (!app || !app.userId.equals(userId))
    return { ok: false as const, error: "not_found" };

  const { findByApplication } = await import("@/db/repositories/messages");
  const { toMessageDTO } = await import("@/lib/serialize");
  const thread = await findByApplication(app._id);
  return { ok: true as const, messages: thread.map(toMessageDTO) };
}

/**
 * On-demand backfill: classify "what did I mail them about" for applications
 * that predate the intent field. Uses stored subject+snippet of the latest
 * outbound message , no Gmail calls , billed to the user's own key in
 * batches of 10.
 */
export async function analyzeIntents() {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };

  const { anthropicFor } = await import("@/services/anthropic/client");
  const keyCheck = await anthropicFor(userId);
  if (!keyCheck.ok)
    return { ok: false as const, error: `key_${keyCheck.error}` };

  const missing = await applications.findMissingIntent(userId);
  const { findByApplication } = await import("@/db/repositories/messages");
  const items: Array<{ id: string; subject: string; snippet: string }> = [];
  for (const app of missing) {
    const thread = await findByApplication(app._id);
    const lastOutbound = [...thread]
      .filter((m) => m.direction === "outbound")
      .pop();
    if (lastOutbound) {
      items.push({
        id: app._id.toHexString(),
        subject: lastOutbound.subject,
        snippet: lastOutbound.snippet,
      });
    }
  }

  const { classifyIntentBatch, EXTRACTION_BATCH_SIZE } = await import(
    "@/services/anthropic/extract"
  );
  const deps = {
    client: keyCheck.value.client,
    model: keyCheck.value.config.extractionModel,
    userId,
    syncJobId: null,
  };
  let classified = 0;
  for (let i = 0; i < items.length; i += EXTRACTION_BATCH_SIZE) {
    const batch = items.slice(i, i + EXTRACTION_BATCH_SIZE);
    const results = await classifyIntentBatch(deps, batch);
    for (const [id, intent] of results) {
      await applications.setMailIntent(new ObjectId(id), intent);
      classified++;
    }
  }
  revalidatePath("/applications");
  return { ok: true as const, analyzed: classified, remaining: items.length - classified };
}

/**
 * Full body of one thread message, fetched live from Gmail for display.
 * Never stored and never sent to Anthropic , the metadata-only posture
 * applies to storage and third-party transfer, not to showing the user
 * their own mail.
 */
export async function getFullMessage(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({
      applicationId: z.string().refine(ObjectId.isValid),
      messageId: z.string().refine(ObjectId.isValid),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const app = await applications.findById(new ObjectId(parsed.data.applicationId));
  if (!app || !app.userId.equals(userId))
    return { ok: false as const, error: "not_found" };

  const { findByApplication } = await import("@/db/repositories/messages");
  const message = (await findByApplication(app._id)).find((m) =>
    m._id.equals(new ObjectId(parsed.data.messageId))
  );
  if (!message) return { ok: false as const, error: "not_found" };

  const { getValidAccessToken } = await import("@/services/gmail/tokens");
  const token = await getValidAccessToken(message.accountId);
  if (!token.ok) return { ok: false as const, error: token.error };

  const { getMessageBody } = await import("@/services/gmail/messages");
  const body = await getMessageBody(token.value, message.gmailMessageId);
  if (!body) return { ok: false as const, error: "no_body" };
  return { ok: true as const, body: body.slice(0, 50_000) };
}

const statusSchema = z.object({
  id: z.string().refine(ObjectId.isValid),
  status: ApplicationStatus,
});

export async function setApplicationStatus(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  await applications.overrideStatus(
    new ObjectId(parsed.data.id),
    userId,
    parsed.data.status
  );
  revalidatePath("/applications");
  return { ok: true as const };
}
