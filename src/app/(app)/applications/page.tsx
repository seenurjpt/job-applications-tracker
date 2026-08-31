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

  const PAGE_SIZE = 10;
  const pageRaw = Number(str(params.page) ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const { items, total } = await applicationsRepo.query({
    userId,
    status: status.success ? status.data : undefined,
    appliedFrom,
    appliedTo,
    search: str(params.q),
    sortBy,
    sortDir: str(params.sortDir) === "asc" ? "asc" : "desc",
    limit: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const tabs = [
    { label: "Needs follow-up", href: "/applications?status=needs_follow_up", active: statusRaw === "needs_follow_up" },
    { label: "All", href: "/applications", active: !statusRaw },
    { label: "Interviewing", href: "/applications?status=interviewing", active: statusRaw === "interviewing" },
    { label: "Ghosted", href: "/applications?status=ghosted", active: statusRaw === "ghosted" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {total} total
          </span>
          <a
            href="/api/export/applications"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-neutral-200 text-sm">
        {tabs.map((t) => (
          <a
            key={t.label}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium transition-colors ${
              t.active
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
      <ApplicationsTable
        applications={items.map(toApplicationDTO)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
