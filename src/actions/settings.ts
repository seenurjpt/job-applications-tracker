"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId, signOut } from "@/auth";
import * as usersRepo from "@/db/repositories/users";
import * as accountsRepo from "@/db/repositories/accounts";

const settingsSchema = z.object({
  followUpAfterDays: z.coerce.number().int().min(1).max(90).optional(),
  ghostAfterDays: z.coerce.number().int().min(1).max(365).optional(),
  timezone: z.string().min(1).optional(),
});

export async function updateUserSettings(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  await usersRepo.updateSettings(userId, parsed.data);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function disconnectGmail(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = z
    .object({ accountId: z.string().refine(ObjectId.isValid) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const account = await accountsRepo.findById(new ObjectId(parsed.data.accountId));
  if (!account || !account.userId.equals(userId))
    return { ok: false as const, error: "account_not_found" };

  // §10: disconnecting purges the mailbox's messages, applications, drafts.
  await accountsRepo.disconnectAndPurge(account._id);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function deleteAccount() {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  await usersRepo.deleteAllUserData(userId);
  await signOut({ redirectTo: "/" });
  return { ok: true as const };
}
