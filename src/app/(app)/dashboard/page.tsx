import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import * as applicationsRepo from "@/db/repositories/applications";
import * as syncJobsRepo from "@/db/repositories/sync-jobs";
import { toAccountDTO, toSyncJobDTO } from "@/lib/serialize";
import { Card } from "@/components/ui";
import { SyncControls } from "@/components/sync-controls";

const STAT_LABELS: Array<{ key: string; label: string }> = [
  { key: "applied", label: "Applied" },
  { key: "needs_follow_up", label: "Needs follow-up" },
  { key: "replied", label: "Replied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "rejected", label: "Rejected" },
  { key: "ghosted", label: "Ghosted" },
];

export default async function DashboardPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");

  const [accounts, apiKey, counts] = await Promise.all([
    accountsRepo.findByUser(userId),
    apiKeysRepo.findByUser(userId),
    applicationsRepo.countByStatus(userId),
  ]);

  const account = accounts[0] ?? null;
  const gmailReady = account?.status === "active";
  const keyValid = apiKey?.status === "valid";
  const canSync = Boolean(gmailReady && keyValid);
  const disabledReason = !account
    ? "Connect a Gmail account first — see onboarding."
    : !gmailReady
      ? "Gmail needs to be reconnected before syncing."
      : !keyValid
        ? "Add a valid Anthropic API key in settings before syncing — the sync classifies threads with your key."
        : null;

  const activeJob = account
    ? await syncJobsRepo.findActiveForAccount(account._id)
    : null;
  const lastJob =
    !activeJob && account ? await syncJobsRepo.latestForAccount(account._id) : null;

  if (!account && !apiKey) redirect("/onboarding");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          {account ? (
            <p className="mt-1 text-sm text-neutral-500">
              {account.email}
              {account.lastSyncAt
                ? ` · last synced ${account.lastSyncAt.toLocaleString()}`
                : " · never synced"}
            </p>
          ) : null}
        </div>
        {account ? (
          <SyncControls
            accountId={toAccountDTO(account).id}
            canSync={canSync}
            disabledReason={disabledReason}
            activeJob={activeJob ? toSyncJobDTO(activeJob) : null}
          />
        ) : (
          <Link href="/onboarding" className="text-sm underline">
            Finish onboarding
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {STAT_LABELS.map((s) => (
          <Card key={s.key} className="text-center">
            <p className="text-2xl font-semibold" data-testid={`stat-${s.key}`}>
              {counts[s.key] ?? 0}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{s.label}</p>
          </Card>
        ))}
      </div>

      {lastJob ? (
        <Card className="text-sm text-neutral-600">
          Last sync ({lastJob.type}): <strong>{lastJob.status}</strong> —{" "}
          {lastJob.stats.listed} messages listed, {lastJob.stats.prefiltered}{" "}
          passed the prefilter, {lastJob.stats.classified} classified,{" "}
          {lastJob.stats.applications} new applications.
          {lastJob.error ? ` Error: ${lastJob.error}` : ""}
        </Card>
      ) : null}

      <div>
        <Link
          href="/applications"
          className="text-sm font-medium underline hover:text-neutral-600"
        >
          View all applications →
        </Link>
      </div>
    </div>
  );
}
