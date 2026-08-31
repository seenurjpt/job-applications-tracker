// Configurable in-memory Gmail + Anthropic mock, served through MSW so the
// real client code (fetch wrappers, backoff, SDK) runs against realistic HTTP.

import { http, HttpResponse, type RequestHandler } from "msw";

export interface FixtureMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  internalDate: number; // epoch ms
  labelIds: string[]; // ["SENT"] or ["INBOX"]
  rfcMessageId?: string;
  references?: string[];
}

export interface ExtractionResponseRow {
  threadId: string;
  isJobApplication: boolean;
  confidence: number;
  company: string | null;
  role: string | null;
  contactName: string | null;
  source: "direct" | "linkedin" | "ats" | "referral" | "unknown";
}

export interface LoggedRequest {
  url: string;
  method: string;
  apiKey: string | null;
  authorization: string | null;
  body: unknown;
}

type AnthropicMode =
  | { kind: "auto" }
  | { kind: "error"; status: number; errorType: string; message: string; retryAfter?: string; times?: number }
  | { kind: "malformed"; text: string; times?: number };

type TokenMode = { kind: "ok" } | { kind: "invalid_grant" };

export class ApiFixture {
  messages: FixtureMessage[] = [];
  anthropicMode: AnthropicMode = { kind: "auto" };
  tokenMode: TokenMode = { kind: "ok" };
  /** Fail the Nth (1-based) drafts.create call with a 500. */
  failDraftCreateAt: number | null = null;
  /** history.list behaviour: message ids to report, or "expired" for a 404. */
  historyAdds: Array<{ id: string; threadId: string; labelIds: string[] }> | "expired" = [];
  /** Return 429 for the first N Gmail list calls, then succeed. */
  gmail429Remaining = 0;

  readonly log: LoggedRequest[] = [];
  draftCreates = 0;

  reset(): void {
    this.messages = [];
    this.anthropicMode = { kind: "auto" };
    this.tokenMode = { kind: "ok" };
    this.failDraftCreateAt = null;
    this.gmail429Remaining = 0;
    this.historyAdds = [];
    this.log.length = 0;
    this.draftCreates = 0;
  }

  gmailCalls(): LoggedRequest[] {
    return this.log.filter((r) => r.url.includes("gmail.googleapis.com"));
  }

  anthropicCalls(): LoggedRequest[] {
    return this.log.filter((r) => r.url.includes("api.anthropic.com"));
  }

  addSentThread(input: {
    threadId: string;
    subject: string;
    to: string[];
    snippet?: string;
    from?: string;
    days?: number[]; // outbound send days (epoch-day offsets from base)
    inboundDays?: number[];
  }): void {
    const base = Date.UTC(2026, 0, 1);
    const from = input.from ?? "me@example.com";
    const days = input.days ?? [0];
    days.forEach((d, i) => {
      this.messages.push({
        id: `${input.threadId}-out-${i}`,
        threadId: input.threadId,
        subject: i === 0 ? input.subject : `Re: ${input.subject}`,
        snippet: input.snippet ?? "",
        from,
        to: input.to,
        internalDate: base + d * 86_400_000,
        labelIds: ["SENT"],
        rfcMessageId: `<${input.threadId}-out-${i}@mail.example.com>`,
      });
    });
    (input.inboundDays ?? []).forEach((d, i) => {
      this.messages.push({
        id: `${input.threadId}-in-${i}`,
        threadId: input.threadId,
        subject: `Re: ${input.subject}`,
        snippet: "Thanks for reaching out, we received your application.",
        from: input.to[0] ?? "them@company.com",
        to: [from],
        internalDate: base + d * 86_400_000,
        labelIds: ["INBOX"],
        rfcMessageId: `<${input.threadId}-in-${i}@mail.example.com>`,
      });
    });
  }
}

export function addInboundOnlyThread(
  fixture: ApiFixture,
  input: {
    threadId: string;
    subject: string;
    from: string; // e.g. no-reply@boards.greenhouse.io
    snippet?: string;
    days?: number[];
  }
): void {
  const base = Date.UTC(2026, 0, 1);
  (input.days ?? [0]).forEach((d, i) => {
    fixture.messages.push({
      id: `${input.threadId}-in-${i}`,
      threadId: input.threadId,
      subject: i === 0 ? input.subject : `Re: ${input.subject}`,
      snippet: input.snippet ?? "Your application has been received.",
      from: input.from,
      to: ["me@example.com"],
      internalDate: base + d * 86_400_000,
      labelIds: ["INBOX"],
      rfcMessageId: `<${input.threadId}-in-${i}@mail.example.com>`,
    });
  });
}

function toRawGmail(m: FixtureMessage) {
  return {
    id: m.id,
    threadId: m.threadId,
    snippet: m.snippet,
    internalDate: String(m.internalDate),
    labelIds: m.labelIds,
    payload: {
      headers: [
        { name: "Subject", value: m.subject },
        { name: "From", value: m.from },
        { name: "To", value: m.to.join(", ") },
        { name: "Message-ID", value: m.rfcMessageId ?? `<${m.id}@x>` },
        ...(m.references?.length
          ? [{ name: "References", value: m.references.join(" ") }]
          : []),
      ],
    },
  };
}

/** Default auto-classifier: mirrors what a well-behaved model would return. */
function autoClassify(threads: Array<{ threadId: string; subject: string }>): ExtractionResponseRow[] {
  return threads.map((t) => {
    const isApp = /application|applying|engineer|resume|role/i.test(t.subject);
    return {
      threadId: t.threadId,
      isJobApplication: isApp,
      confidence: isApp ? 0.93 : 0.1,
      company: isApp ? `Company for ${t.threadId}` : null,
      role: isApp ? "Software Engineer" : null,
      contactName: null,
      source: "direct",
    };
  });
}

export function buildHandlers(fixture: ApiFixture): RequestHandler[] {
  const record = async (request: Request): Promise<LoggedRequest> => {
    let body: unknown = null;
    try {
      body = await request.clone().json();
    } catch {
      /* non-JSON body */
    }
    const entry: LoggedRequest = {
      url: request.url,
      method: request.method,
      apiKey: request.headers.get("x-api-key"),
      authorization: request.headers.get("authorization"),
      body,
    };
    fixture.log.push(entry);
    return entry;
  };

  return [
    // --- Google token endpoint -------------------------------------------
    http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
      await record(request);
      if (fixture.tokenMode.kind === "invalid_grant") {
        return HttpResponse.json(
          { error: "invalid_grant", error_description: "Token has been expired or revoked." },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        access_token: "refreshed-access-token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }),

    // --- Gmail list -------------------------------------------------------
    http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", async ({ request }) => {
      await record(request);
      if (fixture.gmail429Remaining > 0) {
        fixture.gmail429Remaining--;
        return HttpResponse.json(
          { error: { code: 429, message: "Rate limit" } },
          { status: 429, headers: { "retry-after": "0" } }
        );
      }
      const url = new URL(request.url);
      const maxResults = Number(url.searchParams.get("maxResults") ?? 100);
      const offset = Number(url.searchParams.get("pageToken") ?? 0);
      const q = url.searchParams.get("q") ?? "";
      // Emulate the two query shapes the app issues: in:sent date ranges and
      // the ATS-sender inbox pass (in:inbox from:(...)).
      const fromDomains = [...q.matchAll(/from:([\w.-]+)/g)].map((m) => m[1]!);
      const wantInbox = q.includes("in:inbox");
      const sent = fixture.messages
        .filter((m) =>
          wantInbox
            ? m.labelIds.includes("INBOX") &&
              fromDomains.some((d) => (m.from.split("@")[1] ?? "").endsWith(d))
            : m.labelIds.includes("SENT")
        )
        .sort((a, b) => b.internalDate - a.internalDate);
      const page = sent.slice(offset, offset + maxResults);
      const nextOffset = offset + maxResults;
      return HttpResponse.json({
        messages: page.map((m) => ({ id: m.id, threadId: m.threadId })),
        nextPageToken: nextOffset < sent.length ? String(nextOffset) : undefined,
        resultSizeEstimate: sent.length,
      });
    }),

    // --- Gmail profile ----------------------------------------------------
    http.get("https://gmail.googleapis.com/gmail/v1/users/me/profile", async ({ request }) => {
      await record(request);
      return HttpResponse.json({ emailAddress: "me@example.com", historyId: "hist-1" });
    }),

    // --- Gmail history.list ----------------------------------------------
    http.get("https://gmail.googleapis.com/gmail/v1/users/me/history", async ({ request }) => {
      await record(request);
      if (fixture.historyAdds === "expired") {
        return HttpResponse.json(
          { error: { code: 404, message: "historyId expired" } },
          { status: 404 }
        );
      }
      return HttpResponse.json({
        history: fixture.historyAdds.map((m) => ({
          messagesAdded: [{ message: { id: m.id, threadId: m.threadId, labelIds: m.labelIds } }],
        })),
        historyId: "hist-2",
      });
    }),

    // --- Gmail get message ------------------------------------------------
    http.get(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/:id",
      async ({ request, params }) => {
        await record(request);
        const m = fixture.messages.find((x) => x.id === params.id);
        if (!m) return HttpResponse.json({ error: "not found" }, { status: 404 });
        return HttpResponse.json(toRawGmail(m));
      }
    ),

    // --- Gmail get thread -------------------------------------------------
    http.get(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads/:id",
      async ({ request, params }) => {
        await record(request);
        const msgs = fixture.messages
          .filter((x) => x.threadId === params.id)
          .sort((a, b) => a.internalDate - b.internalDate);
        if (msgs.length === 0)
          return HttpResponse.json({ error: "not found" }, { status: 404 });
        return HttpResponse.json({ id: params.id, messages: msgs.map(toRawGmail) });
      }
    ),

    // --- Gmail drafts.create ---------------------------------------------
    http.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts", async ({ request }) => {
      await record(request);
      fixture.draftCreates++;
      if (fixture.failDraftCreateAt === fixture.draftCreates) {
        return HttpResponse.json(
          { error: { code: 400, message: "Invalid draft" } },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        id: `draft-${fixture.draftCreates}`,
        message: { id: `draft-msg-${fixture.draftCreates}` },
      });
    }),

    // --- Anthropic messages ----------------------------------------------
    http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
      const entry = await record(request);
      const mode = fixture.anthropicMode;
      if (mode.kind === "error") {
        if (mode.times !== undefined) {
          if (mode.times <= 0) {
            fixture.anthropicMode = { kind: "auto" };
            // fall through to auto below by re-dispatching
          } else {
            mode.times--;
            return HttpResponse.json(
              { type: "error", error: { type: mode.errorType, message: mode.message } },
              {
                status: mode.status,
                headers: mode.retryAfter ? { "retry-after": mode.retryAfter } : {},
              }
            );
          }
        } else {
          return HttpResponse.json(
            { type: "error", error: { type: mode.errorType, message: mode.message } },
            {
              status: mode.status,
              headers: mode.retryAfter ? { "retry-after": mode.retryAfter } : {},
            }
          );
        }
      }

      const body = entry.body as {
        model: string;
        system?: string;
        messages: Array<{ role: string; content: string }>;
      };

      let text: string;
      if (fixture.anthropicMode.kind === "malformed") {
        const m = fixture.anthropicMode;
        text = m.text;
        if (m.times !== undefined) {
          m.times--;
          if (m.times <= 0) fixture.anthropicMode = { kind: "auto" };
        }
      } else if (body.system?.includes("classify email threads")) {
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
        const threads = JSON.parse(lastUser!.content) as Array<{
          threadId: string;
          subject: string;
        }>;
        text = JSON.stringify(autoClassify(threads));
      } else if (body.system?.includes("classify replies")) {
        text = JSON.stringify({ classification: "neutral" });
      } else {
        text = "Following up briefly on my application , happy to share anything else you need.";
      }

      return HttpResponse.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 45 },
      });
    }),
  ];
}
