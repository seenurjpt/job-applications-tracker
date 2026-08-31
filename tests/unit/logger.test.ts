import { describe, it, expect, afterEach } from "vitest";
import { logger, redact, setLogSinkForTests } from "@/lib/logger";

afterEach(() => setLogSinkForTests(null));

function capture(): { lines: string[] } {
  const lines: string[] = [];
  setLogSinkForTests((_level, line) => lines.push(line));
  return { lines };
}

describe("logger redaction", () => {
  it("redacts Anthropic API keys in strings", () => {
    expect(redact("key is sk-ant-api03-AbCd_123-xyz here")).toBe(
      "key is sk-ant-[REDACTED] here"
    );
  });

  it("redacts Google access tokens", () => {
    expect(redact("token ya29.a0AbCdEf-gh done")).toContain("ya29.[REDACTED]");
  });

  it("redacts token-shaped JSON fields", () => {
    const line = redact(
      JSON.stringify({ access_token: "opaque-value", other: "keep" })
    );
    expect(line).not.toContain("opaque-value");
    expect(line).toContain("keep");
  });

  it("never writes a key to the sink when logging an object", () => {
    const { lines } = capture();
    logger.error("verification failed", {
      apiKey: "sk-ant-api03-SECRETSECRET",
      status: 401,
    });
    const all = lines.join("\n");
    expect(all).not.toMatch(/sk-ant-[A-Za-z0-9_-]+/);
    expect(all).toContain("401");
  });

  it("redacts keys embedded in Error messages", () => {
    const { lines } = capture();
    logger.error("boom", new Error("401 for key sk-ant-oops-123"));
    expect(lines.join("\n")).not.toContain("sk-ant-oops-123");
  });

  it("redacts keys in the message itself", () => {
    const { lines } = capture();
    logger.info("saved sk-ant-raw-key-here");
    expect(lines.join("\n")).not.toContain("sk-ant-raw-key-here");
  });
});
