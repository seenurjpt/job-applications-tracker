import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUserId, signOut } from "@/auth";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import { toAccountDTO } from "@/lib/serialize";
import { KeyProblemBanner, ReconnectBanner } from "@/components/banners";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const userId = await currentUserId();
  if (!userId) redirect("/");

  const [accounts, apiKey] = await Promise.all([
    accountsRepo.findByUser(userId),
    apiKeysRepo.findByUser(userId),
  ]);
  const needsReconnect = accounts.find((a) => a.status === "needs_reconnect");
  const keyProblem =
    apiKey &&
    (apiKey.status === "invalid" ||
      apiKey.status === "no_credit" ||
      apiKey.status === "no_access")
      ? apiKey.status
      : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium sm:gap-x-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-base font-semibold"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                aria-hidden="true"
                className="text-indigo-600"
              >
                <path d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7" />
              </svg>
              Job Tracker
            </Link>
            <Link href="/dashboard" className="text-neutral-600 hover:text-indigo-600">
              Dashboard
            </Link>
            <Link
              href="/applications"
              className="text-neutral-600 hover:text-indigo-600"
            >
              Applications
            </Link>
            <Link href="/settings" className="text-neutral-600 hover:text-indigo-600">
              Settings
            </Link>
          </nav>
          <SignOutButton
            email={session.user.email ?? ""}
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {needsReconnect ? (
          <ReconnectBanner account={toAccountDTO(needsReconnect)} />
        ) : null}
        {keyProblem ? <KeyProblemBanner status={keyProblem} /> : null}
        {children}
      </main>
    </div>
  );
}
