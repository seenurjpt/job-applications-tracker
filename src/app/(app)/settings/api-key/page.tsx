import { redirect } from "next/navigation";
import { startOfMonth } from "date-fns";
import { currentUserId } from "@/auth";
import { env } from "@/lib/env";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import * as usageRepo from "@/db/repositories/usage";
import { toView } from "@/services/anthropic/keys";
import { Card } from "@/components/ui";
import { ApiKeyForm } from "@/components/api-key-form";

const MODEL_OPTIONS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
  "claude-opus-5",
];

export default async function ApiKeyPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/");

  const [rec, usage] = await Promise.all([
    apiKeysRepo.findByUser(userId),
    usageRepo.summarySince(userId, startOfMonth(new Date())),
  ]);
  const view = rec ? toView(rec) : null;

  const models = [
    ...new Set([
      ...MODEL_OPTIONS,
      env.ANTHROPIC_EXTRACTION_MODEL,
      env.ANTHROPIC_DRAFT_MODEL,
    ]),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Anthropic API key</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Extraction and drafting run on your own Anthropic account , you are
          Anthropic&apos;s customer for that processing; this app never sees
          your bill and never stores your key in readable form.
        </p>
      </div>

      <Card>
        <ApiKeyForm
          masked={view?.masked ?? null}
          status={view?.status ?? null}
          extractionModel={view?.extractionModel ?? env.ANTHROPIC_EXTRACTION_MODEL}
          draftModel={view?.draftModel ?? env.ANTHROPIC_DRAFT_MODEL}
          maxConcurrency={view?.maxConcurrency ?? 2}
          modelOptions={models}
        />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Usage this month</h2>
        {usage.length === 0 ? (
          <p className="text-sm text-neutral-500">No API calls yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Kind</th>
                <th className="py-1 font-medium">Calls</th>
                <th className="py-1 font-medium">Input tokens</th>
                <th className="py-1 font-medium">Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={row.kind} className="border-t border-neutral-100">
                  <td className="py-1">{row.kind}</td>
                  <td className="py-1 tabular-nums">{row.calls}</td>
                  <td className="py-1 tabular-nums">{row.inputTokens}</td>
                  <td className="py-1 tabular-nums">{row.outputTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
