"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/applications", label: "Applications" },
  { href: "/settings", label: "Settings" },
];

/** Nav links with active-route highlighting. */
export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      data-tour="nav"
      className={cn("flex items-center gap-1 text-sm font-medium", className)}
    >
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
