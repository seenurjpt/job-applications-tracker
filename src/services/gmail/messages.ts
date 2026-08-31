import { mapWithConcurrency } from "@/lib/async";
import { gmailFetch } from "./client";

// Thin, typed wrappers over the Gmail REST API. Parsing lives here; storage
// decisions live in the sync pipeline.

export interface GmailListPage {
  ids: Array<{ id: string; threadId: string }>;
  nextPageToken: string | null;
  resultSizeEstimate: number;
}

export interface ParsedMessageMeta {
  gmailMessageId: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  sentAt: Date;
  rfcMessageId: string | null;
  references: string[];
  labelIds: string[];
}

interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

export async function listMessages(
  accessToken: string,
  q: string,
  pageToken: string | null,
  maxResults = 100
): Promise<GmailListPage> {
  const res = await gmailFetch<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(accessToken, "/gmail/v1/users/me/messages", {
    params: {
      q,
      maxResults: String(maxResults),
      pageToken: pageToken ?? undefined,
    },
  });
  return {
    ids: res.messages ?? [],
    nextPageToken: res.nextPageToken ?? null,
    resultSizeEstimate: res.resultSizeEstimate ?? 0,
  };
}

function header(raw: RawGmailMessage, name: string): string | null {
  const h = raw.payload?.headers?.find(
    (x) => x.name.toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? null;
}

/** Pulls bare addresses out of a To/From header value. */
export function parseAddressList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => {
      const angled = part.match(/<([^>]+)>/);
      const addr = (angled ? angled[1] : part) ?? "";
      return addr.trim().toLowerCase();
    })
    .filter((a) => a.includes("@"));
}

export function parseMessage(raw: RawGmailMessage): ParsedMessageMeta {
  const references = (header(raw, "References") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return {
    gmailMessageId: raw.id,
    threadId: raw.threadId,
    subject: header(raw, "Subject") ?? "",
    snippet: raw.snippet ?? "",
    from: parseAddressList(header(raw, "From"))[0] ?? "",
    to: parseAddressList(header(raw, "To")),
    sentAt: new Date(Number(raw.internalDate ?? 0)),
    rfcMessageId: header(raw, "Message-ID") ?? header(raw, "Message-Id"),
    references,
    labelIds: raw.labelIds ?? [],
  };
}

const METADATA_HEADERS = [
  "To",
  "From",
  "Subject",
  "Date",
  "Message-ID",
  "References",
];

export async function getMessageMetadata(
  accessToken: string,
  id: string
): Promise<ParsedMessageMeta> {
  const params: Record<string, string> = { format: "metadata" };
  const raw = await gmailFetch<RawGmailMessage>(
    accessToken,
    `/gmail/v1/users/me/messages/${id}?${METADATA_HEADERS.map(
      (h) => `metadataHeaders=${h}`
    ).join("&")}`,
    { params }
  );
  return parseMessage(raw);
}

/** Batch metadata fetch, concurrency 10, backoff handled by gmailFetch (§7.2). */
export async function getMetadataBatch(
  accessToken: string,
  ids: string[],
  concurrency = 10
): Promise<ParsedMessageMeta[]> {
  return mapWithConcurrency(ids, concurrency, (id) =>
    getMessageMetadata(accessToken, id)
  );
}

/** Full thread fetch — used only for confirmed applications (§7.6). */
export async function getThread(
  accessToken: string,
  threadId: string
): Promise<ParsedMessageMeta[]> {
  const res = await gmailFetch<{ messages?: RawGmailMessage[] }>(
    accessToken,
    `/gmail/v1/users/me/threads/${threadId}`,
    { params: { format: "metadata" } }
  );
  return (res.messages ?? []).map(parseMessage);
}

export async function getProfile(
  accessToken: string
): Promise<{ emailAddress: string; historyId: string }> {
  return gmailFetch(accessToken, "/gmail/v1/users/me/profile");
}

export interface HistoryPage {
  messagesAdded: Array<{ id: string; threadId: string; labelIds: string[] }>;
  nextPageToken: string | null;
  historyId: string | null;
  /** true when Gmail returned 404 — the history window has expired. */
  expired: boolean;
}

export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken: string | null
): Promise<HistoryPage> {
  try {
    const res = await gmailFetch<{
      history?: Array<{
        messagesAdded?: Array<{
          message: { id: string; threadId: string; labelIds?: string[] };
        }>;
      }>;
      nextPageToken?: string;
      historyId?: string;
    }>(accessToken, "/gmail/v1/users/me/history", {
      params: {
        startHistoryId,
        historyTypes: "messageAdded",
        pageToken: pageToken ?? undefined,
      },
    });
    const messagesAdded = (res.history ?? []).flatMap((h) =>
      (h.messagesAdded ?? []).map((m) => ({
        id: m.message.id,
        threadId: m.message.threadId,
        labelIds: m.message.labelIds ?? [],
      }))
    );
    return {
      messagesAdded,
      nextPageToken: res.nextPageToken ?? null,
      historyId: res.historyId ?? null,
      expired: false,
    };
  } catch (e) {
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 404) {
      return { messagesAdded: [], nextPageToken: null, historyId: null, expired: true };
    }
    throw e;
  }
}
