import { describe, it, expect } from "vitest";
import {
  extractionBatchSchema,
  stripFences,
} from "@/services/anthropic/extract";

const valid = {
  threadId: "t1",
  isJobApplication: true,
  confidence: 0.9,
  company: "Acme",
  role: "Engineer",
  contactName: null,
  source: "direct",
};

describe("stripFences", () => {
  it("strips ```json fences", () => {
    expect(stripFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("strips bare ``` fences", () => {
    expect(stripFences('```\n[]\n```')).toBe("[]");
  });

  it("leaves clean JSON untouched", () => {
    expect(stripFences('[{"a":1}]')).toBe('[{"a":1}]');
  });
});

describe("extractionBatchSchema", () => {
  it("accepts a valid batch", () => {
    expect(extractionBatchSchema.safeParse([valid]).success).toBe(true);
  });

  it("rejects confidence out of range", () => {
    expect(
      extractionBatchSchema.safeParse([{ ...valid, confidence: 1.5 }]).success
    ).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(
      extractionBatchSchema.safeParse([{ ...valid, source: "telepathy" }]).success
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    const rest = { ...valid } as Record<string, unknown>;
    delete rest.threadId;
    expect(extractionBatchSchema.safeParse([rest]).success).toBe(false);
  });

  it("rejects a bare object (must be an array)", () => {
    expect(extractionBatchSchema.safeParse(valid).success).toBe(false);
  });
});
