import { describe, it, expect } from "vitest";
import { looksLikeApplication } from "@/domain/prefilter";

const base = { subject: "", snippet: "", to: ["someone@example.com"] };

describe("looksLikeApplication", () => {
  it("matches application keywords in the subject", () => {
    expect(
      looksLikeApplication({ ...base, subject: "Application for Senior Engineer" })
    ).toBe(true);
    expect(looksLikeApplication({ ...base, subject: "Applying for the role" })).toBe(
      true
    );
    expect(looksLikeApplication({ ...base, subject: "My resume attached" })).toBe(true);
    expect(looksLikeApplication({ ...base, subject: "CV for your review" })).toBe(true);
  });

  it("matches keywords in the snippet", () => {
    expect(
      looksLikeApplication({
        ...base,
        snippet: "I saw the opening on your site and would love to apply",
      })
    ).toBe(true);
  });

  it("matches ATS recipient domains, including subdomains", () => {
    expect(
      looksLikeApplication({ ...base, to: ["jobs@boards.greenhouse.io"] })
    ).toBe(true);
    expect(looksLikeApplication({ ...base, to: ["x@lever.co"] })).toBe(true);
    expect(looksLikeApplication({ ...base, to: ["apply@acme.myworkday.com"] })).toBe(
      true
    );
  });

  it("does not treat a lookalike domain as ATS", () => {
    expect(looksLikeApplication({ ...base, to: ["x@notlever.co"] })).toBe(false);
    expect(looksLikeApplication({ ...base, to: ["x@lever.company.com"] })).toBe(false);
  });

  it("matches recruiting local parts (careers@, jobs@, hr@, recruiting@, talent@)", () => {
    for (const addr of [
      "careers@acme.com",
      "jobs@acme.com",
      "hr@acme.com",
      "recruiting@acme.com",
      "recruiter@acme.com",
      "talent@acme.com",
    ]) {
      expect(looksLikeApplication({ ...base, to: [addr] })).toBe(true);
    }
  });

  it("ignores recruiting local parts on personal domains", () => {
    expect(looksLikeApplication({ ...base, to: ["hr@gmail.com"] })).toBe(false);
  });

  it("rejects ordinary personal mail", () => {
    expect(
      looksLikeApplication({
        subject: "Dinner on Friday?",
        snippet: "Are we still on for 8pm",
        to: ["friend@gmail.com"],
      })
    ).toBe(false);
  });

  it("rejects a newsletter-ish sent mail with no signals", () => {
    expect(
      looksLikeApplication({
        subject: "Re: Invoice #1234",
        snippet: "Attached is the paid invoice",
        to: ["billing@vendor.com"],
      })
    ).toBe(false);
  });

  it("keyword match is case-insensitive and word-bounded", () => {
    expect(looksLikeApplication({ ...base, subject: "APPLICATION enclosed" })).toBe(
      true
    );
    // "jobs" as substring of another word must not match ("job" is bounded)
    expect(looksLikeApplication({ ...base, subject: "storjobsx" })).toBe(false);
  });

  it("rejects mail addressed only to no-reply/notification boxes", () => {
    for (const addr of [
      "no-reply@naukri.com",
      "noreply@linkedin.com",
      "donotreply@company.com",
      "notifications@hirist.com",
      "jobalerts@naukri.com",
    ]) {
      expect(
        looksLikeApplication({
          ...base,
          subject: "Your job application update",
          to: [addr],
        })
      ).toBe(false);
    }
  });

  it("still accepts application mail when a real recipient is present", () => {
    expect(
      looksLikeApplication({
        ...base,
        subject: "Application for Backend Engineer",
        to: ["hr@acme.com", "no-reply@ats.acme.com"],
      })
    ).toBe(true);
  });
});
