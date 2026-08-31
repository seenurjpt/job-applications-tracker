// Publicly hosted privacy policy , required by Google's Limited Use policy
// for the Gmail-to-Anthropic transfer to be permissible (§10).

import { PublicPage, PublicSection } from "@/components/public-page";

export const metadata = { title: "Privacy Policy , Job Tracker" };

export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy Policy"
      subtitle="What Job Tracker accesses, what leaves the app, and how your data is stored and deleted."
    >
      <PublicSection title="What we access">
        <p>
          With your explicit consent, Job Tracker reads your Gmail sent mail
          (read-only) and creates drafts (compose). We never send email on your
          behalf and never request the ability to.
        </p>
      </PublicSection>

      <PublicSection title="What we send to Anthropic">
        <p>
          To classify which sent emails are job applications, we transmit email
          <strong> metadata</strong> , subject line, the short snippet Gmail
          provides, recipient addresses, and the date , to Anthropic&apos;s
          API. We never transmit full message bodies.
        </p>
        <p>
          This processing uses <strong>your own Anthropic API key</strong>: you
          are Anthropic&apos;s customer for it, the data is processed under
          your own agreement with Anthropic, and data retention is governed by
          your own Anthropic account settings (configurable in the Anthropic
          Console). We cannot see the contents of your key, and we cannot make
          retention promises on Anthropic&apos;s behalf.
        </p>
      </PublicSection>

      <PublicSection title="How data is stored">
        <p>
          OAuth tokens and your API key are encrypted at rest with AES-256-GCM;
          the encryption key lives in an environment secret and decrypted
          values exist only in server memory for the duration of a request.
          Tokens, keys, and email bodies are never written to logs.
        </p>
      </PublicSection>

      <PublicSection title="Google API Limited Use disclosure">
        <p>
          Job Tracker&apos;s use and transfer of information received from
          Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Gmail data is used only to
          provide the features described above, is never used for advertising,
          and is never sold or transferred except as necessary to provide those
          features (the metadata-only classification described above), with
          your consent, or as required by law.
        </p>
      </PublicSection>

      <PublicSection title="Deletion">
        <p>
          Disconnecting a mailbox permanently deletes its stored messages,
          applications, and drafts. Deleting your account additionally removes
          your API key record and usage history.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
