"use client";
import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { GlassCard, Spinner } from "@/components/ui/misc";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import { formatInZone, zonedLocalToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  platform: Platform;
  status: string;
  scheduledAt: string;
  timezone: string;
  content: { id: string; title: string };
  account: { displayName: string };
}

type View = "month" | "week" | "agenda";

/** Calendar days are plain local dates in the workspace time zone ("yyyy-MM-dd"). */
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export function Calendar({ timezone }: { timezone: string }) {
  const todayKey = formatInZone(new Date(), timezone, "yyyy-MM-dd");
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date(`${todayKey}T00:00:00`));
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [platform, setPlatform] = useState<"" | Platform>("");
  const [status, setStatus] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
      return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    }
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return Array.from({ length: 30 }, (_, i) => addDays(cursor, i));
  }, [view, cursor]);

  const fetchJobs = useCallback(async (): Promise<Job[]> => {
    const from = zonedLocalToUtc(`${dayKey(days[0]!)}T00:00`, timezone);
    const to = zonedLocalToUtc(`${dayKey(addDays(days[days.length - 1]!, 1))}T00:00`, timezone);
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), pageSize: "500", order: "asc" });
    if (platform) qs.set("platform", platform);
    if (status) qs.set("status", status);
    try {
      return (await api<{ items: Job[] }>(`/publishing-jobs?${qs}`)).items;
    } catch (err) {
      toast.error(errorMessage(err));
      return [];
    }
  }, [days, timezone, platform, status]);

  const load = useCallback(() => fetchJobs().then(setJobs), [fetchJobs]);

  useEffect(() => {
    let alive = true;
    fetchJobs().then((items) => alive && setJobs(items));
    return () => {
      alive = false;
    };
  }, [fetchJobs]);

  const byDay = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs ?? []) {
      const k = formatInZone(j.scheduledAt, timezone, "yyyy-MM-dd");
      m.set(k, [...(m.get(k) ?? []), j]);
    }
    return m;
  }, [jobs, timezone]);

  async function drop(day: Date) {
    const job = jobs?.find((j) => j.id === dragId);
    setDragId(null);
    if (!job || job.status !== "scheduled") return;
    const k = dayKey(day);
    if (k < todayKey) return toast.error("You can't move a post into the past.");
    const time = formatInZone(job.scheduledAt, timezone, "HH:mm");
    if (formatInZone(job.scheduledAt, timezone, "yyyy-MM-dd") === k) return;
    try {
      await api(`/publishing-jobs/${job.id}/reschedule`, { method: "POST", json: { scheduledAtLocal: `${k}T${time}`, timezone } });
      toast.success(`Moved to ${format(day, "EEE d MMM")} at ${time}`);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const step = (dir: 1 | -1) => setCursor((c) => (view === "month" ? addMonths(c, dir) : addDays(c, dir * (view === "week" ? 7 : 30))));
  const titleText = view === "month" ? format(cursor, "MMMM yyyy") : `${format(days[0]!, "d MMM")} – ${format(days[days.length - 1]!, "d MMM yyyy")}`;

  const chip = (j: Job, compact = false) => (
    <div
      key={j.id}
      draggable={j.status === "scheduled"}
      onDragStart={(e) => {
        setDragId(j.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDragId(null)}
      className={cn(
        "group flex items-center gap-1.5 rounded-lg bg-black/35 px-1.5 py-1 text-[11px] text-mist ring-1 ring-white/5",
        j.status === "scheduled" && "cursor-grab active:cursor-grabbing",
        j.status === "failed" && "ring-red-400/40",
        j.status === "published" && "opacity-75",
      )}
      title={`${j.content.title} · ${PLATFORM_META[j.platform].label} · ${j.account.displayName} · ${j.status}`}
    >
      {j.status === "scheduled" && <GripVertical className="size-3 shrink-0 text-stone opacity-0 group-hover:opacity-100" />}
      <PlatformIcon platform={j.platform} className="size-3 shrink-0" />
      <span className="tabular-nums text-fog">{formatInZone(j.scheduledAt, timezone, "HH:mm")}</span>
      <Link href={`/compose?id=${j.content.id}`} className="truncate hover:underline">
        {j.content.title}
      </Link>
      {!compact && <StatusBadge status={j.status} className="ml-auto shrink-0 px-1.5! text-[10px]!" />}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="glass" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button size="icon" variant="glass" onClick={() => step(1)} aria-label="Next">
            <ChevronRight />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(`${todayKey}T00:00:00`))}>
            Today
          </Button>
        </div>
        <h2 className="min-w-48 font-display text-3xl text-white">{titleText}</h2>
        <div className="flex-1" />
        <Select aria-label="Platform filter" className="w-36" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_META[p].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status filter" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="scheduled,queued">Scheduled</option>
          <option value="published">Published</option>
          <option value="failed,needs_reconnection">Failed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <div className="inline-flex rounded-xl bg-black/25 p-1" role="tablist" aria-label="Calendar view">
          {(["month", "week", "agenda"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", view === v ? "bg-white/12 text-white" : "text-fog")}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-stone">Times in {timezone}. Drag a scheduled post to another day to reschedule it at the same time.</p>

      <GlassCard className="relative p-2 sm:p-3">
        {jobs === null && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/20">
            <Spinner className="size-6 text-moss" />
          </div>
        )}
        {view === "agenda" ? (
          <ul className="divide-y divide-white/6">
            {days
              .filter((d) => byDay.get(dayKey(d))?.length)
              .map((d) => (
                <li key={dayKey(d)} className="grid gap-2 py-3 sm:grid-cols-[140px_1fr]">
                  <p className={cn("text-sm", dayKey(d) === todayKey ? "text-moss" : "text-fog")}>{format(d, "EEE d MMM")}</p>
                  <div className="space-y-1.5">{byDay.get(dayKey(d))!.map((j) => chip(j))}</div>
                </li>
              ))}
            {jobs && !days.some((d) => byDay.get(dayKey(d))?.length) && <li className="py-12 text-center text-sm text-fog">Nothing scheduled in the next 30 days.</li>}
          </ul>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-[11px] uppercase tracking-wider text-stone">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
                return (
                  <div
                    key={k}
                    onDragOver={(e) => {
                      if (dragId && k >= todayKey) e.preventDefault();
                    }}
                    onDrop={() => drop(d)}
                    className={cn(
                      "rounded-xl border border-white/6 bg-black/15 p-1.5 transition",
                      view === "week" ? "min-h-72" : "min-h-28",
                      !inMonth && "opacity-40",
                      k < todayKey && "bg-black/30",
                      dragId && k >= todayKey && "border-dashed border-moss/40",
                    )}
                  >
                    <p className={cn("mb-1 text-right text-xs", k === todayKey ? "font-semibold text-moss" : "text-fog")}>{format(d, view === "week" ? "EEE d" : "d")}</p>
                    <div className="space-y-1">
                      {list.slice(0, view === "week" ? 20 : 3).map((j) => chip(j, true))}
                      {view === "month" && list.length > 3 && <p className="text-[10px] text-stone">+{list.length - 3} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
