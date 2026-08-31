// Public landing page , Google's OAuth branding verification requires the
// home page to be viewable without login, to explain the app's purpose, and
// to link the privacy policy; keep all three when restyling.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { env } from "@/lib/env";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function AsteriskLogo() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7" />
    </svg>
  );
}

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex h-dvh overflow-hidden">
      {/* Left hero panel (desktop only) */}
      <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-700 p-10 text-white lg:flex">
        {/* decorative arcs */}
        <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 h-[30rem] w-[30rem] rounded-full border border-white/10" />

        <AsteriskLogo />

        <div className="space-y-5">
          <h1 className="text-5xl font-bold leading-tight">
            Hello,
            <br />
            Job Tracker! <span className="inline-block">👋</span>
          </h1>
          <p className="max-w-md text-lg text-indigo-100">
            Skip the spreadsheet. Every job application you send from Gmail is
            detected, tracked, and followed up , automatically.
          </p>
        </div>

        <p className="text-sm text-indigo-200">
          © 2026 Job Tracker. All rights reserved.
        </p>
      </section>

      {/* Right sign-in panel */}
      <section className="flex h-full w-full flex-col justify-between px-6 py-6 sm:px-12 lg:w-1/2">
        <p className="text-xl font-bold tracking-tight">Job Tracker</p>

        <div className="mx-auto w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-3xl font-bold">Welcome Back!</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Sign in with your Google account , it takes less than a minute.
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/onboarding" });
            }}
          >
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white text-sm font-medium shadow-sm transition-colors hover:bg-neutral-50"
            >
              <GoogleIcon />
              Login with Google
            </button>
          </form>

          {env.E2E_TEST_MODE ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await signIn("e2e", {
                  email: String(formData.get("email") ?? ""),
                  redirectTo: "/onboarding",
                });
              }}
              className="space-y-2"
            >
              <input
                name="email"
                placeholder="e2e email"
                data-testid="e2e-email"
                className="h-9 w-full rounded-md border border-neutral-300 px-3 text-sm"
              />
              <button
                type="submit"
                data-testid="e2e-signin"
                className="h-9 w-full rounded-md border border-neutral-300 text-sm hover:bg-neutral-50"
              >
                E2E sign in
              </button>
            </form>
          ) : null}

          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex gap-2">
              <span className="text-indigo-600">✓</span> Detects job
              applications in your Gmail sent mail
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-600">✓</span> Tracks replies,
              interviews, and follow-ups in one dashboard
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-600">✓</span> Drafts follow-up
              emails , never sends without you
            </li>
          </ul>

          <p className="text-xs leading-5 text-neutral-400">
            With your consent, we read your Gmail sent mail (read-only) and
            create drafts. Only email metadata is ever processed , never full
            message bodies, and nothing is used for advertising.
          </p>
        </div>

        <footer className="flex items-center justify-between text-xs text-neutral-400">
          <span className="lg:hidden">© 2026 Job Tracker</span>
          <span className="hidden lg:inline" />
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-neutral-700 hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-neutral-700 hover:underline">
              Terms of Service
            </Link>
          </span>
        </footer>
      </section>
    </main>
  );
}
