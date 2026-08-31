import { describe, it, expect } from "vitest";
import { buildRawMessage } from "@/services/gmail/drafts";

function decodeRaw(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function headersOf(mime: string): Record<string, string> {
  const [head] = mime.split("\r\n\r\n");
  const out: Record<string, string> = {};
  for (const line of head!.split("\r\n")) {
    const idx = line.indexOf(": ");
    if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return out;
}

function bodyOf(mime: string): string {
  const idx = mime.indexOf("\r\n\r\n");
  return Buffer.from(mime.slice(idx + 4), "base64").toString("utf8");
}

const base = {
  to: "careers@acme.com",
  from: "me@gmail.com",
  subject: "Application for Staff Engineer",
  body: "Just following up on my application.",
  inReplyTo: "<orig-123@mail.gmail.com>",
  references: [] as string[],
};

describe("buildRawMessage", () => {
  it("is base64URL without padding", () => {
    const raw = buildRawMessage(base);
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("adds Re: to the subject and sets threading headers", () => {
    const h = headersOf(decodeRaw(buildRawMessage(base)));
    expect(h["Subject"]).toBe("Re: Application for Staff Engineer");
    expect(h["In-Reply-To"]).toBe("<orig-123@mail.gmail.com>");
    expect(h["References"]).toBe("<orig-123@mail.gmail.com>");
    expect(h["To"]).toBe("careers@acme.com");
    expect(h["From"]).toBe("me@gmail.com");
  });

  it("does not double-prefix a subject already starting with Re:", () => {
    const h = headersOf(
      decodeRaw(buildRawMessage({ ...base, subject: "Re: Application" }))
    );
    expect(h["Subject"]).toBe("Re: Application");
  });

  it("appends inReplyTo to an existing reference chain, preserving order", () => {
    const refs = ["<a@x>", "<b@x>", "<c@x>"];
    const h = headersOf(decodeRaw(buildRawMessage({ ...base, references: refs })));
    expect(h["References"]).toBe("<a@x> <b@x> <c@x> <orig-123@mail.gmail.com>");
  });

  it("handles a long reference chain", () => {
    const refs = Array.from({ length: 50 }, (_, i) => `<ref-${i}@mail.gmail.com>`);
    const h = headersOf(decodeRaw(buildRawMessage({ ...base, references: refs })));
    expect(h["References"]!.split(" ")).toHaveLength(51);
  });

  it("omits threading headers when inReplyTo is null (new thread)", () => {
    const h = headersOf(decodeRaw(buildRawMessage({ ...base, inReplyTo: null })));
    expect(h["In-Reply-To"]).toBeUndefined();
    expect(h["References"]).toBeUndefined();
  });

  it("encodes a non-ASCII subject as an RFC 2047 encoded word", () => {
    const h = headersOf(
      decodeRaw(buildRawMessage({ ...base, subject: "Bewerbung — Straße Café" }))
    );
    expect(h["Subject"]).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const encoded = h["Subject"]!.match(/^=\?UTF-8\?B\?(.+)\?=$/)![1]!;
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(
      "Re: Bewerbung — Straße Café"
    );
  });

  it("round-trips a non-ASCII body", () => {
    const mime = decodeRaw(
      buildRawMessage({ ...base, body: "नमस्ते — following up 🙂" })
    );
    expect(bodyOf(mime)).toBe("नमस्ते — following up 🙂");
  });
});
