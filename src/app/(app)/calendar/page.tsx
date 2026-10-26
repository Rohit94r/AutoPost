import { Calendar } from "@/components/calendar/calendar";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const ctx = await requirePageContext();
  return (
    <>
      <PageHeader eyebrow="Plan" title="Publishing calendar" />
      <Calendar timezone={ctx.workspace.timezone} />
    </>
  );
}
