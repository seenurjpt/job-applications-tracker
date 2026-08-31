"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editApplication } from "@/actions/applications";

/** Inline edit writing userEditedFields — core feature, not polish (§11). */
export function InlineEditCell({
  id,
  field,
  value,
  edited,
}: {
  id: string;
  field: "company" | "role" | "contactName";
  value: string | null;
  edited: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();
  const router = useRouter();

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "") || next.length === 0) return;
    startTransition(async () => {
      await editApplication({ id, [field]: next });
      router.refresh();
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        data-testid={`edit-${field}-${id}`}
        className="w-full rounded border border-neutral-300 px-1 py-0.5 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      data-testid={`cell-${field}-${id}`}
      className="group flex w-full items-center gap-1 text-left hover:text-neutral-600"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      title={edited ? "Edited by you — syncs will not overwrite this" : "Click to edit"}
    >
      <span className={value ? "" : "italic text-neutral-400"}>
        {value ?? "unknown"}
      </span>
      {edited ? <span className="text-xs text-blue-600">✎</span> : null}
    </button>
  );
}
