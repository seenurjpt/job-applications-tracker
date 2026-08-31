"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateDrafts, bulkGenerateDrafts } from "@/actions/drafts";
import { Button, Select } from "@/components/ui";
import type { ApplicationDTO } from "@/lib/serialize";
import type { DraftToneValue } from "@/db/schemas";

interface ReviewRow {
  applicationId: string;
  company: string | null;
  role: string | null;
  draftId: string | null;
  subject: string;
  body: string;
  generateError: string | null;
  createState: "pending" | "creating" | "created" | "failed";
  createError: string | null;
}

const TONES: Array<{ value: DraftToneValue; label: string }> = [
  { value: "polite_nudge", label: "Polite nudge" },
  { value: "value_add", label: "Value add" },
  { value: "final_check_in", label: "Final check-in" },
];

/**
 * Bulk flow (phase 6): generate all bodies → one review screen with per-row
 * edit → queued creation with per-row progress and per-row retry. A mid-batch
 * failure leaves the other rows created , no total rollback.
 */
export function BulkDraftsBar({
  selected,
  onDone,
}: {
  selected: ApplicationDTO[];
  onDone: () => void;
}) {
  const [tone, setTone] = useState<DraftToneValue>("polite_nudge");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [generating, startGenerate] = useTransition();
  const [creating, startCreate] = useTransition();
  const router = useRouter();

  const generate = () =>
    startGenerate(async () => {
      const res = await bulkGenerateDrafts({
        applicationIds: selected.map((a) => a.id),
        tone,
      });
      if (!res.ok) return;
      // res.rows returns per-application outcome; fetch bodies via row data
      setRows(
        res.rows.map((r) => {
          const app = selected.find((a) => a.id === r.applicationId)!;
          return {
            applicationId: r.applicationId,
            company: app.company,
            role: app.role,
            draftId: r.draftId,
            subject: r.subject ?? "",
            body: r.body ?? "",
            generateError: r.ok ? null : r.error,
            createState: "pending" as const,
            createError: null,
          };
        })
      );
    });

  const createAll = (only?: string[]) =>
    startCreate(async () => {
      if (!rows) return;
      const targets = rows.filter(
        (r) =>
          r.draftId &&
          r.createState !== "created" &&
          (!only || only.includes(r.draftId))
      );
      setRows((prev) =>
        prev!.map((r) =>
          targets.some((t) => t.draftId === r.draftId)
            ? { ...r, createState: "creating" }
            : r
        )
      );
      const res = await bulkCreateDrafts({
        rows: targets.map((r) => ({
          draftId: r.draftId!,
          subject: r.subject || undefined,
          body: r.body || undefined,
        })),
      });
      if (!res.ok) return;
      setRows((prev) =>
        prev!.map((r) => {
          const outcome = res.rows.find((o) => o.draftId === r.draftId);
          if (!outcome) return r;
          return outcome.ok
            ? { ...r, createState: "created", createError: null }
            : { ...r, createState: "failed", createError: outcome.error };
        })
      );
      router.refresh();
    });

  if (selected.length === 0) return null;

  return (
    <>
      <div
        data-testid="bulk-bar"
        className="flex items-center gap-3 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm shadow-sm"
      >
        <span className="font-medium">{selected.length} selected</span>
        <Select
          value={tone}
          onChange={(e) => setTone(e.target.value as DraftToneValue)}
          data-testid="bulk-tone"
        >
          {TONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          onClick={generate}
          disabled={generating}
          data-testid="bulk-generate"
        >
          {generating ? "Generating…" : "Generate drafts"}
        </Button>
      </div>

      {rows ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <div
            className="w-full max-w-3xl space-y-4 rounded-lg bg-white p-6 shadow-xl"
            data-testid="bulk-review-modal"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review drafts</h2>
              <button
                className="text-sm text-neutral-500 hover:text-neutral-900"
                onClick={() => {
                  setRows(null);
                  onDone();
                }}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {rows.map((r, i) => (
                <div
                  key={r.applicationId}
                  className="rounded-md border border-neutral-200 p-3"
                  data-testid={`bulk-row-${i}`}
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {r.company ?? "Unknown"} , {r.role ?? "Unknown role"}
                    </span>
                    <span
                      data-testid={`bulk-row-state-${i}`}
                      className={
                        r.createState === "created"
                          ? "text-green-700"
                          : r.createState === "failed"
                            ? "text-red-700"
                            : "text-neutral-500"
                      }
                    >
                      {r.generateError
                        ? `generation failed: ${r.generateError}`
                        : r.createState === "created"
                          ? "created in Gmail"
                          : r.createState === "failed"
                            ? `failed: ${r.createError}`
                            : r.createState}
                    </span>
                  </div>
                  {r.draftId ? (
                    <>
                      <input
                        className="mb-2 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                        value={r.subject}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev!.map((x, xi) =>
                              xi === i ? { ...x, subject: e.target.value } : x
                            )
                          )
                        }
                      />
                      <textarea
                        className="h-28 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                        value={r.body}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev!.map((x, xi) =>
                              xi === i ? { ...x, body: e.target.value } : x
                            )
                          )
                        }
                      />
                      {r.createState === "failed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`bulk-retry-${i}`}
                          onClick={() => createAll([r.draftId!])}
                        >
                          Retry this draft
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                data-testid="bulk-confirm"
                disabled={creating || rows.every((r) => !r.draftId)}
                onClick={() => createAll()}
              >
                {creating ? "Creating…" : "Create drafts in Gmail"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
