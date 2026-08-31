import { Badge } from "@/components/ui";
import type { ApplicationStatusValue } from "@/db/schemas";

const STYLES: Record<ApplicationStatusValue, { label: string; className: string }> = {
  applied: { label: "Applied", className: "bg-neutral-200 text-neutral-700" },
  needs_follow_up: {
    label: "Needs follow-up",
    className: "bg-amber-100 text-amber-800",
  },
  replied: { label: "Replied", className: "bg-blue-100 text-blue-800" },
  interviewing: {
    label: "Interviewing",
    className: "bg-green-100 text-green-800",
  },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  ghosted: { label: "Ghosted", className: "bg-neutral-300 text-neutral-600" },
  not_an_application: {
    label: "Not an application",
    className: "bg-neutral-100 text-neutral-400",
  },
};

export function StatusBadge({ status }: { status: ApplicationStatusValue }) {
  const s = STYLES[status];
  return <Badge className={s.className}>{s.label}</Badge>;
}
