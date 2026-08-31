import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env, resetEnvCacheForTests } from "@/lib/env";

const REQUIRED = {
  MONGODB_URI: "mongodb://localhost:27017/test",
  MONGODB_DB: "test",
  AUTH_SECRET: "x".repeat(32),
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "cs",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  resetEnvCacheForTests();
});

afterEach(() => {
  process.env = saved;
  resetEnvCacheForTests();
});

describe("env validation", () => {
  it("parses a valid environment and applies model defaults", () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.ANTHROPIC_EXTRACTION_MODEL;
    delete process.env.ANTHROPIC_API_KEY_DEV;
    expect(env.MONGODB_DB).toBe("test");
    expect(env.ANTHROPIC_EXTRACTION_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("rejects a short TOKEN_ENCRYPTION_KEY", () => {
    Object.assign(process.env, REQUIRED, { TOKEN_ENCRYPTION_KEY: "abc" });
    expect(() => env.MONGODB_DB).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("rejects a dev key that does not start with sk-ant-", () => {
    Object.assign(process.env, REQUIRED, { ANTHROPIC_API_KEY_DEV: "wrong" });
    expect(() => env.MONGODB_DB).toThrow();
  });

  it("refuses to boot with ANTHROPIC_API_KEY_DEV set in production", () => {
    Object.assign(process.env, REQUIRED, {
      ANTHROPIC_API_KEY_DEV: "sk-ant-dev-key",
    });
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    expect(() => env.MONGODB_DB).toThrow(/must not be set in production/);
  });

  it("allows ANTHROPIC_API_KEY_DEV outside production", () => {
    Object.assign(process.env, REQUIRED, {
      ANTHROPIC_API_KEY_DEV: "sk-ant-dev-key",
    });
    expect(env.ANTHROPIC_API_KEY_DEV).toBe("sk-ant-dev-key");
  });

  it("refuses E2E_TEST_MODE in production", () => {
    Object.assign(process.env, REQUIRED, { E2E_TEST_MODE: "1" });
    delete process.env.ANTHROPIC_API_KEY_DEV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    expect(() => env.MONGODB_DB).toThrow(/E2E_TEST_MODE/);
  });
});
