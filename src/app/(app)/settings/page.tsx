import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import * as usersRepo from "@/db/repositories/users";
import * as accountsRepo from "@/db/repositories/accounts";
import {
  deleteAccount,
  disconnectGmail,
  updateUserSettings,
} from "@/actions/settings";
import { Button, Card, Input } from "@/components/ui";

export default async function SettingsPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/");
  const [user, accounts] = await Promise.all([
    usersRepo.findById(userId),
    accountsRepo.findByUser(userId),
  ]);
  if (!user) redirect("/");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <h2 className="mb-1 font-semibold">Anthropic API key</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Manage your key, model choices, and usage.
        </p>
        <Link href="/settings/api-key" className="text-sm font-medium text-indigo-600 hover:underline">
          API key settings →
        </Link>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Follow-up timing</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await updateUserSettings({
              followUpAfterDays: formData.get("followUpAfterDays"),
              ghostAfterDays: formData.get("ghostAfterDays"),
              timezone: formData.get("timezone"),
            });
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Needs follow-up after
              </span>
              <div className="relative mt-1.5">
                <Input
                  name="followUpAfterDays"
                  type="number"
                  min={1}
                  defaultValue={user.settings.followUpAfterDays}
                  className="pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-400">
                  days
                </span>
              </div>
              <span className="mt-1 block text-xs text-neutral-500">
                No reply for this long marks an application “needs follow-up”.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Ghosted after
              </span>
              <div className="relative mt-1.5">
                <Input
                  name="ghostAfterDays"
                  type="number"
                  min={1}
                  defaultValue={user.settings.ghostAfterDays}
                  className="pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-400">
                  days
                </span>
              </div>
              <span className="mt-1 block text-xs text-neutral-500">
                Still nothing after this long counts as “ghosted”.
              </span>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">
              Mailbox timezone
            </span>
            <Input
              name="timezone"
              defaultValue={user.settings.timezone}
              placeholder="e.g. Asia/Kolkata"
              className="mt-1.5 sm:max-w-72"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Used for Gmail date filters when syncing.
            </span>
          </label>
          <div className="border-t border-neutral-100 pt-3">
            <Button type="submit" size="sm">
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Connected Gmail accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            None connected.{" "}
            <a href="/api/gmail/connect" className="text-indigo-600 hover:underline">
              Connect Gmail
            </a>
          </p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a._id.toHexString()}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {a.email}{" "}
                  <span className="text-neutral-400">({a.status})</span>
                </span>
                <form
                  action={async () => {
                    "use server";
                    await disconnectGmail({ accountId: a._id.toHexString() });
                  }}
                >
                  <Button type="submit" size="sm" variant="destructive">
                    Disconnect &amp; delete data
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-400">
          Disconnecting permanently deletes this mailbox&apos;s stored messages,
          applications, and drafts.
        </p>
      </Card>

      <Card className="border-red-200">
        <h2 className="mb-1 font-semibold text-red-700">Delete account</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Permanently removes everything: connected mailboxes, applications,
          messages, drafts, your API key record, and usage history.
        </p>
        <form
          action={async () => {
            "use server";
            await deleteAccount();
          }}
        >
          <Button type="submit" variant="destructive" size="sm">
            Delete my account and all data
          </Button>
        </form>
      </Card>
    </div>
  );
}
