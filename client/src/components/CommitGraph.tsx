import { useEffect, useMemo, useRef, useState } from "react";
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
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [sectionWidth, setSectionWidth] = useState(800);
  const sectionRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Oldest-first topological order for display: the root/initial commit
  // renders at the very top, children flow downwards, and the most recent
  // commit lands at the very bottom. Date breaks ties between siblings.
  const ordered = useMemo(() => {
    const byIdLocal = new Map(commits.map((c) => [c.id, c]));
    const indegree = new Map<string, number>();
    const childrenOf = new Map<string, string[]>();
    for (const c of commits) {
      const knownParents = c.parents.filter((p) => byIdLocal.has(p));
      indegree.set(c.id, knownParents.length);
      for (const p of knownParents) {
        const arr = childrenOf.get(p) ?? [];
        arr.push(c.id);
        childrenOf.set(p, arr);
      }
    }
    const dateOf = (id: string) => byIdLocal.get(id)?.date ?? "";
    const byDate = (a: string, b: string) =>
      dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : a < b ? -1 : 1;
    const ready = commits
      .filter((c) => (indegree.get(c.id) ?? 0) === 0)
      .map((c) => c.id)
      .sort(byDate);
    const out: MockCommit[] = [];
    while (ready.length > 0) {
      ready.sort(byDate);
      const id = ready.shift() as string;
      const node = byIdLocal.get(id);
      if (!node) continue;
      out.push(node);
      for (const child of childrenOf.get(id) ?? []) {
        indegree.set(child, (indegree.get(child) ?? 1) - 1);
        if (indegree.get(child) === 0) ready.push(child);
      }
    }
    // Cycle fallback (shouldn't happen with git DAGs): append leftovers by date.
    if (out.length < commits.length) {
      const seen = new Set(out.map((c) => c.id));
      out.push(
        ...commits
          .filter((c) => !seen.has(c.id))
          .sort((a, b) => byDate(a.id, b.id)),
      );
    }
    return out;
  }, [commits]);
  const byId = useMemo(() => new Map(commits.map((c) => [c.id, c])), [commits]);
  const indexById = useMemo(
    () => new Map(ordered.map((c, i) => [c.id, i])),
    [ordered],
  );

  const width = LANE_W * 3 + 40;
  const height = ordered.length * ROW_H + 40;

  const hoverCommit = hoverId ? byId.get(hoverId) ?? null : null;

  // Keep the viewport pinned to the top whenever a new history loads so
  // the root/initial commit is immediately visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [commits]);

  function updateHoverPos(e: React.MouseEvent) {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSectionWidth(rect.width);
    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleNodeEnter(e: React.MouseEvent, id: string) {
    updateHoverPos(e);
    setHoverId(id);
  }

  function handleNodeLeave(id: string) {
    setHoverId((cur) => (cur === id ? null : cur));
    setHoverPos(null);
  }

  function handleNodeFocus(commit: (typeof ordered)[number]) {
    // Keyboard focus has no cursor — anchor near the node's lane instead.
    const x = 30 + laneOf(commit.branch) * LANE_W + 48;
    const idx = indexById.get(commit.id) ?? 0;
    const y = 24 + idx * ROW_H + 14;
    setHoverPos({ x, y });
    setHoverId(commit.id);
  }

  const CARD_W = 288;
  const cardLeft =
    hoverPos == null
      ? 0
      : hoverPos.x + CARD_W + 28 > sectionWidth
        ? Math.max(8, hoverPos.x - CARD_W - 20)
        : hoverPos.x + 20;
  const cardTop = hoverPos == null ? 0 : Math.max(8, hoverPos.y - 24);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-0 flex-col rounded-xl border border-[#30363d] bg-[#161b22]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[#30363d] px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Commit graph</h2>
        <span className="rounded-full border border-[#30363d] px-2 py-0.5 text-[11px] text-slate-400">
          {commits.length} commits
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            className="rounded-md border border-[#30363d] p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
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
            className="rounded-md border border-[#30363d] p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md border border-[#30363d] p-1.5 text-slate-300 hover:border-green-500/50 hover:text-green-300"
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Branch lane legend */}
      <div className="flex flex-wrap gap-3 border-b border-[#30363d]/80 px-4 py-2 text-[11px]">
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

      <div ref={scrollRef} className="graph-scroll min-h-[320px] flex-1 overflow-auto">
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
                    onMouseEnter={(e) => handleNodeEnter(e, commit.id)}
                    onMouseMove={updateHoverPos}
                    onMouseLeave={() => handleNodeLeave(commit.id)}
                    onFocus={() => handleNodeFocus(commit)}
                    onBlur={() => handleNodeLeave(commit.id)}
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
                        background: commit.isMerge ? "#161b22" : color,
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
                    onMouseEnter={(e) => handleNodeEnter(e, commit.id)}
                    onMouseMove={updateHoverPos}
                    onMouseLeave={() => handleNodeLeave(commit.id)}
                    className={cn(
                      "max-w-64 truncate rounded-md border px-2.5 py-1.5 text-left text-xs transition",
                      isSelected
                        ? "border-green-500/60 bg-green-500/10 text-slate-100"
                        : "border-[#30363d] bg-[#0d1117]/80 text-slate-300 hover:border-slate-600",
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

      {/* Hover card — floats adjacent to the hovered node */}
      <AnimatePresence>
        {hoverCommit && hoverPos && (
          <motion.div
            key={hoverCommit.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
            style={{ left: cardLeft, top: cardTop }}
            className="pointer-events-none absolute z-20 w-72 rounded-xl border border-[#30363d] bg-[#161b22]/95 p-3.5 shadow-2xl shadow-black/70 backdrop-blur"
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
              <span className="ml-auto rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-[10px] text-green-300">
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
