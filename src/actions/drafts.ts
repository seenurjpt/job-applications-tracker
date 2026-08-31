"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { DraftTone } from "@/db/schemas";
import {
  bulkCreate,
  bulkGenerate,
  createDraftInGmail,
  generateDraft,
} from "@/services/drafts";

const generateSchema = z.object({
  applicationId: z.string().refine(ObjectId.isValid),
  tone: DraftTone,
});

export async function generateFollowUpDraft(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const res = await generateDraft(
    userId,
    new ObjectId(parsed.data.applicationId),
    parsed.data.tone
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  return {
    ok: true as const,
    draftId: res.value._id.toHexString(),
    subject: res.value.subject,
    body: res.value.body,
  };
}

const createSchema = z.object({
  draftId: z.string().refine(ObjectId.isValid),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export async function createDraftInGmailAction(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const res = await createDraftInGmail(userId, new ObjectId(parsed.data.draftId), {
    subject: parsed.data.subject,
    body: parsed.data.body,
  });
  revalidatePath("/applications");
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: true as const };
}

const bulkGenerateSchema = z.object({
  applicationIds: z.array(z.string().refine(ObjectId.isValid)).min(1).max(50),
  tone: DraftTone,
});

export async function bulkGenerateDrafts(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = bulkGenerateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const rows = await bulkGenerate(
    userId,
    parsed.data.applicationIds.map((id) => new ObjectId(id)),
    parsed.data.tone
  );
  return { ok: true as const, rows };
}

const bulkCreateSchema = z.object({
  rows: z
    .array(
      z.object({
        draftId: z.string().refine(ObjectId.isValid),
        subject: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
      })
    )
    .min(1)
    .max(50),
});

export async function bulkCreateDrafts(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = bulkCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const rows = await bulkCreate(
    userId,
    parsed.data.rows.map((r) => ({
      draftId: new ObjectId(r.draftId),
      subject: r.subject,
      body: r.body,
    }))
  );
  revalidatePath("/applications");
  return { ok: true as const, rows };
}
