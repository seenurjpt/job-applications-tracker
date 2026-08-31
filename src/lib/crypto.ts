import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// AES-256-GCM. Payload format: base64(iv).base64(tag).base64(ciphertext)
// Used for Gmail OAuth tokens and user Anthropic API keys alike.

function key(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex"); // 32 bytes
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64")) as [
    Buffer,
    Buffer,
    Buffer,
  ];
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
