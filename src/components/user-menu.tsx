"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function SignOutItem() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-70"
    >
      {pending ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          Signing out…
        </>
      ) : (
        <>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </>
      )}
    </button>
  );
}

/** Avatar button (Google profile photo when available) with a dropdown menu. */
export function UserMenu({
  name,
  email,
  image,
  signOutAction,
}: {
  name: string | null;
  email: string;
  image: string | null;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const initial = (name ?? email).charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full ring-indigo-500 ring-offset-2 transition-shadow hover:ring-2"
        data-testid="user-menu"
      >
        {image ? (
          <img
            src={image}
            alt={name ?? email}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
            <div className="flex items-center gap-3 border-b border-neutral-100 px-3 pb-2 pt-1">
              {image ? (
                      <img
                  src={image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                  {initial}
                </span>
              )}
              <div className="min-w-0">
                {name ? (
                  <p className="truncate text-sm font-medium">{name}</p>
                ) : null}
                <p className="truncate text-xs text-neutral-500">{email}</p>
              </div>
            </div>
            <form action={signOutAction} className="pt-1">
              <SignOutItem />
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
