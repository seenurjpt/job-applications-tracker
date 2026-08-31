"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { analyzeIntents, getApplicationThread } from "@/actions/applications";
import { Button, Input, Select } from "@/components/ui";
import { InlineEditCell } from "@/components/inline-edit-cell";
import { StatusBadge } from "@/components/status-badge";
import { BulkDraftsBar } from "@/components/bulk-drafts-modal";
import type { ApplicationDTO, MessageDTO } from "@/lib/serialize";

const RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "applied", label: "Applied" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "replied", label: "Replied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "ghosted", label: "Ghosted" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

const INTENT_BADGE: Record<string, { label: string; className: string }> = {
  application: { label: "Applied", className: "bg-neutral-100 text-neutral-700" },
  follow_up: { label: "Follow-up", className: "bg-amber-50 text-amber-700" },
  interview: { label: "Interview", className: "bg-indigo-50 text-indigo-700" },
  negotiation: { label: "Negotiation", className: "bg-purple-50 text-purple-700" },
  other: { label: "Other", className: "bg-neutral-100 text-neutral-500" },
};

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-neutral-300">,</span>;
  const b = INTENT_BADGE[intent] ?? INTENT_BADGE.other!;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}
    >
      {b.label}
    </span>
  );
}

export function ApplicationsTable({
  applications,
  page,
  pageSize,
  total,
}: {
  applications: ApplicationDTO[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, MessageDTO[]>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  // Filters/sort live in URL search params so the back button restores state.
  // Changing any filter resets pagination to page 1.
  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const sortBy = searchParams.get("sortBy") ?? "appliedAt";
  const sortDir = searchParams.get("sortDir") ?? "desc";
  const toggleSort = (col: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", col);
    params.set("sortDir", sortBy === col && sortDir === "desc" ? "asc" : "desc");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!threads[id]) {
      const res = await getApplicationThread({ id });
      if (res.ok) setThreads((prev) => ({ ...prev, [id]: res.messages }));
    }
  };

  const columns = useMemo<ColumnDef<ApplicationDTO>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            data-testid={`select-row-${row.index}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        id: "company",
        header: () => (
          <button onClick={() => toggleSort("company")} className="font-medium">
            Company {sortBy === "company" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => (
          <InlineEditCell
            id={row.original.id}
            field="company"
            value={row.original.company}
            edited={row.original.userEditedFields.includes("company")}
          />
        ),
      },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => (
          <InlineEditCell
            id={row.original.id}
            field="role"
            value={row.original.role}
            edited={row.original.userEditedFields.includes("role")}
          />
        ),
      },
      {
        id: "appliedAt",
        header: () => (
          <button
            onClick={() => toggleSort("appliedAt")}
            className="font-medium"
            data-testid="sort-applied"
          >
            Applied {sortBy === "appliedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => (
          <span data-testid={`applied-at-${row.index}`}>
            {fmtDate(row.original.appliedAt)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "mailIntent",
        header: "Mailed for",
        cell: ({ row }) => <IntentBadge intent={row.original.mailIntent} />,
      },
      {
        id: "followUps",
        header: "Follow-ups",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.followUpCount}</span>
        ),
      },
      {
        id: "lastActivity",
        header: () => (
          <button onClick={() => toggleSort("lastActivityAt")} className="font-medium">
            Last activity{" "}
            {sortBy === "lastActivityAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => fmtDate(row.original.lastActivityAt),
      },
      {
        id: "thread",
        header: "",
        cell: ({ row }) => (
          <button
            className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            onClick={() => toggleExpand(row.original.id)}
            data-testid={`expand-row-${row.index}`}
            title={expanded === row.original.id ? "Hide thread" : "Show thread"}
          >
            {expanded === row.original.id ? "▾ thread" : "▸ thread"}
          </button>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/applications/${row.original.id}`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            Open
          </Link>
        ),
      },
    ],
    [sortBy, sortDir, expanded] // toggleSort is stable enough for this table's lifetime
  );

  const table = useReactTable({
    data: applications,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const selected = applications.filter((a) => rowSelection[a.id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          data-testid="range-filter"
          value={searchParams.get("range") ?? ""}
          onChange={(e) => setParam("range", e.target.value)}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          data-testid="status-filter"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          data-testid="search-input"
          placeholder="Search company, role, contact…"
          className="max-w-xs"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        {applications.some((a) => !a.mailIntent) ? (
          <button
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            data-testid="analyze-intents"
            disabled={analyzing}
            onClick={async () => {
              setAnalyzing(true);
              const res = await analyzeIntents();
              setAnalyzing(false);
              setAnalyzeMessage(
                res.ok
                  ? `Analyzed ${res.analyzed} application${res.analyzed === 1 ? "" : "s"}.`
                  : `Could not analyze: ${res.error}`
              );
              router.refresh();
            }}
          >
            {analyzing ? "Analyzing…" : "✨ Analyze intent"}
          </button>
        ) : null}
        {analyzeMessage ? (
          <span className="text-xs text-neutral-500">{analyzeMessage}</span>
        ) : null}
      </div>

      <BulkDraftsBar selected={selected} onDone={() => setRowSelection({})} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm" data-testid="applications-table">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 font-medium">
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  data-testid={`app-row-${row.index}`}
                  className="border-b border-neutral-100 hover:bg-neutral-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {expanded === row.original.id ? (
                  <tr>
                    <td colSpan={columns.length} className="p-0">
                      <div className="space-y-2 border-y border-neutral-200 bg-neutral-50 px-6 py-3">
                        <div className="flex justify-end">
                          <a
                            href={`https://mail.google.com/mail/u/0/#all/${row.original.threadId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-neutral-500 underline hover:text-neutral-800"
                          >
                            Open full thread in Gmail ↗
                          </a>
                        </div>
                        {(threads[row.original.id] ?? []).map((m) => (
                          <div
                            key={m.id}
                            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs"
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 font-medium ${
                                  m.direction === "outbound"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "bg-green-50 text-green-700"
                                }`}
                              >
                                {m.direction === "outbound" ? "You" : "Them"}
                              </span>
                              <span className="text-neutral-500">
                                {fmtDate(m.sentAt)}
                              </span>
                              {m.isFollowUp ? (
                                <em className="text-amber-700">follow-up</em>
                              ) : null}
                            </div>
                            <p className="font-medium text-neutral-800">
                              {m.subject}
                            </p>
                            <p className="mt-0.5 text-neutral-500">
                              {m.snippet}
                              {m.snippet.length >= 180 ? "…" : ""}
                            </p>
                          </div>
                        ))}
                        {!threads[row.original.id] ? (
                          <p className="text-xs text-neutral-400">Loading…</p>
                        ) : null}
                        {threads[row.original.id]?.length === 0 ? (
                          <p className="text-xs text-neutral-400">
                            No messages stored for this application.
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {applications.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-neutral-400"
                >
                  No applications yet. Run a sync from the dashboard.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {total > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
          <span data-testid="pagination-summary">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}
              data-testid="page-prev"
            >
              ← Prev
            </Button>
            <span className="px-2 tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setParam("page", String(page + 1))}
              data-testid="page-next"
            >
              Next →
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
