// Node-runtime boot work. Imported ONLY from instrumentation.ts behind the
// NEXT_RUNTIME === "nodejs" check, so the edge bundle never sees mongodb.
import { env } from "@/lib/env";
import { getDb } from "@/db/client";
import { ensureIndexes } from "@/db/indexes";
import { logger } from "@/lib/logger";

export async function bootNode(): Promise<void> {
  void env.MONGODB_URI; // force env validation at boot
  try {
    await ensureIndexes(getDb());
    logger.info("Database indexes ensured");
  } catch (e) {
    logger.error("Failed to ensure indexes at boot", e);
  }
}
