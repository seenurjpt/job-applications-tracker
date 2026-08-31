import { ObjectId } from "mongodb";
import { addHours } from "date-fns";
import { encrypt } from "@/lib/crypto";
import * as usersRepo from "@/db/repositories/users";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import * as syncJobsRepo from "@/db/repositories/sync-jobs";
import { fingerprint } from "@/services/anthropic/keys";
import type { GmailAccount, SyncJob, User, UserApiKey } from "@/db/schemas";

export async function seedUser(email = "me@example.com"): Promise<User> {
  return usersRepo.upsertByEmail({ email, name: "Test User", image: null });
}

export async function seedAccount(
  userId: ObjectId,
  email = "me@example.com",
  overrides: Partial<Pick<GmailAccount, "expiresAt" | "status">> = {}
): Promise<GmailAccount> {
  const account = await accountsRepo.upsertConnection({
    userId,
    email,
    accessTokenEnc: encrypt("valid-access-token"),
    refreshTokenEnc: encrypt("valid-refresh-token"),
    expiresAt: overrides.expiresAt ?? addHours(new Date(), 1),
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  });
  if (overrides.status && overrides.status !== "active") {
    await accountsRepo.setStatus(account._id, overrides.status);
  }
  return (await accountsRepo.findById(account._id))!;
}

export async function seedKey(
  userId: ObjectId,
  rawKey = "sk-ant-test-key-aaaa",
  status: UserApiKey["status"] = "valid"
): Promise<UserApiKey> {
  return apiKeysRepo
    .upsert(userId, {
      keyEnc: encrypt(rawKey),
      keyHint: rawKey.slice(-4),
      fingerprint: fingerprint(rawKey),
      status,
      extractionModel: "claude-haiku-4-5-20251001",
      draftModel: "claude-sonnet-5",
    })
    .then(async (_rec) => {
      if (status !== "unverified") await apiKeysRepo.setStatus(userId, status);
      return (await apiKeysRepo.findByUser(userId))!;
    });
}

export async function seedBackfillJob(accountId: ObjectId): Promise<SyncJob> {
  return syncJobsRepo.create({
    accountId,
    type: "backfill",
    rangeFrom: new Date(Date.UTC(2025, 6, 1)),
    rangeTo: new Date(Date.UTC(2026, 0, 31)),
  });
}

/** Full happy-path seed: user + active account + valid key + queued job. */
export async function seedSyncReady(email = "me@example.com", key = "sk-ant-test-key-aaaa") {
  const user = await seedUser(email);
  const account = await seedAccount(user._id, email);
  const apiKey = await seedKey(user._id, key);
  const job = await seedBackfillJob(account._id);
  return { user, account, apiKey, job };
}
