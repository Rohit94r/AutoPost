import Link from "next/link";
import { JobsList, type JobRow } from "@/components/jobs/jobs-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";
import { listJobs, listJobsQuery } from "@/server/publishing/service";

export const metadata = { title: "Queue" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const ctx = await requirePageContext();
  const r = await listJobs(ctx.workspace.id, listJobsQuery.parse({ status: "queued,scheduled,processing,needs_reconnection", order: "asc", pageSize: 200 }));
  return (
    <>
      <PageHeader eyebrow="Publishing" title="Scheduled queue" description={`Everything waiting to go out, in ${ctx.workspace.timezone}.`} actions={<Button asChild variant="glass"><Link href="/calendar">Calendar view</Link></Button>} />
      <JobsList items={JSON.parse(JSON.stringify(r.items)) as JobRow[]} timezone={ctx.workspace.timezone} mode="queue" emptyText="The queue is empty" />
    </>
  );
}
