import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GitMerge, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { BRANCH_COLORS, type MockCommit } from "../data/mockData";
import { cn } from "../lib/cn";

interface CommitGraphProps {
  commits: MockCommit[];
  selectedId: string | null;
  onSelect: (c: MockCommit) => void;
}

const ROW_H = 76;
const LANE_W = 120;
const NODE_R = 9;

function laneOf(branch: string): number {
  if (branch === "main") return 0;
  if (branch === "feature/auth") return 1;
  return 2;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommitGraph({ commits, selectedId, onSelect }: CommitGraphProps) {
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Newest first for display; edges resolved by id lookup.
  const ordered = useMemo(() => [...commits].reverse(), [commits]);
  const byId = useMemo(() => new Map(commits.map((c) => [c.id, c])), [commits]);
  const indexById = useMemo(
    () => new Map(ordered.map((c, i) => [c.id, i])),
    [ordered],
  );

  const width = LANE_W * 3 + 40;
  const height = ordered.length * ROW_H + 40;

  const hoverCommit = hoverId ? byId.get(hoverId) ?? null : null;

  return (
    <section className="relative flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Commit graph</h2>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
          {commits.length} commits
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs text-slate-400 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.15).toFixed(2)))}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Branch lane legend */}
      <div className="flex flex-wrap gap-3 border-b border-slate-800/80 px-4 py-2 text-[11px]">
        {Object.entries(BRANCH_COLORS).map(([b, color]) => (
          <span key={b} className="inline-flex items-center gap-1.5 text-slate-400">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: color }}
            />
            {b}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <GitMerge className="h-3.5 w-3.5 text-slate-300" /> merge
        </span>
      </div>

      <div className="graph-scroll min-h-[320px] flex-1 overflow-auto">
        <div
          style={{
            width: width * zoom + 320,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
          className="relative"
        >
          <svg
            width={width}
            height={height}
            className="absolute top-0 left-0"
            aria-hidden="true"
          >
            {ordered.map((commit) => {
              const childIdx = indexById.get(commit.id) ?? 0;
              const x2 = 30 + laneOf(commit.branch) * LANE_W;
              const y2 = 24 + childIdx * ROW_H + 14;
              return commit.parents.map((p) => {
                const parent = byId.get(p);
                if (!parent) return null;
                const parentIdx = indexById.get(p);
                if (parentIdx === undefined) return null; // filtered out
                const x1 = 30 + laneOf(parent.branch) * LANE_W;
                const y1 = 24 + parentIdx * ROW_H + 14;
                const sameLane = x1 === x2;
                const path = sameLane
                  ? `M ${x2} ${y2} L ${x1} ${y1}`
                  : `M ${x2} ${y2} C ${x2} ${(y2 + y1) / 2}, ${x1} ${(y2 + y1) / 2}, ${x1} ${y1}`;
                return (
                  <path
                    key={`${commit.id}->${p}`}
                    d={path}
                    fill="none"
                    stroke={commit.isMerge ? "#94a3b8" : BRANCH_COLORS[commit.branch] ?? "#22c55e"}
                    strokeWidth={commit.isMerge ? 1.6 : 2}
                    strokeDasharray={commit.isMerge ? "5 4" : undefined}
                    opacity={0.75}
                  />
                );
              });
            })}
          </svg>

          <div style={{ width, height }} className="relative">
            {ordered.map((commit, i) => {
              const color = BRANCH_COLORS[commit.branch] ?? "#22c55e";
              const y = 24 + i * ROW_H;
              const x = 30 + laneOf(commit.branch) * LANE_W;
              const isSelected = commit.id === selectedId;
              const isHover = commit.id === hoverId;
              return (
                <div
                  key={commit.id}
                  className="absolute flex items-center gap-3"
                  style={{ top: y, left: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(commit)}
                    onMouseEnter={() => setHoverId(commit.id)}
                    onMouseLeave={() => setHoverId((id) => (id === commit.id ? null : id))}
                    onFocus={() => setHoverId(commit.id)}
                    onBlur={() => setHoverId((id) => (id === commit.id ? null : id))}
                    aria-label={`${commit.short} ${commit.message}`}
                    className="relative flex h-7 w-7 items-center justify-center rounded-full focus:outline-none"
                    style={{ marginLeft: x - 14 }}
                  >
                    <span
                      className={cn(
                        "block rounded-full transition-transform",
                        isHover && "scale-125",
                      )}
                      style={{
                        width: commit.isMerge ? 18 : NODE_R * 2,
                        height: commit.isMerge ? 18 : NODE_R * 2,
                        background: commit.isMerge ? "#0f172a" : color,
                        border: `2px solid ${commit.isMerge ? "#94a3b8" : color}`,
                        boxShadow: isSelected
                          ? `0 0 0 4px ${color}44, 0 0 14px ${color}`
                          : isHover
                            ? `0 0 12px ${color}`
                            : `0 0 6px ${color}66`,
                        borderRadius: commit.isMerge ? 5 : 999,
                      }}
                    >
                      {commit.isMerge && (
                        <GitMerge
                          className="absolute inset-0 m-auto h-3 w-3 text-slate-200"
                        />
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelect(commit)}
                    onMouseEnter={() => setHoverId(commit.id)}
                    onMouseLeave={() => setHoverId((id) => (id === commit.id ? null : id))}
                    className={cn(
                      "max-w-64 truncate rounded-md border px-2.5 py-1.5 text-left text-xs transition",
                      isSelected
                        ? "border-green-500/60 bg-green-500/10 text-slate-100"
                        : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-600",
                    )}
                  >
                    <span className="block truncate font-medium">{commit.message}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                      {commit.short} · {commit.branch}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating hover card */}
      <AnimatePresence>
        {hoverCommit && (
          <motion.div
            key={hoverCommit.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
            className="pointer-events-none absolute bottom-4 left-4 z-20 w-72 rounded-xl border border-slate-700 bg-slate-950/95 p-3.5 shadow-2xl shadow-black/70 backdrop-blur"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-950"
                style={{ background: hoverCommit.author.color }}
              >
                {hoverCommit.author.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold text-slate-100">
                  {hoverCommit.author.name}
                </p>
                <p className="text-[11px] text-slate-500">{hoverCommit.author.handle}</p>
              </div>
              <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-green-300">
                {hoverCommit.short}
              </span>
            </div>
            <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-200">
              {hoverCommit.message}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              {formatDateTime(hoverCommit.date)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
