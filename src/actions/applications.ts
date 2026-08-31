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
