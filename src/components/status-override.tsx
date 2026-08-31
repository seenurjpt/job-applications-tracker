"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApplicationStatus } from "@/actions/applications";
import { Select } from "@/components/ui";
import type { ApplicationStatusValue } from "@/db/schemas";

const OPTIONS: Array<{ value: ApplicationStatusValue; label: string }> = [
  { value: "applied", label: "Applied" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "replied", label: "Replied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "ghosted", label: "Ghosted" },
  { value: "not_an_application", label: "Not an application" },
];

export function StatusOverride({
  id,
  status,
}: {
  id: string;
  status: ApplicationStatusValue;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Select
      data-testid="status-override"
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setApplicationStatus({ id, status: e.target.value });
          router.refresh();
        })
      }
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
