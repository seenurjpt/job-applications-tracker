import { NextResponse } from "next/server";
import { currentUserId } from "@/auth";
import * as applicationsRepo from "@/db/repositories/applications";

function csvField(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export of the user's applications (phase 8). */
export async function GET(): Promise<NextResponse> {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { items } = await applicationsRepo.query({ userId, limit: 10_000 });
  const header = [
    "company",
    "role",
    "status",
    "source",
    "contactName",
    "contactEmail",
    "appliedAt",
    "lastActivityAt",
    "followUpCount",
    "confidence",
  ];
  const rows = items.map((a) =>
    [
      csvField(a.company),
      csvField(a.role),
      csvField(a.status),
      csvField(a.source),
      csvField(a.contactName),
      csvField(a.contactEmail),
      csvField(a.appliedAt.toISOString().slice(0, 10)),
      csvField(a.lastActivityAt.toISOString().slice(0, 10)),
      csvField(a.followUpCount),
      csvField(a.confidence.toFixed(2)),
    ].join(",")
  );
  const csv = [header.join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="applications.csv"',
    },
  });
}
