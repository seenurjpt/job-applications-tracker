import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { Draft, DraftToneValue } from "@/db/schemas";

const col = () => getDb().collection<Draft>("drafts");

export async function insertGenerated(input: {
  applicationId: ObjectId;
  accountId: ObjectId;
  subject: string;
  body: string;
  tone: DraftToneValue;
}): Promise<Draft> {
  const draft: Draft = {
    _id: new ObjectId(),
    applicationId: input.applicationId,
    accountId: input.accountId,
    gmailDraftId: null,
    subject: input.subject,
    body: input.body,
    tone: input.tone,
    status: "generated",
    error: null,
    createdAt: new Date(),
  };
  await col().insertOne(draft);
  return draft;
}

export async function markCreated(
  id: ObjectId,
  gmailDraftId: string
): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { gmailDraftId, status: "created", error: null } }
  );
}

export async function markFailed(id: ObjectId, error: string): Promise<void> {
  await col().updateOne({ _id: id }, { $set: { status: "failed", error } });
}

export async function updateBody(
  id: ObjectId,
  update: { subject?: string; body?: string }
): Promise<void> {
  await col().updateOne({ _id: id }, { $set: update });
}

export async function findById(id: ObjectId): Promise<Draft | null> {
  return col().findOne({ _id: id });
}

export async function findByApplication(
  applicationId: ObjectId
): Promise<Draft[]> {
  return col().find({ applicationId }).sort({ createdAt: -1 }).toArray();
}
