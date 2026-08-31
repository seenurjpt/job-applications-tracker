import Link from "next/link";
import { PublicPage, PublicSection } from "@/components/public-page";

export const dynamic = "force-static";

export const metadata = {
  title: "About , Job Tracker",
  description:
    "What Job Tracker does, how it works, and how it treats your data.",
  authors: [{ name: "Sunny Rajput" }],
};

const STEPS = [
  {
    title: "Connect your Gmail",
    body: "Sign in with Google, then grant read-only access to your mail plus permission to create drafts. The app never sends email on your behalf and never asks for that ability.",
  },
  {
    title: "Sync your sent mail",
    body: "A free prefilter drops most mail instantly; the remaining candidates are classified by Claude using only email metadata (subject, snippet, recipients, date) on your own Anthropic API key.",
  },
  {
    title: "Track everything in one place",
    body: "Every application gets a live status derived from real thread activity: applied, needs follow-up, replied, interviewing, rejected, or ghosted, plus a flag showing what your last email was about.",
  },
  {
    title: "Follow up without the blank page",
    body: "Generate a polite nudge, a value-add note, or a final check-in. Drafts are created inside the original Gmail thread for you to review, edit, and send yourself.",
  },
];

export default function AboutPage() {
  return (
    <PublicPage
      title="About Job Tracker"
      subtitle="Skip the spreadsheet. Every job application you send from Gmail, detected, tracked, and followed up."
    >
      <PublicSection title="What it is">
        <p>
          Job Tracker is a personal job-search assistant that lives on top of
          your own Gmail. Instead of maintaining a spreadsheet by hand, you
          connect your mailbox once and the applications you have actually
          sent show up in a dashboard, complete with statuses, reply activity,
          and follow-up reminders. Only mail <strong>you sent</strong> creates
          entries; no-reply notifications and job-board alerts are filtered
          out.
        </p>
      </PublicSection>

      <PublicSection title="How it works">
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span>
                <strong className="text-neutral-900">{s.title}.</strong>{" "}
                {s.body}
              </span>
            </li>
          ))}
        </ol>
      </PublicSection>

      <PublicSection title="Your data, your key">
        <p>
          Classification and drafting run on <strong>your own Anthropic API
          key</strong>: you are Anthropic&apos;s customer for that processing,
          and retention is governed by your own Anthropic account settings.
          Only email metadata is ever transmitted, never full message bodies,
          and nothing is used for advertising. OAuth tokens and your key are
          encrypted at rest, and disconnecting a mailbox permanently deletes
          its data. The full details are in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </PublicSection>

      <PublicSection title="Author">
        <p>
          Job Tracker is designed, built, and maintained by{" "}
          <strong className="text-neutral-900">Sunny Rajput</strong>.
        </p>
      </PublicSection>

      <PublicSection title="Get started">
        <p>
          You need a Google account and an Anthropic API key (a six-month
          backfill typically costs well under a dollar in API usage).
        </p>
        <p>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-md bg-indigo-600 px-5 !text-white hover:bg-indigo-700 hover:!no-underline"
          >
            Sign in with Google →
          </Link>
        </p>
      </PublicSection>
    </PublicPage>
  );
}
