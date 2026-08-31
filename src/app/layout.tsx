import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Tracker",
  description:
    "Tracks job applications from your sent mail and drafts follow-ups.",
  // Google Search Console ownership verification (required for OAuth branding
  // review). Set GOOGLE_SITE_VERIFICATION to the token from the "HTML tag"
  // verification method; omitted from the page when unset.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
