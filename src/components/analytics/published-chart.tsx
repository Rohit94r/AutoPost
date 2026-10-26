"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-series bar chart: posts confirmed published per day.
 * Bar color #2fa86a was validated (dark mode, OKLCH L 0.48–0.67, contrast ≥ 3:1 on the panel surface).
 * One series → no legend; the card title names it. Hover tooltip + table view for accessibility.
 */
export function PublishedChart({ series, days, end }: { series: { day: string; n: number }[]; days: number; end: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = useMemo(() => {
    const map = new Map(series.map((s) => [s.day, s.n]));
    const endMs = new Date(end).getTime();
    const out: { day: string; n: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endMs - i * 86400_000).toISOString().slice(0, 10);
      out.push({ day: d, n: map.get(d) ?? 0 });
    }
    return out;
  }, [series, days, end]);
  const max = Math.max(1, ...data.map((d) => d.n));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const total = data.reduce((s, d) => s + d.n, 0);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button className="text-xs text-fog underline-offset-2 hover:text-white hover:underline" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone">
              <tr>
                <th className="py-1 font-normal">Day (UTC)</th>
                <th className="py-1 text-right font-normal">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.filter((d) => d.n > 0).map((d) => (
                <tr key={d.day} className="border-t border-white/6">
                  <td className="py-1.5 text-mist">{d.day}</td>
                  <td className="py-1.5 text-right tabular-nums text-white">{d.n}</td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-fog">
                    No posts published in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex h-56 gap-2" role="img" aria-label={`Posts published per day over the last ${days} days. Total ${total}.`}>
          <div className="flex w-6 flex-col-reverse justify-between pb-5 text-right text-[10px] tabular-nums text-stone">
            {ticks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
              {ticks.map((t) => (
                <div key={t} className="border-t border-white/[0.06]" />
              ))}
            </div>
            <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px]">
              {data.map((d, i) => (
                <div key={d.day} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div
                    className={cn("w-full rounded-t-[4px] transition-colors", d.n ? (hover === i ? "bg-[#4ade80]" : "bg-[#2fa86a]") : "")}
                    style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 3 : 0 }}
                  />
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-stone">
              <span>{data[0]?.day.slice(5)}</span>
              <span>{data[Math.floor(data.length / 2)]?.day.slice(5)}</span>
              <span>{data[data.length - 1]?.day.slice(5)}</span>
            </div>
            {hover !== null && data[hover] && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-[#0c1a14]/95 px-2.5 py-1.5 text-xs shadow-xl"
                style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
              >
                <span className="text-fog">{data[hover].day}</span> <span className="ml-1 font-semibold tabular-nums text-white">{data[hover].n} published</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
