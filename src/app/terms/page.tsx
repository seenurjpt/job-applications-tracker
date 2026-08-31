// Publicly hosted terms of service — linked from the Google OAuth consent screen.

export const metadata = { title: "Terms of Service — Job Tracker" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-sm leading-6 text-neutral-800">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="text-neutral-500">Last updated: August 31, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">The service</h2>
        <p>
          Job Tracker helps you track job applications by reading your Gmail
          sent mail (with your consent) and organizing detected applications
          into a dashboard. It can also prepare follow-up email drafts in your
          Gmail account; it never sends email on your behalf.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your account and API key</h2>
        <p>
          You sign in with your Google account and connect your own Anthropic
          API key for email classification. You are responsible for the
          security of your accounts and for any usage charges incurred on your
          own Anthropic account. You may disconnect your mailbox or delete
          your account at any time, which removes your stored data as
          described in the <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Acceptable use</h2>
        <p>
          You agree to use the service only for managing your own job
          applications, and not to attempt to access other users&apos; data,
          disrupt the service, or use it for unlawful purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Disclaimer</h2>
        <p>
          The service is provided &quot;as is&quot;, without warranties of any
          kind. Email classification is automated and may be inaccurate; you
          are responsible for verifying any information before relying on it.
          To the maximum extent permitted by law, we are not liable for any
          indirect or consequential damages arising from use of the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Changes and termination</h2>
        <p>
          We may update these terms or discontinue the service at any time.
          Material changes will be reflected on this page. Continued use after
          a change constitutes acceptance of the updated terms.
        </p>
      </section>
    </main>
  );
}
