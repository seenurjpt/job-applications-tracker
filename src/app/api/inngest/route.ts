import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { backfillFunction } from "@/inngest/functions/backfill";
import {
  incrementalCron,
  incrementalFunction,
} from "@/inngest/functions/incremental";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [backfillFunction, incrementalFunction, incrementalCron],
});
