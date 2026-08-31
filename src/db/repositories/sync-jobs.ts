import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import type { SyncJob } from "@/db/schemas";

const col = () => getDb().collection<SyncJob>("sync_jobs");

export async function create(input: {
  accountId: ObjectId;
  type: "backfill" | "incremental";
  rangeFrom: Date | null;
  rangeTo: Date | null;
}): Promise<SyncJob> {
  const job: SyncJob = {
    _id: new ObjectId(),
    accountId: input.accountId,
    type: input.type,
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    status: "queued",
    pageToken: null,
    pausedReason: null,
    stats: { listed: 0, prefiltered: 0, classified: 0, applications: 0 },
    error: null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
  };
  await col().insertOne(job);
  return job;
}

export async function findById(id: ObjectId): Promise<SyncJob | null> {
  return col().findOne({ _id: id });
}

export async function findActiveForAccount(
  accountId: ObjectId
): Promise<SyncJob | null> {
  return col().findOne({
    accountId,
    status: { $in: ["queued", "running", "paused"] },
  });
}

export async function markRunning(id: ObjectId): Promise<void> {
  await col().updateOne(
    { _id: id },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        pausedReason: null,
        heartbeatAt: new Date(),
      },
    }
  );
}

export async function savePageToken(
  id: ObjectId,
  pageToken: string | null
): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { pageToken, heartbeatAt: new Date() } }
  );
}

export async function addStats(
  id: ObjectId,
  delta: Partial<SyncJob["stats"]>
): Promise<void> {
  const $inc: Record<string, number> = {};
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number" && v !== 0) $inc[`stats.${k}`] = v;
  }
  const update: Record<string, unknown> = { $set: { heartbeatAt: new Date() } };
  if (Object.keys($inc).length > 0) update.$inc = $inc;
  await col().updateOne({ _id: id }, update);
}

/** §6.5: pause, never fail , keeps pageToken so Resume avoids double billing. */
export async function pause(id: ObjectId, reason: string): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { status: "paused", pausedReason: reason } }
  );
}

export async function complete(id: ObjectId): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { status: "completed", finishedAt: new Date(), pageToken: null } }
  );
}

export async function fail(id: ObjectId, error: string): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { status: "failed", error, finishedAt: new Date() } }
  );
}

export async function cancel(id: ObjectId): Promise<void> {
  await col().updateOne(
    { _id: id },
    { $set: { status: "cancelled", finishedAt: new Date() } }
  );
}

export async function requeueForResume(id: ObjectId): Promise<void> {
  await col().updateOne(
    { _id: id, status: "paused" },
    { $set: { status: "queued", pausedReason: null } }
  );
}

/**
 * Atomically reclaims a queued/running job whose runner died (page refresh
 * killed nothing , the server keeps going , but a crash, redeploy, or
 * serverless timeout stops the heartbeat). Only claims when the heartbeat
 * (or, for never-started jobs, the creation time embedded in the ObjectId)
 * is older than `staleBefore`, so a live runner is never duplicated.
 * Returns true when this caller won the claim and should run the job.
 */
export async function claimStalled(
  id: ObjectId,
  staleBefore: Date
): Promise<boolean> {
  const res = await col().updateOne(
    {
      _id: id,
      status: { $in: ["queued", "running"] },
      $or: [
        { heartbeatAt: { $lt: staleBefore } },
        {
          heartbeatAt: null,
          _id: { $lt: ObjectId.createFromTime(Math.floor(staleBefore.getTime() / 1000)) },
        },
      ],
    },
    { $set: { status: "queued", pausedReason: null, heartbeatAt: new Date() } }
  );
  return res.modifiedCount === 1;
}

export async function latestForAccount(
  accountId: ObjectId
): Promise<SyncJob | null> {
  return col().find({ accountId }).sort({ _id: -1 }).limit(1).next();
}
