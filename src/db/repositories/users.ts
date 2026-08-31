import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { User } from "@/db/schemas";

const col = () => getDb().collection<User>("users");

export async function upsertByEmail(input: {
  email: string;
  name: string | null;
  image: string | null;
}): Promise<User> {
  const now = new Date();
  const res = await col().findOneAndUpdate(
    { email: input.email },
    {
      $set: { name: input.name, image: input.image },
      $setOnInsert: {
        email: input.email,
        settings: { followUpAfterDays: 7, ghostAfterDays: 30, timezone: "UTC" },
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!res) throw new Error("upsertByEmail returned no document");
  return res;
}

export async function findById(id: ObjectId): Promise<User | null> {
  return col().findOne({ _id: id });
}

export async function findByEmail(email: string): Promise<User | null> {
  return col().findOne({ email });
}

export async function updateSettings(
  id: ObjectId,
  settings: Partial<User["settings"]>
): Promise<void> {
  const $set: Record<string, unknown> = {};
  if (settings.followUpAfterDays !== undefined)
    $set["settings.followUpAfterDays"] = settings.followUpAfterDays;
  if (settings.ghostAfterDays !== undefined)
    $set["settings.ghostAfterDays"] = settings.ghostAfterDays;
  if (settings.timezone !== undefined)
    $set["settings.timezone"] = settings.timezone;
  if (Object.keys($set).length === 0) return;
  await col().updateOne({ _id: id }, { $set });
}

/** Account deletion: remove the user and every piece of their data (§10). */
export async function deleteAllUserData(userId: ObjectId): Promise<void> {
  const db = getDb();
  const accounts = await db
    .collection("gmail_accounts")
    .find({ userId })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  const accountIds = accounts.map((a) => a._id);

  await Promise.all([
    db.collection("messages").deleteMany({ accountId: { $in: accountIds } }),
    db.collection("drafts").deleteMany({ accountId: { $in: accountIds } }),
    db.collection("sync_jobs").deleteMany({ accountId: { $in: accountIds } }),
    db.collection("applications").deleteMany({ userId }),
    db.collection("user_api_keys").deleteMany({ userId }),
    db.collection("usage_events").deleteMany({ userId }),
    db.collection("gmail_accounts").deleteMany({ userId }),
  ]);
  await db.collection("users").deleteOne({ _id: userId });
}
