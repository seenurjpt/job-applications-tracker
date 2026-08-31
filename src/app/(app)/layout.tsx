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
  if (!session?.user) redirect("/signin");
  const userId = await currentUserId();
  if (!userId) redirect("/signin");

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
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="text-base font-semibold">
              Job Tracker
            </Link>
            <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
              Dashboard
            </Link>
            <Link
              href="/applications"
              className="text-neutral-600 hover:text-neutral-900"
            >
              Applications
            </Link>
            <Link href="/settings" className="text-neutral-600 hover:text-neutral-900">
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
