"use server";

// The raw key is read here and in server-side services ONLY. It never appears
// in an action's return value, never crosses to a Client Component (§6.2).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { decrypt } from "@/lib/crypto";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import {
  deleteKey,
  reverifyStoredKey,
  saveKey,
} from "@/services/anthropic/keys";

const saveSchema = z.object({
  key: z.string().min(1).max(500),
  extractionModel: z.string().min(1).optional(),
  draftModel: z.string().min(1).optional(),
});

export async function saveApiKey(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const result = await saveKey(userId, parsed.data.key, {
    extractionModel: parsed.data.extractionModel,
    draftModel: parsed.data.draftModel,
  });
  revalidatePath("/settings/api-key");
  // Result contains status + hint only , never the key.
  return { ok: true as const, status: result.status, unchanged: result.unchanged };
}

export async function deleteApiKey() {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  await deleteKey(userId);
  revalidatePath("/settings/api-key");
  return { ok: true as const };
}

const configSchema = z.object({
  extractionModel: z.string().min(1).optional(),
  draftModel: z.string().min(1).optional(),
  maxConcurrency: z.number().int().min(1).max(10).optional(),
});

export async function updateApiKeyConfig(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "unauthenticated" };
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  await apiKeysRepo.updateConfig(userId, parsed.data);

  // A key may not have access to every model , re-verify on model change (§6.9).
  if (parsed.data.extractionModel || parsed.data.draftModel) {
    const rec = await apiKeysRepo.findByUser(userId);
    if (rec) {
      const model = parsed.data.extractionModel ?? parsed.data.draftModel!;
      await reverifyStoredKey(userId, decrypt(rec.keyEnc), model);
    }
  }
  revalidatePath("/settings/api-key");
  return { ok: true as const };
}
