// Shared shell for public pages (/about, /privacy, /terms): indigo-branded
// header with a hero band, prose card, and footer. Must stay viewable
// without login (Google OAuth branding verification depends on it).

import Link from "next/link";

function AsteriskLogo({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7" />
    </svg>
  );
}

export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="border-l-4 border-indigo-500 pl-3 text-lg font-semibold text-neutral-900">
        {title}
      </h2>
      <div className="space-y-2 pl-4 text-sm leading-6 text-neutral-700 [&_a]:font-medium [&_a]:text-indigo-600 [&_a:hover]:underline">
        {children}
      </div>
    </section>
  );
}

export function PublicPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-base font-semibold">
            <AsteriskLogo className="text-indigo-600" />
            Job Tracker
          </Link>
          <Link
            href="/"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-700 py-10 text-white">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-xl text-sm text-indigo-100">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="space-y-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-neutral-400">
          <span>© 2026 Job Tracker</span>
          <span className="flex gap-4">
            <Link href="/about" className="hover:text-indigo-600 hover:underline">
              About
            </Link>
            <Link href="/privacy" className="hover:text-indigo-600 hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-indigo-600 hover:underline">
              Terms of Service
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
