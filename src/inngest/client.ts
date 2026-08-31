import { Inngest, EventSchemas } from "inngest";

type Events = {
  "sync/backfill.requested": { data: { jobId: string } };
  "sync/incremental.requested": { data: { accountId: string } };
};

export const inngest = new Inngest({
  id: "job-tracker",
  schemas: new EventSchemas().fromRecord<Events>(),
});
