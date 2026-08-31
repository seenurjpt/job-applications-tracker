import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { KeyStatusValue, UserApiKey } from "@/db/schemas";

const col = () => getDb().collection<UserApiKey>("user_api_keys");

export async function findByUser(
  userId: ObjectId,
  provider: "anthropic" = "anthropic"
): Promise<UserApiKey | null> {
  return col().findOne({ userId, provider });
}

export async function upsert(
  userId: ObjectId,
  input: {
    keyEnc: string;
    keyHint: string;
    fingerprint: string;
    status: KeyStatusValue;
    extractionModel: string;
    draftModel: string;
  }
): Promise<UserApiKey> {
  const now = new Date();
  const res = await col().findOneAndUpdate(
    { userId, provider: "anthropic" },
    {
      $set: {
        keyEnc: input.keyEnc,
        keyHint: input.keyHint,
        fingerprint: input.fingerprint,
        status: input.status,
        extractionModel: input.extractionModel,
        draftModel: input.draftModel,
        updatedAt: now,
      },
      $setOnInsert: {
        userId,
        provider: "anthropic",
        lastVerifiedAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
        maxConcurrency: 2,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!res) throw new Error("api key upsert returned no document");
  return res;
}

export async function setStatus(
  userId: ObjectId,
  status: KeyStatusValue,
  errorCode?: string
): Promise<void> {
  const now = new Date();
  await col().updateOne(
    { userId, provider: "anthropic" },
    {
      $set: {
        status,
        updatedAt: now,
        ...(status === "valid"
          ? { lastVerifiedAt: now, lastErrorCode: null, lastErrorAt: null }
          : { lastErrorCode: errorCode ?? status, lastErrorAt: now }),
      },
    }
  );
}

export async function updateConfig(
  userId: ObjectId,
  config: Partial<
    Pick<UserApiKey, "extractionModel" | "draftModel" | "maxConcurrency">
  >
): Promise<void> {
  await col().updateOne(
    { userId, provider: "anthropic" },
    { $set: { ...config, updatedAt: new Date() } }
  );
}

export async function remove(userId: ObjectId): Promise<void> {
  await col().deleteOne({ userId, provider: "anthropic" });
}
