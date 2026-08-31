"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDraftInGmailAction,
  generateFollowUpDraft,
} from "@/actions/drafts";
import { Button, Select } from "@/components/ui";
import type { DraftToneValue } from "@/db/schemas";

const TONES: Array<{ value: DraftToneValue; label: string }> = [
  { value: "polite_nudge", label: "Polite nudge" },
  { value: "value_add", label: "Value add" },
  { value: "final_check_in", label: "Final check-in" },
];

/** Phase 5: single draft , generate, preview and edit, then create in Gmail. */
export function DraftComposer({ applicationId }: { applicationId: string }) {
  const [tone, setTone] = useState<DraftToneValue>("polite_nudge");
  const [draft, setDraft] = useState<{
    draftId: string;
    subject: string;
    body: string;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const generate = () =>
    startTransition(async () => {
      setResult(null);
      const res = await generateFollowUpDraft({ applicationId, tone });
      if (res.ok) {
        setDraft({ draftId: res.draftId, subject: res.subject, body: res.body });
      } else {
        setResult(`Generation failed: ${res.error}`);
      }
    });

  const create = () =>
    startTransition(async () => {
      if (!draft) return;
      const res = await createDraftInGmailAction(draft);
      setResult(
        res.ok
          ? "Draft created in Gmail , it will appear inside the original thread."
          : `Creation failed: ${res.error}`
      );
      if (res.ok) setDraft(null);
      router.refresh();
    });

  return (
    <div className="space-y-3" data-testid="draft-composer">
      <div className="flex items-center gap-2">
        <Select
          value={tone}
          onChange={(e) => setTone(e.target.value as DraftToneValue)}
          data-testid="draft-tone"
        >
          {TONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Button onClick={generate} disabled={pending} data-testid="generate-draft">
          {pending && !draft ? "Generating…" : "Generate follow-up"}
        </Button>
      </div>

      {draft ? (
        <div className="space-y-2 rounded-md border border-neutral-200 p-3">
          <input
            data-testid="draft-subject"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <textarea
            data-testid="draft-body"
            className="h-40 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div className="flex gap-2">
            <Button onClick={create} disabled={pending} data-testid="create-draft">
              {pending ? "Creating…" : "Create draft in Gmail"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <p className="text-sm text-neutral-600" data-testid="draft-result">
          {result}
        </p>
      ) : null}
    </div>
  );
}
