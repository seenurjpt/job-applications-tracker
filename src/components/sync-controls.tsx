"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  estimateBackfill,
  refreshNow,
  resumeSync,
  startBackfill,
} from "@/actions/sync";
import { Button, Select } from "@/components/ui";
import type { SyncJobDTO } from "@/lib/serialize";

/** Mirrors STALL_AFTER_MS in actions/sync.ts. */
const STALL_AFTER_MS = 90_000;
const POLL_INTERVAL_MS = 5_000;

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Creation time embedded in a MongoDB ObjectId hex string. */
function idTimestamp(id: string): number {
  return parseInt(id.slice(0, 8), 16) * 1000;
}

/**
 * Live view of a queued/running job: ticking elapsed time, periodic refresh
 * of the server-held stats, and stall recovery — when the heartbeat (persisted
 * in MongoDB with the page cursor) goes silent, the job's runner died, so we
 * resume it from where it stopped. No browser storage involved: the server is
 * the source of truth, so this works after refreshes and reconnects alike.
 */
function ActiveJobBanner({ job }: { job: SyncJobDTO }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const resumeAttempted = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);

  const lastSignal = job.heartbeatAt ?? job.startedAt;
  const lastSignalMs = lastSignal ? Date.parse(lastSignal) : idTimestamp(job.id);
  const stalled = now - lastSignalMs > STALL_AFTER_MS;
  const startedMs = job.startedAt ? Date.parse(job.startedAt) : null;

  const doResume = async () => {
    setResuming(true);
    setResumeError(null);
    const res = await resumeSync({ jobId: job.id });
    setResuming(false);
    // "job_still_active" means the runner was alive after all — just refresh.
    if (!res.ok && res.error !== "job_still_active") {
      setResumeError(res.error);
    }
    router.refresh();
  };

  // Auto-resume once per mount; further attempts stay manual so a repeated
  // failure can't loop.
  useEffect(() => {
    if (stalled && !resumeAttempted.current) {
      resumeAttempted.current = true;
      void doResume();
    }
  }, [stalled]);

  if (resuming || (stalled && !resumeError)) {
    return (
      <div
        className="flex items-center gap-3 text-sm text-amber-700"
        data-testid="sync-resuming"
      >
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-600" />
        Sync was interrupted — resuming from where it stopped…
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
        Sync {job.status} — {job.stats.listed} listed, {job.stats.classified}{" "}
        classified, {job.stats.applications} applications found.
        {startedMs !== null ? (
          <span className="tabular-nums text-neutral-500" data-testid="sync-elapsed">
            {formatElapsed(now - startedMs)}
          </span>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>
      {resumeError ? (
        <p className="text-xs text-red-600">
          Could not resume automatically ({resumeError}).{" "}
          <button className="underline" onClick={() => void doResume()}>
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}

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
    return <ActiveJobBanner job={activeJob} />;
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
