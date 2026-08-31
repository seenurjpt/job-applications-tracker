import { describe, it, expect } from "vitest";
import { maskEmailAddress, redactForModel } from "@/domain/redact";

describe("redactForModel", () => {
  it("masks email addresses but keeps the domain", () => {
    expect(redactForModel("write to mayank.chauhan@teamlease.in today")).toBe(
      "write to m***@teamlease.in today"
    );
  });

  it("masks URLs entirely", () => {
    expect(
      redactForModel("apply at https://jobs.acme.com/apply?token=s3cret now")
    ).toBe("apply at [link] now");
  });

  it("masks phone numbers in common formats", () => {
    expect(redactForModel("call me on +91 98765 43210")).toBe("call me on [phone]");
    expect(redactForModel("tel: (415) 555-0132.")).toBe("tel: [phone].");
  });

  it("masks long ID numbers", () => {
    expect(redactForModel("candidate id 123456789012")).toBe(
      "candidate id [number]"
    );
  });

  it("preserves dates", () => {
    expect(redactForModel("applied on 2026-08-31")).toBe("applied on 2026-08-31");
    expect(redactForModel("interview on 31-08-2026")).toBe(
      "interview on 31-08-2026"
    );
    expect(redactForModel("by 8/31/2026 please")).toBe("by 8/31/2026 please");
  });

  it("preserves ordinary text, years, and small numbers", () => {
    expect(redactForModel("4 years of experience since 2022")).toBe(
      "4 years of experience since 2022"
    );
  });

  it("is idempotent", () => {
    const once = redactForModel("mail hr@acme.com or +1 415 555 0132");
    expect(redactForModel(once)).toBe(once);
  });
});

describe("maskEmailAddress", () => {
  it("keeps the first letter and domain", () => {
    expect(maskEmailAddress("careers@boards.greenhouse.io")).toBe(
      "c***@boards.greenhouse.io"
    );
  });
});
