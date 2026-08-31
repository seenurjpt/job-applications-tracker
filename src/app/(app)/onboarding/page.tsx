import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import { Card } from "@/components/ui";

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4" data-testid={`onboarding-step-${n}`}>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          done ? "bg-green-600 text-white" : "bg-neutral-200 text-neutral-600"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-neutral-600">{children}</div>
      </div>
    </li>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const params = await searchParams;

  const [accounts, apiKey] = await Promise.all([
    accountsRepo.findByUser(userId),
    apiKeysRepo.findByUser(userId),
  ]);
  const gmailConnected = accounts.some((a) => a.status === "active");
  const keyValid = apiKey?.status === "valid";

  if (gmailConnected && keyValid && !params.stay) redirect("/dashboard");

  const gmailError = typeof params.gmail_error === "string" ? params.gmail_error : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Get set up</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Three steps, none skippable. Sync stays disabled until all three are
          done.
        </p>
      </div>

      {gmailError ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {gmailError === "partial_scopes"
            ? "Gmail connection is incomplete , please grant BOTH the read and compose permissions. The app cannot work with only one of them."
            : `Gmail connection failed (${gmailError}). Please try again.`}
        </div>
      ) : null}

      <Card>
        <ol className="space-y-6">
          <Step n={1} done title="Sign in with Google">
            Done , you&apos;re signed in.
          </Step>
          <Step n={2} done={gmailConnected} title="Connect your Gmail">
            <p>
              Read-only access to your mail plus permission to create drafts.
              The app never sends email on your behalf.
            </p>
            {!gmailConnected ? (
              <a
                href="/api/gmail/connect"
                data-testid="connect-gmail"
                className="mt-2 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Connect Gmail
              </a>
            ) : null}
          </Step>
          <Step n={3} done={keyValid} title="Add your Anthropic API key">
            <p>
              Classification runs on your own Anthropic account. A six-month
              backfill is only a few hundred small requests on short metadata ,
              typically well under a dollar.
            </p>
            {!keyValid ? (
              <Link
                href="/settings/api-key"
                data-testid="add-api-key"
                className="mt-2 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Add API key
              </Link>
            ) : null}
          </Step>
        </ol>
      </Card>

      <div className="text-center">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 underline hover:text-neutral-900"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
