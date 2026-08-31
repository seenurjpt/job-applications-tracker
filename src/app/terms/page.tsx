// Publicly hosted terms of service , linked from the Google OAuth consent screen.

import Link from "next/link";
import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata = { title: "Terms of Service , Job Tracker" };

export default function TermsPage() {
  return (
    <PublicPage
      title="Terms of Service"
      subtitle="Last updated: August 31, 2026"
    >
      <PublicSection title="The service">
        <p>
          Job Tracker helps you track job applications by reading your Gmail
          sent mail (with your consent) and organizing detected applications
          into a dashboard. It can also prepare follow-up email drafts in your
          Gmail account; it never sends email on your behalf.
        </p>
      </PublicSection>

      <PublicSection title="Your account and API key">
        <p>
          You sign in with your Google account and connect your own Anthropic
          API key for email classification. You are responsible for the
          security of your accounts and for any usage charges incurred on your
          own Anthropic account. You may disconnect your mailbox or delete
          your account at any time, which removes your stored data as
          described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </PublicSection>

      <PublicSection title="Acceptable use">
        <p>
          You agree to use the service only for managing your own job
          applications, and not to attempt to access other users&apos; data,
          disrupt the service, or use it for unlawful purposes.
        </p>
      </PublicSection>

      <PublicSection title="Disclaimer">
        <p>
          The service is provided &quot;as is&quot;, without warranties of any
          kind. Email classification is automated and may be inaccurate; you
          are responsible for verifying any information before relying on it.
          To the maximum extent permitted by law, we are not liable for any
          indirect or consequential damages arising from use of the service.
        </p>
      </PublicSection>

      <PublicSection title="Changes and termination">
        <p>
          We may update these terms or discontinue the service at any time.
          Material changes will be reflected on this page. Continued use after
          a change constitutes acceptance of the updated terms.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
