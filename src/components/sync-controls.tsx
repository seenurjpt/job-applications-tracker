"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  estimateBackfill,
  refreshNow,
  resumeSync,
  startBackfill,
} from "@/actions/sync";
import { Button, Select } from "@/components/ui";
import type { SyncJobDTO } from "@/lib/serialize";

const PRESETS = [
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
] as const;

export function SyncControls({
  accountId,
  canSync,
  disabledReason,
  activeJob,
}: {
  accountId: string;
  canSync: boolean;
  disabledReason: string | null;
  activeJob: SyncJobDTO | null;
}) {
  const [preset, setPreset] =
    useState<(typeof PRESETS)[number]["value"]>("last_3_months");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const router = useRouter();

  const fetchEstimate = () =>
    startTransition(async () => {
      const res = await estimateBackfill({ accountId, preset });
      setEstimate(
        res.ok
          ? `About ${res.messages} sent messages in range — the free prefilter drops most; expect roughly ${res.approxRequests} classification request${res.approxRequests === 1 ? "" : "s"} to your Anthropic account.`
          : "Could not estimate right now."
      );
    });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setMessage(null);
      const res = await fn();
      if (!res.ok) setMessage(`Sync failed to start: ${res.error}`);
      router.refresh();
    });

  if (activeJob?.status === "paused") {
    return (
      <div className="flex items-center gap-3" data-testid="sync-paused">
        <span className="text-sm text-amber-700">
          Sync paused ({activeJob.pausedReason ?? "unknown reason"}) — it will
          continue from where it stopped.
        </span>
        <Button
          size="sm"
          data-testid="resume-sync"
          disabled={pending || !canSync}
          onClick={() => run(() => resumeSync({ jobId: activeJob.id }))}
        >
          Resume
        </Button>
      </div>
    );
  }

  if (activeJob && (activeJob.status === "running" || activeJob.status === "queued")) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
        Sync {activeJob.status} — {activeJob.stats.listed} listed,{" "}
        {activeJob.stats.classified} classified,{" "}
        {activeJob.stats.applications} applications found.
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={preset}
          onChange={(e) =>
            setPreset(e.target.value as (typeof PRESETS)[number]["value"])
          }
          data-testid="sync-preset"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <span title={disabledReason ?? undefined}>
          <Button
            data-testid="start-sync"
            disabled={!canSync || pending}
            onClick={() => run(() => startBackfill({ accountId, preset }))}
          >
            {pending ? "Starting…" : "Sync sent mail"}
          </Button>
        </span>
        <Button
          variant="outline"
          data-testid="refresh-now"
          disabled={!canSync || pending}
          onClick={() => run(() => refreshNow({ accountId }))}
        >
          Refresh now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="estimate-sync"
          disabled={!canSync || pending}
          onClick={fetchEstimate}
        >
          Estimate cost
        </Button>
      </div>
      {estimate ? (
        <p className="text-xs text-neutral-500" data-testid="sync-estimate">
          {estimate}
        </p>
      ) : null}
      {!canSync && disabledReason ? (
        <p className="text-xs text-neutral-500" data-testid="sync-disabled-reason">
          {disabledReason}
        </p>
      ) : null}
      {message ? <p className="text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
