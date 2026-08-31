import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { env } from "@/lib/env";
import { Button, Card } from "@/components/ui";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm space-y-6 p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Job Tracker</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Connect your Gmail, track every application, never miss a
            follow-up.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/onboarding" });
          }}
        >
          <Button type="submit" className="w-full">
            Sign in with Google
          </Button>
        </form>
        {env.E2E_TEST_MODE ? (
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("e2e", {
                email: String(formData.get("email") ?? ""),
                redirectTo: "/onboarding",
              });
            }}
            className="space-y-2"
          >
            <input
              name="email"
              placeholder="e2e email"
              data-testid="e2e-email"
              className="h-9 w-full rounded-md border border-neutral-300 px-3 text-sm"
            />
            <Button type="submit" variant="outline" className="w-full" data-testid="e2e-signin">
              E2E sign in
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
