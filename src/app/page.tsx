// Public landing page — Google's OAuth branding verification requires the
// home page to be viewable without login and to explain the app's purpose.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <div className="flex-1 space-y-10">
        <header className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">Job Tracker</h1>
          <p className="text-lg text-neutral-600">
            Automatically track every job application you send from Gmail —
            and never miss a follow-up.
          </p>
          <Link
            href="/signin"
            className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Sign in with Google
          </Link>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What it does</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="space-y-1">
              <h3 className="font-medium">Detects applications</h3>
              <p className="text-sm text-neutral-600">
                Scans the sent mail of your connected Gmail account and
                identifies the emails that are job applications.
              </p>
            </Card>
            <Card className="space-y-1">
              <h3 className="font-medium">Tracks progress</h3>
              <p className="text-sm text-neutral-600">
                Organizes every application into a dashboard so you can see
                status, dates, and outcomes at a glance.
              </p>
            </Card>
            <Card className="space-y-1">
              <h3 className="font-medium">Drafts follow-ups</h3>
              <p className="text-sm text-neutral-600">
                Prepares follow-up drafts in your Gmail account. It never
                sends email on your behalf.
              </p>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How it uses your Google data</h2>
          <p className="text-sm leading-6 text-neutral-600">
            With your explicit consent, Job Tracker reads your Gmail sent mail
            (read-only) and creates drafts. To classify which sent emails are
            job applications, only email metadata — subject, snippet,
            recipients, and date — is processed, using your own Anthropic API
            key. Full message bodies are never transmitted, and nothing is
            used for advertising. See the{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>
      </div>

      <footer className="mt-16 flex gap-6 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        <Link href="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
