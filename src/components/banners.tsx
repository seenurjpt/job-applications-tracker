import Link from "next/link";
import type { AccountDTO } from "@/lib/serialize";
import type { KeyStatusValue } from "@/db/schemas";

export function ReconnectBanner({ account }: { account: AccountDTO }) {
  return (
    <div
      data-testid="reconnect-banner"
      className="flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <span>
        Gmail access for <strong>{account.email}</strong> has expired. Sync is
        paused until you reconnect.
      </span>
      <a
        href="/api/gmail/connect"
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-500"
      >
        Reconnect
      </a>
    </div>
  );
}

const KEY_BANNER_COPY: Partial<Record<KeyStatusValue, { title: string; hint: string }>> = {
  invalid: {
    title: "Your Anthropic API key was rejected.",
    hint: "It may have been revoked or mistyped. Re-enter it to resume.",
  },
  no_credit: {
    title: "Your Anthropic account can't be billed.",
    hint: "Add credit to your Anthropic account, then resume the sync — it continues from where it stopped.",
  },
  no_access: {
    title: "Your key has no access to the selected model.",
    hint: "Pick another model in settings, or request access from Anthropic.",
  },
};

export function KeyProblemBanner({ status }: { status: KeyStatusValue }) {
  const copy = KEY_BANNER_COPY[status];
  if (!copy) return null;
  return (
    <div
      data-testid="key-problem-banner"
      className="flex items-center justify-between gap-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <span>
        <strong>{copy.title}</strong> {copy.hint}
      </span>
      <Link
        href="/settings/api-key"
        className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
      >
        Fix key
      </Link>
    </div>
  );
}
