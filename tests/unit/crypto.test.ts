import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.MONGODB_DB = "test";
  process.env.AUTH_SECRET = "x".repeat(32);
  process.env.GOOGLE_CLIENT_ID = "test";
  process.env.GOOGLE_CLIENT_SECRET = "test";
});

describe("crypto", () => {
  it("round-trips plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    for (const value of ["hello", "", "🙂 unicode ✓", "x".repeat(10_000)]) {
      expect(decrypt(encrypt(value))).toBe(value);
    }
  });

  it("produces a different ciphertext per call (fresh IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("throws on tampered ciphertext rather than returning garbage", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const payload = encrypt("secret token value");
    const [iv, tag, enc] = payload.split(".") as [string, string, string];
    const tamperedEnc = Buffer.from(enc, "base64");
    tamperedEnc[0] = tamperedEnc[0]! ^ 0xff;
    const tampered = [iv, tag, tamperedEnc.toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on a tampered auth tag", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const payload = encrypt("secret");
    const [iv, tag, enc] = payload.split(".") as [string, string, string];
    const badTag = Buffer.from(tag, "base64");
    badTag[0] = badTag[0]! ^ 0xff;
    expect(() => decrypt([iv, badTag.toString("base64"), enc].join("."))).toThrow();
  });

  it("throws on a malformed payload", async () => {
    const { decrypt } = await import("@/lib/crypto");
    expect(() => decrypt("not-a-payload")).toThrow();
  });
});
