import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUserId, signOut } from "@/auth";
import { markTourSeen } from "@/actions/settings";
import * as accountsRepo from "@/db/repositories/accounts";
import * as apiKeysRepo from "@/db/repositories/api-keys";
import * as usersRepo from "@/db/repositories/users";
import { toAccountDTO } from "@/lib/serialize";
import { KeyProblemBanner, ReconnectBanner } from "@/components/banners";
import { AppNav } from "@/components/app-nav";
import { AppTour, TourButton } from "@/components/app-tour";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const userId = await currentUserId();
  if (!userId) redirect("/");

  const [accounts, apiKey, user] = await Promise.all([
    accountsRepo.findByUser(userId),
    apiKeysRepo.findByUser(userId),
    usersRepo.findById(userId),
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
    <div className="flex h-dvh flex-col">
      <header className="relative z-40 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-1.5 text-base font-semibold"
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
            <AppNav className="hidden sm:flex" />
          </div>
          <div className="flex items-center gap-2">
            <TourButton />
            <UserMenu
              name={session.user.name ?? null}
              email={session.user.email ?? ""}
              image={session.user.image ?? null}
              signOutAction={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            />
          </div>
        </div>
        {/* Mobile nav row */}
        <div className="no-scrollbar mx-auto max-w-6xl overflow-x-auto border-t border-neutral-100 px-4 py-1.5 sm:hidden">
          <AppNav />
        </div>
      </header>
      {/* The content area, not the viewport, is the scroll container , the
          scrollbar starts below the header, and its gutter is reserved on
          both edges so content stays centered. */}
      <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
          {needsReconnect ? (
            <ReconnectBanner account={toAccountDTO(needsReconnect)} />
          ) : null}
          {keyProblem ? <KeyProblemBanner status={keyProblem} /> : null}
          {children}
        </div>
      </main>
      <AppTour autoStart={!user?.tourSeenAt} markSeenAction={markTourSeen} />
    </div>
  );
}
