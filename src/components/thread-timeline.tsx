"use client";

import { useState } from "react";
import { getFullMessage } from "@/actions/applications";
import type { MessageDTO } from "@/lib/serialize";

/**
 * Thread timeline with on-demand full-message expansion. Only the ~200-char
 * Gmail snippet is stored; the full body is fetched live from Gmail when the
 * user asks for it, and kept in client state only.
 */
export function ThreadTimeline({
  applicationId,
  threadId,
  messages,
}: {
  applicationId: string;
  threadId: string;
  messages: MessageDTO[];
}) {
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (messageId: string) => {
    if (open[messageId]) {
      setOpen((p) => ({ ...p, [messageId]: false }));
      return;
    }
    setOpen((p) => ({ ...p, [messageId]: true }));
    if (bodies[messageId]) return;
    setLoading(messageId);
    setError(null);
    const res = await getFullMessage({ applicationId, messageId });
    setLoading(null);
    if (res.ok) {
      setBodies((p) => ({ ...p, [messageId]: res.body }));
    } else {
      setOpen((p) => ({ ...p, [messageId]: false }));
      setError(
        res.error === "no_body"
          ? "Gmail returned no readable body for this message."
          : `Could not load the full message (${res.error}).`
      );
    }
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <a
          href={`https://mail.google.com/mail/u/0/#all/${threadId}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 underline hover:text-neutral-800"
        >
          Open in Gmail ↗
        </a>
      </div>
      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            <div className="flex gap-3">
              <span
                className={`w-16 shrink-0 font-medium ${
                  m.direction === "outbound" ? "text-blue-700" : "text-green-700"
                }`}
              >
                {m.direction === "outbound" ? "You →" : "← Them"}
              </span>
              <span className="w-28 shrink-0 text-neutral-500">
                {new Date(m.sentAt).toLocaleDateString()}
              </span>
              <span className="min-w-0">
                <strong>{m.subject}</strong>
                {!open[m.id] ? (
                  <span className="text-neutral-500"> — {m.snippet}…</span>
                ) : null}
                {m.isFollowUp ? (
                  <em className="ml-2 text-amber-700">follow-up</em>
                ) : null}{" "}
                <button
                  className="text-xs text-neutral-400 underline hover:text-neutral-700"
                  onClick={() => void toggle(m.id)}
                  data-testid={`toggle-body-${m.id}`}
                >
                  {open[m.id]
                    ? "hide"
                    : loading === m.id
                      ? "loading…"
                      : "show full message"}
                </button>
              </span>
            </div>
            {open[m.id] && bodies[m.id] ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 font-sans text-xs text-neutral-700">
                {bodies[m.id]}
              </pre>
            ) : null}
            {open[m.id] && !bodies[m.id] ? (
              <p className="mt-2 text-xs text-neutral-400">Loading full message…</p>
            ) : null}
          </li>
        ))}
        {messages.length === 0 ? (
          <li className="text-sm text-neutral-400">No messages stored.</li>
        ) : null}
      </ol>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
