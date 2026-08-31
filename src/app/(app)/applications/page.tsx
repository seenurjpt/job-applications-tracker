import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import * as applicationsRepo from "@/db/repositories/applications";
import { resolveRange, type RangePreset, RANGE_PRESETS } from "@/domain/date-range";
import { ApplicationStatus } from "@/db/schemas";
import { toApplicationDTO } from "@/lib/serialize";
import { ApplicationsTable } from "@/components/applications-table";

type Search = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/");
  const params = await searchParams;

  const presetRaw = str(params.range);
  const preset: RangePreset | undefined =
    presetRaw && (RANGE_PRESETS as string[]).includes(presetRaw)
      ? (presetRaw as RangePreset)
      : undefined;

  let appliedFrom: Date | undefined;
  let appliedTo: Date | undefined;
  if (preset && preset !== "custom") {
    const r = resolveRange(preset, new Date());
    appliedFrom = r.from;
    appliedTo = r.to;
  } else if (preset === "custom" && str(params.from) && str(params.to)) {
    appliedFrom = new Date(str(params.from)!);
    appliedTo = new Date(str(params.to)!);
  }

  const statusRaw = str(params.status);
  const status = ApplicationStatus.safeParse(statusRaw);

  const sortBy = (
    ["appliedAt", "lastActivityAt", "company", "status"] as const
  ).find((s) => s === str(params.sortBy));

  const { items, total } = await applicationsRepo.query({
    userId,
    status: status.success ? status.data : undefined,
    appliedFrom,
    appliedTo,
    search: str(params.q),
    sortBy,
    sortDir: str(params.sortDir) === "asc" ? "asc" : "desc",
    limit: 200,
  });

  const tabs = [
    { label: "Needs follow-up", href: "/applications?status=needs_follow_up", active: statusRaw === "needs_follow_up" },
    { label: "All", href: "/applications", active: !statusRaw },
    { label: "Interviewing", href: "/applications?status=interviewing", active: statusRaw === "interviewing" },
    { label: "Ghosted", href: "/applications?status=ghosted", active: statusRaw === "ghosted" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex items-center gap-4 text-sm text-neutral-500">
          <span>{total} total</span>
          <a href="/api/export/applications" className="text-indigo-600 hover:text-indigo-800 hover:underline">
            Export CSV
          </a>
        </div>
      </div>
      <nav className="flex gap-1 border-b border-neutral-200 text-sm">
        {tabs.map((t) => (
          <a
            key={t.label}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              t.active
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
      <ApplicationsTable applications={items.map(toApplicationDTO)} />
    </div>
  );
}
