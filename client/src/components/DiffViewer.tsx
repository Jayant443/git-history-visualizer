import { useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Braces,
  File,
  FileCode,
  FileText,
  FileType,
  GitCompareArrows,
  LoaderCircle,
  Palette,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import type { MockCommit } from "../data/mockData";
import { cn } from "../lib/cn";

interface DiffViewerProps {
  commit: MockCommit | null;
  onClose: () => void;
  /** Advance to the next commit (graph order); null when this is the last. */
  onNextCommit?: (() => void) | null;
  /** True while live file content is being fetched from the backend. */
  isLoadingFiles?: boolean;
}

type Speed = 1 | 2 | 5;

const SPEEDS: Speed[] = [1, 2, 5];

// Tick interval per speed; each tick applies CHARS_PER_TICK (scaled up for
// very large diffs so full-file snapshots still finish in a reasonable time).
const INTERVAL_MS: Record<Speed, number> = { 1: 50, 2: 30, 5: 16 };
const CHARS_PER_TICK: Record<Speed, number> = { 1: 1, 2: 3, 5: 10 };

/* ------------------------------------------------------------------ */
/* Character-level step simulation: original -> modified               */
/* ------------------------------------------------------------------ */

type CharStep = { op: "del" | "ins"; index: number; ch: string };
type LineOp = { kind: "eq" | "del" | "ins"; line: string };

function splitLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/** Line ops between two snapshots: common prefix/suffix + LCS on the middle. */
function computeLineOps(a: string[], b: string[]): LineOp[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const ops: LineOp[] = [];
  for (let i = 0; i < prefix; i++) ops.push({ kind: "eq", line: a[i] });
  ops.push(...diffMiddle(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)));
  for (let i = a.length - suffix; i < a.length; i++) ops.push({ kind: "eq", line: a[i] });
  return ops;
}

function diffMiddle(a: string[], b: string[]): LineOp[] {
  if (a.length === 0) return b.map((line) => ({ kind: "ins" as const, line }));
  if (b.length === 0) return a.map((line) => ({ kind: "del" as const, line }));
  if (a.length * b.length > 250_000) {
    // Large middle: single replace hunk (delete all, then insert all).
    return [
      ...a.map((line) => ({ kind: "del" as const, line })),
      ...b.map((line) => ({ kind: "ins" as const, line })),
    ];
  }
  // LCS dynamic program over the trimmed middle.
  const n = a.length;
  const m = b.length;
  const stride = m + 1;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * stride + j] =
        a[i] === b[j]
          ? dp[(i + 1) * stride + (j + 1)] + 1
          : Math.max(dp[(i + 1) * stride + j], dp[i * stride + (j + 1)]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "eq", line: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
      ops.push({ kind: "del", line: a[i] });
      i++;
    } else {
      ops.push({ kind: "ins", line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "del", line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "ins", line: b[j] });
    j++;
  }
  return ops;
}

/**
 * Expand line ops into atomic character steps, simulated against a live
 * char buffer so indices stay exact. Deletions run backwards (backspace
 * effect) through the targeted range; insertions run forwards (typing).
 */
function buildCharSteps(original: string, ops: LineOp[]): CharStep[] {
  const steps: CharStep[] = [];
  const buf: string[] = original === "" ? [] : original.split("");
  let ptr = 0;
  ops.forEach((op, opIdx) => {
    const hasNext = opIdx < ops.length - 1;
    if (op.kind === "eq") {
      const newlineFollows =
        ptr + op.line.length < buf.length && buf[ptr + op.line.length] === "\n";
      ptr += op.line.length + (newlineFollows ? 1 : 0);
    } else if (op.kind === "del") {
      const newlineFollows =
        ptr + op.line.length < buf.length && buf[ptr + op.line.length] === "\n";
      for (let k = op.line.length - 1; k >= 0; k--) {
        steps.push({ op: "del", index: ptr + k, ch: op.line[k] });
        buf.splice(ptr + k, 1);
      }
      if (newlineFollows) {
        steps.push({ op: "del", index: ptr, ch: "\n" });
        buf.splice(ptr, 1);
      }
    } else {
      if (ptr >= buf.length && buf.length > 0 && buf[buf.length - 1] !== "\n") {
        steps.push({ op: "ins", index: ptr, ch: "\n" });
        buf.splice(ptr, 0, "\n");
        ptr += 1;
      }
      for (let k = 0; k < op.line.length; k++) {
        steps.push({ op: "ins", index: ptr, ch: op.line[k] });
        buf.splice(ptr, 0, op.line[k]);
        ptr += 1;
      }
      if (ptr < buf.length) {
        steps.push({ op: "ins", index: ptr, ch: "\n" });
        buf.splice(ptr, 0, "\n");
        ptr += 1;
      } else if (hasNext) {
        steps.push({ op: "ins", index: ptr, ch: "\n" });
        buf.splice(ptr, 0, "\n");
        ptr += 1;
      } else if (op.line === "" && (buf.length === 0 || buf[buf.length - 1] !== "\n")) {
        // Trailing empty line = the file ends with a newline.
        steps.push({ op: "ins", index: ptr, ch: "\n" });
        buf.splice(ptr, 0, "\n");
        ptr += 1;
      }
    }
  });
  return steps;
}

/** VS Code-style icon per file extension. */
function fileIconForPath(path: string): { Icon: typeof File; className: string } {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return { Icon: FileCode, className: "text-blue-400" };
    case "js":
    case "jsx":
      return { Icon: FileCode, className: "text-yellow-300" };
    case "json":
      return { Icon: Braces, className: "text-yellow-200" };
    case "css":
      return { Icon: Palette, className: "text-purple-300" };
    case "html":
      return { Icon: FileCode, className: "text-orange-400" };
    case "py":
      return { Icon: FileCode, className: "text-green-400" };
    case "md":
    case "markdown":
      return { Icon: FileText, className: "text-slate-400" };
    case "yml":
    case "yaml":
      return { Icon: FileType, className: "text-red-300" };
    default:
      return { Icon: File, className: "text-slate-500" };
  }
}

function splitName(path: string): { dir: string; name: string } {
  const parts = path.split("/");
  if (parts.length === 1) return { dir: "", name: path };
  return { dir: parts.slice(0, -1).join("/"), name: parts[parts.length - 1] };
}

/** Char offset in `text` -> 1-based Monaco position, clamped into range. */
function offsetToPosition(text: string, index: number): { lineNumber: number; column: number } {
  const clamped = Math.max(0, Math.min(index, text.length));
  const before = text.slice(0, clamped);
  const lineNumber = before.split("\n").length;
  const column = clamped - (before.lastIndexOf("\n") + 1) + 1;
  return { lineNumber, column };
}

type MonacoApi = Parameters<DiffOnMount>[1];
type ModifiedEditor = ReturnType<Parameters<DiffOnMount>[0]["getModifiedEditor"]>;

export function DiffViewer({ commit, onClose, onNextCommit = null, isLoadingFiles = false }: DiffViewerProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [stepIdx, setStepIdx] = useState(0);
  const [buffer, setBuffer] = useState("");
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const modifiedRef = useRef<ModifiedEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const decorIdsRef = useRef<string[]>([]);

  // Remounted per commit via `key` in App, so initial state is the reset path.
  const activeFile =
    commit?.files.find((f) => f.path === activePath) ?? commit?.files[0] ?? null;

  const original = activeFile?.original ?? "";
  const modified = activeFile?.modified ?? "";

  // Full step script from parent snapshot to target snapshot.
  const steps = useMemo(
    () => buildCharSteps(original, computeLineOps(splitLines(original), splitLines(modified))),
    [original, modified],
  );
  const total = steps.length;
  const done = stepIdx >= total;

  // Baseline: selecting a commit/file (or reset) starts from the complete
  // original content. Derived-state-during-render is the reset pattern here.
  const fileKey = commit ? `${commit.id}::${activeFile?.path ?? ""}` : null;
  if (fileKey !== prevKey) {
    setPrevKey(fileKey);
    setBuffer(original);
    setStepIdx(0);
    setIsPlaying(true);
  }

  // Playback loop: apply the next chunk of character steps per tick. Speed
  // controls the step delay; huge diffs auto-scale the chunk so playback
  // still finishes in a reasonable number of ticks.
  useEffect(() => {
    if (!isPlaying || done) return;
    const id = window.setInterval(() => {
      const chunk = Math.max(CHARS_PER_TICK[speed], Math.ceil(total / 500));
      const next = Math.min(stepIdx + chunk, total);
      setBuffer((prev) => {
        const arr = prev.split("");
        for (let k = stepIdx; k < next; k++) {
          const s = steps[k];
          if (s.op === "del") arr.splice(s.index, 1);
          else arr.splice(s.index, 0, s.ch);
        }
        return arr.join("");
      });
      setStepIdx(next);
    }, INTERVAL_MS[speed]);
    return () => window.clearInterval(id);
  }, [isPlaying, done, speed, stepIdx, steps, total]);

  const handleDiffMount: DiffOnMount = (editor, monaco) => {
    modifiedRef.current = editor.getModifiedEditor();
    monacoRef.current = monaco;
    decorIdsRef.current = [];
  };

  function clearLiveCursor() {
    if (modifiedRef.current) {
      decorIdsRef.current = modifiedRef.current.deltaDecorations(
        decorIdsRef.current,
        [],
      );
    }
  }

  // Simulated live cursor: highlight the character the next step edits and
  // keep it in view, so playback feels like someone typing/backspacing.
  useEffect(() => {
    const modified = modifiedRef.current;
    const monaco = monacoRef.current;
    const upcoming: CharStep | null = done ? null : (steps[stepIdx] ?? null);
    if (!modified || !monaco || !upcoming || buffer.length === 0) {
      clearLiveCursor();
      return;
    }
    const { lineNumber, column } = offsetToPosition(buffer, upcoming.index);
    // Zero-width range: the caret is injected content at the exact edit
    // point (no character highlight).
    const range = new monaco.Range(lineNumber, column, lineNumber, column);
    decorIdsRef.current = modified.deltaDecorations(decorIdsRef.current, [
      {
        range,
        options: { beforeContentClassName: "live-cursor" },
      },
    ]);
    const visible = modified.getVisibleRanges();
    const inView = visible.some((r) => r.containsPosition(range.getStartPosition()));
    if (!inView) modified.revealLineInCenter(lineNumber);
    return clearLiveCursor;
  }, [buffer, done, stepIdx, steps]);

  function handleReset() {
    setBuffer(original);
    setStepIdx(0);
    setIsPlaying(true);
  }
  function handleSkipToEnd() {
    // Skip means "done with this file": move to the next file when there is
    // one (it replays from the top via the `fileKey` reset), otherwise move
    // to the next commit; only the very last file snaps to its final state.
    const paths = commit?.files.map((f) => f.path) ?? [];
    if (paths.length === 0) {
      // Nothing to show here — but never skip a commit whose files are
      // still loading from the backend.
      if (!isLoadingFiles) onNextCommit?.();
      return;
    }
    const idx = paths.indexOf(activePath ?? paths[0] ?? "");
    const next = idx >= 0 ? paths[idx + 1] : undefined;
    if (next) {
      setActivePath(next);
      return;
    }
    if (onNextCommit) {
      onNextCommit();
      return;
    }
    setBuffer(modified);
    setStepIdx(total);
    setIsPlaying(false);
  }

  const filePaths = commit?.files.map((f) => f.path) ?? [];
  const activeIdx = filePaths.indexOf(activePath ?? filePaths[0] ?? "");
  const isLastFile =
    filePaths.length === 0 || activeIdx === filePaths.length - 1;

  // Auto-advance: once a file finishes replaying, move to the next file so
  // the whole commit plays through, then on to the next commit. Zero-change
  // files count as finished so playback glides past them instead of getting
  // stuck. Held while paused or while files are still loading.
  useEffect(() => {
    if (!done || !isPlaying || !commit || isLoadingFiles) return;
    const paths = commit.files.map((f) => f.path);
    const idx = paths.indexOf(activePath ?? paths[0] ?? "");
    const nextFile = idx >= 0 ? paths[idx + 1] : undefined;
    const advance = nextFile ? () => setActivePath(nextFile) : (onNextCommit ?? undefined);
    if (!advance) return;
    const id = window.setTimeout(advance, 0);
    return () => window.clearTimeout(id);
  }, [done, isPlaying, commit, activePath, isLoadingFiles, onNextCommit]);

  // Live buffer drives the unified editor view. Snapping to `modified` at
  // completion keeps the end exact.
  const animatedModified = done ? modified : buffer;
  const nextStep: CharStep | null = done ? null : (steps[stepIdx] ?? null);
  const phase: "deleting" | "typing" | "done" =
    done || total === 0 ? "done" : nextStep?.op === "del" ? "deleting" : "typing";
  const pct = total === 0 ? 100 : Math.round((stepIdx / total) * 100);

  return (
    <AnimatePresence>
      {commit && (
        <motion.aside
          key={commit.id}
          initial={{ x: 480, opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 480, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="fixed top-36 right-0 z-40 flex h-[calc(100dvh-9rem)] w-full max-w-4xl flex-col overflow-hidden border-l border-[#30363d] bg-[#0d1117] shadow-2xl shadow-black/70 lg:top-16 lg:h-[calc(100dvh-4rem)]"
          role="dialog"
          aria-label={`Diff for ${commit.short}`}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-[#30363d] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">
                {commit.message}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">
                <span className="text-green-300">{commit.short}</span> ·{" "}
                {commit.author.name} ({commit.author.handle}) ·{" "}
                {new Date(commit.date).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-md border border-[#30363d] p-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-100"
              aria-label="Close diff view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Diff toolbar header: view label + integrated playback controls */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-3 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/15 px-2.5 py-1.5 text-xs font-medium text-green-300 ring-1 ring-green-500/40">
              <GitCompareArrows className="h-3.5 w-3.5" />
              Diff
            </span>

            <button
              type="button"
              onClick={() => {
                if (done) handleReset();
                else setIsPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-green-400"
              aria-label={isPlaying ? "Pause playback" : "Play playback"}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? "Pause" : done ? "Replay" : "Resume"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-green-500/50 hover:text-green-300"
              aria-label="Reset playback"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleSkipToEnd}
              disabled={done}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-green-500/50 hover:text-green-300 disabled:cursor-default disabled:opacity-40"
              aria-label={isLastFile && onNextCommit ? "Next commit" : "Skip to end"}
              title={isLastFile && onNextCommit ? "Skip to next commit" : "Skip to final state"}
            >
              <SkipForward className="h-3.5 w-3.5" />
              {isLastFile && onNextCommit ? "Next" : "Skip"}
            </button>

            <div
              className="flex items-center gap-1 rounded-md border border-[#30363d] bg-[#0d1117] p-0.5"
              role="group"
              aria-label="Playback speed"
            >
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    "rounded px-2 py-1 font-mono text-[11px] transition",
                    speed === s
                      ? "bg-green-500/15 text-green-300 ring-1 ring-green-500/40"
                      : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Live phase + simulated cursor */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[11px] tabular-nums",
                phase === "deleting" && "bg-red-500/10 text-red-300 ring-1 ring-red-500/30",
                phase === "typing" && "bg-green-500/10 text-green-300 ring-1 ring-green-500/30",
                phase === "done" && "text-slate-500",
              )}
            >
              {phase !== "done" && (
                <span
                  className={cn(
                    "inline-block h-3 w-[7px] animate-pulse",
                    phase === "deleting" ? "bg-red-400" : "bg-green-400",
                  )}
                />
              )}
              {phase === "done"
                ? total === 0
                  ? "no changes"
                  : "· done"
                : phase === "deleting"
                  ? "deleting…"
                  : "adding…"}
            </span>

            <span className="ml-auto font-mono text-[11px] text-slate-400 tabular-nums">
              Step {Math.min(stepIdx, total)} of {total} chars
            </span>
          </div>

          {/* Playback progress */}
          <div className="h-0.5 w-full shrink-0 bg-[#21262d]">
            <div
              className="h-full bg-green-500 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
            {/* VS Code-style file tree */}
            <div className="flex max-h-[38vh] w-full shrink-0 flex-col overflow-hidden border-b border-[#30363d] bg-[#0d1117] sm:h-full sm:max-h-none sm:min-h-0 sm:w-64 sm:self-stretch sm:border-r sm:border-b-0">
              <p className="shrink-0 px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Changed files ({commit.files.length})
              </p>
              <ul className="file-scroll min-h-0 flex-1 overflow-y-auto px-0 py-1">
                {commit.files.map((f) => {
                  const active = f.path === activeFile?.path;
                  const { dir, name } = splitName(f.path);
                  const { Icon, className } = fileIconForPath(f.path);
                  return (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setActivePath(f.path)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-none border-l-2 px-3 py-[7px] text-left transition",
                          active
                            ? "border-l-green-500 bg-[#161b22]"
                            : "border-l-transparent hover:bg-[#161b22]",
                        )}
                        aria-current={active}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", className)} />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[13px] text-slate-200">
                            {name}
                          </span>
                          {dir && (
                            <span className="block truncate font-mono text-[10px] text-slate-500">
                              {dir}
                            </span>
                          )}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          <span className="rounded-full bg-green-500/15 px-1.5 py-px font-mono text-[10px] font-semibold text-green-300 ring-1 ring-green-500/30 tabular-nums">
                            +{f.additions}
                          </span>
                          <span className="rounded-full bg-red-500/15 px-1.5 py-px font-mono text-[10px] font-semibold text-red-300 ring-1 ring-red-500/30 tabular-nums">
                            -{f.deletions}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Unified editor view */}
            <div className="flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden bg-[#0d1117] sm:min-h-0">
              {isLoadingFiles && !activeFile ? (
                <p
                  role="status"
                  className="flex items-center gap-2 p-6 text-sm text-slate-500"
                >
                  <LoaderCircle className="h-4 w-4 animate-spin text-green-400" />
                  Loading file diff from backend…
                </p>
              ) : activeFile ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <DiffEditor
                    key={`${commit.id}:${activeFile.path}`}
                    height="100%"
                    language={activeFile.language}
                    theme="vs-dark"
                    original={original}
                    modified={animatedModified}
                    onMount={handleDiffMount}
                    options={{
                      readOnly: true,
                      renderSideBySide: false,
                      originalEditable: false,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                    }}
                  />
                </div>
              ) : (
                <p className="p-6 text-sm text-slate-500">
                  {commit.files.length === 0 && !isLoadingFiles
                    ? "No text changes in this commit."
                    : "No file selected."}
                </p>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
