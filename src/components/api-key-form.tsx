"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteApiKey,
  saveApiKey,
  updateApiKeyConfig,
} from "@/actions/api-keys";
import { Button, Input, Select } from "@/components/ui";
import type { KeyStatusValue } from "@/db/schemas";

const STATUS_COPY: Record<KeyStatusValue, { label: string; className: string }> = {
  valid: { label: "Valid", className: "text-green-700" },
  unverified: { label: "Unverified", className: "text-neutral-500" },
  invalid: {
    label: "Invalid — the key was rejected. Check for typos or generate a new key.",
    className: "text-red-700",
  },
  no_credit: {
    label: "No credit — the key works but your Anthropic account cannot be billed.",
    className: "text-red-700",
  },
  no_access: {
    label: "No access — this key cannot use the selected model. Pick another model.",
    className: "text-red-700",
  },
};

export function ApiKeyForm({
  masked,
  status,
  extractionModel,
  draftModel,
  maxConcurrency,
  modelOptions,
}: {
  masked: string | null;
  status: KeyStatusValue | null;
  extractionModel: string;
  draftModel: string;
  maxConcurrency: number;
  modelOptions: string[];
}) {
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await saveApiKey({ key });
      if (!res.ok) {
        setMessage("Could not save the key.");
        return;
      }
      setKey("");
      setMessage(
        res.unchanged
          ? "That's the same key you already have — nothing changed."
          : res.status === "valid"
            ? "Key verified and saved."
            : `Key saved, but verification returned: ${res.status}`
      );
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {masked ? (
          <p className="text-sm">
            Current key: <code data-testid="masked-key">{masked}</code>{" "}
            {status ? (
              <span
                data-testid="key-status"
                className={`ml-2 text-xs font-medium ${STATUS_COPY[status].className}`}
              >
                {STATUS_COPY[status].label}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-neutral-500">No key saved yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            type="password"
            data-testid="api-key-input"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <Button
            onClick={save}
            disabled={pending || key.trim().length === 0}
            data-testid="save-api-key"
          >
            {pending ? "Verifying…" : "Save & verify"}
          </Button>
        </div>
        {message ? (
          <p className="text-sm text-neutral-600" data-testid="key-message">
            {message}
          </p>
        ) : null}
        <p className="text-xs text-neutral-400">
          Verified with a one-token call billed to your account. Stored
          encrypted (AES-256-GCM); it is never shown again and never sent to
          your browser. Data you sync is processed under{" "}
          <em>your own</em> Anthropic account and its retention settings.
        </p>
      </div>

      {masked ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Extraction model
              <Select
                className="mt-1 w-full"
                data-testid="extraction-model"
                defaultValue={extractionModel}
                onChange={(e) =>
                  startTransition(async () => {
                    await updateApiKeyConfig({ extractionModel: e.target.value });
                    router.refresh();
                  })
                }
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              Draft model
              <Select
                className="mt-1 w-full"
                data-testid="draft-model"
                defaultValue={draftModel}
                onChange={(e) =>
                  startTransition(async () => {
                    await updateApiKeyConfig({ draftModel: e.target.value });
                    router.refresh();
                  })
                }
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              Max concurrency
              <Select
                className="mt-1 w-full"
                defaultValue={String(maxConcurrency)}
                onChange={(e) =>
                  startTransition(async () => {
                    await updateApiKeyConfig({
                      maxConcurrency: Number(e.target.value),
                    });
                    router.refresh();
                  })
                }
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div>
            <Button
              variant="destructive"
              size="sm"
              data-testid="delete-api-key"
              onClick={() =>
                startTransition(async () => {
                  await deleteApiKey();
                  setMessage("Key deleted. Your extracted applications are untouched.");
                  router.refresh();
                })
              }
            >
              Delete key
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
