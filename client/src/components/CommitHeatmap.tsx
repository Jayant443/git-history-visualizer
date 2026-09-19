import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { HeatmapDay } from "../data/mockData";

interface CommitHeatmapProps {
  days: HeatmapDay[];
}

function intensity(count: number): string {
  if (count === 0) return "bg-slate-800/80";
  if (count <= 2) return "bg-green-950 border-green-900";
  if (count <= 4) return "bg-green-800";
  if (count <= 6) return "bg-green-600";
  return "bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CommitHeatmap({ days }: CommitHeatmapProps) {
  const [hover, setHover] = useState<HeatmapDay | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const total = useMemo(() => days.reduce((s, d) => s + d.count, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.count > 0).length, [days]);
  const best = useMemo(
    () => days.reduce((m, d) => Math.max(m, d.count), 0),
    [days],
  );

  // Render as week columns (7 rows) for a GitHub-like matrix.
  const weeks: HeatmapDay[][] = useMemo(() => {
    const out: HeatmapDay[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  return (
    <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-green-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Activity overview
          </h2>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          <span>
            <strong className="text-slate-100">{total}</strong> commits
          </span>
          <span>
            <strong className="text-slate-100">{activeDays}</strong> active days
          </span>
          <span>
            best day <strong className="text-slate-100">{best}</strong>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          Less
          {[0, 2, 4, 6, 8].map((c) => (
            <span
              key={c}
              className={`h-2.5 w-2.5 rounded-[3px] border border-slate-800 ${intensity(c)}`}
            />
          ))}
          More
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="flex gap-1"
          onMouseLeave={() => {
            setHover(null);
            setAnchor(null);
          }}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  aria-label={`${day.date}: ${day.count} commits`}
                  onMouseEnter={(e) => {
                    const r = (
                      e.currentTarget as HTMLButtonElement
                    ).getBoundingClientRect();
                    setAnchor({ x: r.left + r.width / 2, y: r.top });
                    setHover(day);
                  }}
                  onFocus={(e) => {
                    const r = (
                      e.currentTarget as HTMLButtonElement
                    ).getBoundingClientRect();
                    setAnchor({ x: r.left + r.width / 2, y: r.top });
                    setHover(day);
                  }}
                  className={`h-3.5 w-3.5 rounded-[4px] border border-transparent transition-transform hover:scale-125 hover:ring-1 hover:ring-green-400 ${intensity(day.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {hover && anchor && (
          <motion.div
            key={hover.date}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            style={{
              left: Math.min(Math.max(anchor.x, 150), window.innerWidth - 150),
              top: Math.max(anchor.y - 8, 8),
              transform: "translate(-50%, -100%)",
            }}
            className="pointer-events-none fixed z-50 w-60 rounded-lg border border-[#30363d] bg-[#161b22] p-3 shadow-2xl shadow-black/60"
          >
            <p className="text-xs font-semibold text-slate-100">
              {hover.count === 0 ? "No commits" : `${hover.count} commit${hover.count > 1 ? "s" : ""}`}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(hover.date)}</p>
            {hover.authors.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {hover.authors.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">No authors — quiet day.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
