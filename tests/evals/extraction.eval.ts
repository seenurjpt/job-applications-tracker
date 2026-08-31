// Extraction accuracy eval. Run: pnpm eval:extraction
// NOT part of the normal test run , costs money and is non-deterministic.
// Run on prompt changes and model upgrades; append the printed scores line to
// tests/evals/scores.jsonl , that history is the regression detector.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { setDbForTests } from "@/db/client";
import { env } from "@/lib/env";
import {
  EXTRACTION_BATCH_SIZE,
  extractThreadBatch,
  type ExtractionResult,
} from "@/services/anthropic/extract";
import type { ThreadSummaryInput } from "@/services/anthropic/prompts/extraction";

interface LabelledCase {
  input: ThreadSummaryInput;
  expected: {
    isJobApplication: boolean;
    company: string | null;
    role: string | null;
    source: string | null;
  };
}

function loadLabelledThreads(): LabelledCase[] {
  const file = join(dirname(fileURLToPath(import.meta.url)), "data", "threads.json");
  return JSON.parse(readFileSync(file, "utf8")) as LabelledCase[];
}

/** Loose normalisation so "Nimbus Analytics" ≈ "nimbus analytics" ≈ "Nimbus Analytics Inc". */
function normalise(v: string | null): string {
  return (v ?? "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|sa|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rate(
  results: Map<string, ExtractionResult>,
  cases: LabelledCase[],
  compare: (r: ExtractionResult | undefined, c: LabelledCase) => boolean
): number {
  const hits = cases.filter((c) => compare(results.get(c.input.threadId), c));
  return hits.length / cases.length;
}

describe("extraction eval", () => {
  it("meets accuracy thresholds", async () => {
    const cases = loadLabelledThreads();
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY_DEV!,
      maxRetries: 0,
    });

    // usage recording needs a database; give it a throwaway one.
    const mongod = await MongoMemoryServer.create();
    const mongo = await new MongoClient(mongod.getUri()).connect();
    setDbForTests(mongo.db("evals"));

    try {
      const deps = {
        client,
        model: env.ANTHROPIC_EXTRACTION_MODEL,
        userId: new ObjectId(),
        syncJobId: null,
      };

      const results = new Map<string, ExtractionResult>();
      for (let i = 0; i < cases.length; i += EXTRACTION_BATCH_SIZE) {
        const batch = cases.slice(i, i + EXTRACTION_BATCH_SIZE);
        const out = await extractThreadBatch(deps, batch.map((c) => c.input));
        for (const r of out) results.set(r.threadId, r);
      }

      const positives = cases.filter((c) => c.expected.isJobApplication);
      const metrics = {
        model: env.ANTHROPIC_EXTRACTION_MODEL,
        at: new Date().toISOString(),
        cases: cases.length,
        classificationAccuracy: rate(
          results,
          cases,
          (r, c) => r?.isJobApplication === c.expected.isJobApplication
        ),
        companyAccuracy: rate(
          results,
          positives,
          (r, c) => normalise(r?.company ?? null) === normalise(c.expected.company)
        ),
        roleAccuracy: rate(
          results,
          positives,
          (r, c) => normalise(r?.role ?? null) === normalise(c.expected.role)
        ),
      };

      // Append this line to tests/evals/scores.jsonl to track over time.
      console.log(`SCORES ${JSON.stringify(metrics)}`);

      expect(metrics.classificationAccuracy).toBeGreaterThan(0.92);
      expect(metrics.companyAccuracy).toBeGreaterThan(0.8);
      expect(metrics.roleAccuracy).toBeGreaterThan(0.75);
    } finally {
      setDbForTests(null);
      await mongo.close();
      await mongod.stop();
    }
  });
});
