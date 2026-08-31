// Tiny HTTP stub emulating Gmail, Google's token endpoint, and the Anthropic
// API for E2E runs. The Next dev server is pointed here via GMAIL_API_BASE,
// GOOGLE_TOKEN_ENDPOINT, and ANTHROPIC_BASE_URL. Never used outside E2E.

import http from "node:http";

const BASE_DAY = Date.UTC(2026, 5, 1);
const state = {
  anthropicMode: "ok", // "ok" | "401"
  messages: [],
  draftCount: 0,
};

export function seedMailbox() {
  state.messages = [];
  const add = (threadId, subject, to, dayOffsets, inboundDays = []) => {
    dayOffsets.forEach((d, i) =>
      state.messages.push({
        id: `${threadId}-out-${i}`,
        threadId,
        subject: i === 0 ? subject : `Re: ${subject}`,
        snippet: "Please find my resume attached.",
        from: "e2e@example.com",
        to,
        internalDate: BASE_DAY + d * 86_400_000,
        labelIds: ["SENT"],
      })
    );
    inboundDays.forEach((d, i) =>
      state.messages.push({
        id: `${threadId}-in-${i}`,
        threadId,
        subject: `Re: ${subject}`,
        snippet: "Thanks, we will be in touch.",
        from: to[0],
        to: ["e2e@example.com"],
        internalDate: BASE_DAY + d * 86_400_000,
        labelIds: ["INBOX"],
      })
    );
  };
  add("th-alpha", "Application for Backend Engineer", ["careers@alphaco.com"], [0, 8]);
  add("th-beta", "Applying for Product Designer role", ["jobs@betacorp.io"], [2], [4]);
  add("th-gamma", "Resume for Data Engineer position", ["hr@gammasoft.dev"], [5]);
  add("th-noise", "Lunch tomorrow?", ["friend@gmail.com"], [3]);
}
seedMailbox();

function raw(m) {
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
        { name: "Message-ID", value: `<${m.id}@mail.example.com>` },
      ],
    },
  };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function startStubServer(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = url.pathname;

    // --- E2E control plane ---
    if (p === "/__control" && req.method === "POST") {
      const body = await readBody(req);
      if (body.anthropicMode) state.anthropicMode = body.anthropicMode;
      if (body.reseed) seedMailbox();
      return json(res, 200, { ok: true, state: { anthropicMode: state.anthropicMode } });
    }

    // --- Google token endpoint ---
    if (p === "/token") {
      return json(res, 200, {
        access_token: "e2e-access",
        refresh_token: "e2e-refresh",
        expires_in: 3600,
        scope:
          "openid https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
      });
    }

    // --- Anthropic ---
    if (p === "/anthropic/v1/messages" && req.method === "POST") {
      if (state.anthropicMode === "401") {
        return json(res, 401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        });
      }
      const body = await readBody(req);
      let text;
      if (body.system?.includes("classify email threads")) {
        const last = [...body.messages].reverse().find((m) => m.role === "user");
        const threads = JSON.parse(last.content);
        text = JSON.stringify(
          threads.map((t) => {
            const isApp = /application|applying|resume|engineer|designer/i.test(t.subject);
            return {
              threadId: t.threadId,
              isJobApplication: isApp,
              confidence: isApp ? 0.95 : 0.05,
              company: isApp ? companyFor(t.threadId) : null,
              role: isApp ? roleFor(t.threadId) : null,
              contactName: null,
              source: "direct",
            };
          })
        );
      } else if (body.system?.includes("classify replies")) {
        text = JSON.stringify({ classification: "neutral" });
      } else {
        text =
          "Hi , I wanted to follow up on my application. I remain very interested in the role and would welcome any update on the timeline.";
      }
      return json(res, 200, {
        id: "msg_e2e",
        type: "message",
        role: "assistant",
        model: body.model ?? "stub",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 40 },
      });
    }

    // --- Gmail ---
    if (p === "/gmail/v1/users/me/messages" && req.method === "GET") {
      const sent = state.messages
        .filter((m) => m.labelIds.includes("SENT"))
        .sort((a, b) => b.internalDate - a.internalDate);
      return json(res, 200, {
        messages: sent.map((m) => ({ id: m.id, threadId: m.threadId })),
        resultSizeEstimate: sent.length,
      });
    }
    if (p === "/gmail/v1/users/me/profile") {
      return json(res, 200, { emailAddress: "e2e@example.com", historyId: "h1" });
    }
    const msgMatch = p.match(/^\/gmail\/v1\/users\/me\/messages\/(.+)$/);
    if (msgMatch) {
      const m = state.messages.find((x) => x.id === decodeURIComponent(msgMatch[1]));
      return m ? json(res, 200, raw(m)) : json(res, 404, { error: "not found" });
    }
    const threadMatch = p.match(/^\/gmail\/v1\/users\/me\/threads\/(.+)$/);
    if (threadMatch) {
      const msgs = state.messages
        .filter((x) => x.threadId === decodeURIComponent(threadMatch[1]))
        .sort((a, b) => a.internalDate - b.internalDate);
      return msgs.length
        ? json(res, 200, { id: threadMatch[1], messages: msgs.map(raw) })
        : json(res, 404, { error: "not found" });
    }
    if (p === "/gmail/v1/users/me/drafts" && req.method === "POST") {
      state.draftCount++;
      return json(res, 200, {
        id: `e2e-draft-${state.draftCount}`,
        message: { id: `e2e-draft-msg-${state.draftCount}` },
      });
    }
    if (p === "/gmail/v1/users/me/history") {
      return json(res, 200, { history: [], historyId: "h1" });
    }

    json(res, 404, { error: `no stub for ${req.method} ${p}` });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

function companyFor(threadId) {
  return { "th-alpha": "AlphaCo", "th-beta": "BetaCorp", "th-gamma": "GammaSoft" }[threadId] ?? "Unknown Co";
}
function roleFor(threadId) {
  return {
    "th-alpha": "Backend Engineer",
    "th-beta": "Product Designer",
    "th-gamma": "Data Engineer",
  }[threadId] ?? "Engineer";
}

// Allow running standalone: node e2e/stub-server.mjs 3101
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const port = Number(process.argv[2] ?? 3101);
  startStubServer(port).then(() => console.log(`stub server on :${port}`));
}
