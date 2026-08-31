import { gmailFetch } from "./client";

/**
 * Builds an RFC 2822 message, base64URL-encoded for the Gmail API.
 *
 * A draft without In-Reply-To and References appears as a detached message
 * rather than a reply , the single most common Gmail API mistake (§5.6).
 */
export function buildRawMessage(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo: string | null; // original RFC Message-ID, e.g. <abc@mail.gmail.com>
  references: string[];
}): string {
  const subject = input.subject.startsWith("Re:")
    ? input.subject
    : `Re: ${input.subject}`;

  const headers = [
    `To: ${input.to}`,
    `From: ${input.from}`,
    `Subject: ${encodeHeader(subject)}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "MIME-Version: 1.0",
  ];

  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(
      `References: ${[...input.references, input.inReplyTo].join(" ")}`
    );
  }

  const encodedBody = Buffer.from(input.body, "utf8").toString("base64");
  const mime = `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;

  return Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, ""); // base64URL, unpadded
}

/** RFC 2047 encoded-word for non-ASCII header values. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Creates a Gmail draft attached to a thread. Both threadId AND the RFC
 * headers are required , threadId alone is not enough.
 */
export async function createDraft(
  accessToken: string,
  input: { raw: string; threadId: string }
): Promise<{ id: string }> {
  const res = await gmailFetch<{ id: string; message: { id: string } }>(
    accessToken,
    "/gmail/v1/users/me/drafts",
    {
      method: "POST",
      body: { message: { raw: input.raw, threadId: input.threadId } },
    }
  );
  return { id: res.id };
}
