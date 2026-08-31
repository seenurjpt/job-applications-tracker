import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { currentUserId } from "@/auth";
import * as applicationsRepo from "@/db/repositories/applications";
import * as messagesRepo from "@/db/repositories/messages";
import * as draftsRepo from "@/db/repositories/drafts";
import { toApplicationDTO, toDraftDTO, toMessageDTO } from "@/lib/serialize";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { StatusOverride } from "@/components/status-override";
import { InlineEditCell } from "@/components/inline-edit-cell";
import { DraftComposer } from "@/components/draft-composer";
import { ThreadTimeline } from "@/components/thread-timeline";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/");
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const app = await applicationsRepo.findById(new ObjectId(id));
  if (!app || !app.userId.equals(userId)) notFound();

  const [thread, drafts] = await Promise.all([
    messagesRepo.findByApplication(app._id),
    draftsRepo.findByApplication(app._id),
  ]);
  const dto = toApplicationDTO(app);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="detail-company">
            {dto.company ?? "Unknown company"}
          </h1>
          <p className="text-neutral-500">{dto.role ?? "Unknown role"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={dto.status} />
          <StatusOverride id={dto.id} status={dto.status} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Details</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Company</dt>
              <dd>
                <InlineEditCell
                  id={dto.id}
                  field="company"
                  value={dto.company}
                  edited={dto.userEditedFields.includes("company")}
                />
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Role</dt>
              <dd>
                <InlineEditCell
                  id={dto.id}
                  field="role"
                  value={dto.role}
                  edited={dto.userEditedFields.includes("role")}
                />
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Contact</dt>
              <dd>
                {dto.contactName ?? "-"}{" "}
                {dto.contactEmail ? `<${dto.contactEmail}>` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Applied</dt>
              <dd>{new Date(dto.appliedAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Follow-ups sent</dt>
              <dd>{dto.followUpCount}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Source / confidence</dt>
              <dd>
                {dto.source} · {(dto.confidence * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">
            Thread timeline
          </h2>
          <ThreadTimeline
            applicationId={dto.id}
            threadId={dto.threadId}
            messages={thread.map(toMessageDTO)}
          />
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          Follow-up draft
        </h2>
        <DraftComposer applicationId={dto.id} />
        {drafts.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
            {drafts.map((d) => {
              const dd = toDraftDTO(d);
              return (
                <p key={dd.id} className="text-xs text-neutral-500">
                  {dd.status === "created"
                    ? "✓ In Gmail"
                    : dd.status === "failed"
                      ? `✗ Failed (${dd.error})`
                      : "Generated"}{" "}
                  , {dd.subject} ({dd.tone})
                </p>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
