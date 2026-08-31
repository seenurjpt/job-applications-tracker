"use client";

import { useFormStatus } from "react-dom";

function ButtonInner({ email }: { email: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-70"
    >
      {pending ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          Signing out…
        </>
      ) : (
        `Sign out (${email})`
      )}
    </button>
  );
}

export function SignOutButton({
  action,
  email,
}: {
  action: (formData: FormData) => void | Promise<void>;
  email: string;
}) {
  return (
    <form action={action}>
      <ButtonInner email={email} />
    </form>
  );
}
