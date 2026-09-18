import { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, FileDiff, GitCompareArrows, X } from "lucide-react";
import type { MockCommit } from "../data/mockData";
import { cn } from "../lib/cn";
import { CodePlayback } from "./CodePlayback";

interface DiffViewerProps {
  commit: MockCommit | null;
  onClose: () => void;
}

type ViewMode = "playback" | "diff";

export function DiffViewer({ commit, onClose }: DiffViewerProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("playback");

  // Remounted per commit via `key` in App, so initial state is the reset path.
  const activeFile =
    commit?.files.find((f) => f.path === activePath) ?? commit?.files[0] ?? null;

  return (
    <AnimatePresence>
      {commit && (
        <motion.aside
          key={commit.id}
          initial={{ x: 480, opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 480, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="fixed top-0 right-0 z-40 flex h-full w-full max-w-4xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl shadow-black/70"
          role="dialog"
          aria-label={`Diff for ${commit.short}`}
        >
          <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
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
              className="ml-auto rounded-md border border-slate-700 p-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-100"
              aria-label="Close diff view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2">
            <div
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-0.5"
              role="tablist"
              aria-label="Code view mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "playback"}
                onClick={() => setMode("playback")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  mode === "playback"
                    ? "bg-green-500/15 text-green-300 ring-1 ring-green-500/40"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Playback
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "diff"}
                onClick={() => setMode("diff")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  mode === "diff"
                    ? "bg-green-500/15 text-green-300 ring-1 ring-green-500/40"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                Diff
              </button>
            </div>
            {activeFile && mode === "playback" && (
              <span className="ml-auto hidden font-mono text-[11px] text-slate-500 sm:block">
                streaming {activeFile.patchLines.length} lines
              </span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div className="w-full shrink-0 border-b border-slate-800 sm:w-64 sm:border-r sm:border-b-0">
              <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Changed files ({commit.files.length})
              </p>
              <ul className="max-h-40 overflow-auto p-2 sm:max-h-none">
                {commit.files.map((f) => {
                  const active = f.path === activeFile?.path;
                  return (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setActivePath(f.path)}
                        className={cn(
                          "w-full rounded-lg border px-2.5 py-2 text-left transition",
                          active
                            ? "border-green-500/50 bg-green-500/10"
                            : "border-transparent hover:border-slate-700 hover:bg-slate-900",
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                          <FileDiff className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span className="truncate font-mono">{f.path}</span>
                        </span>
                        <span className="mt-1 block font-mono text-[11px]">
                          <span className="text-green-400">+{f.additions}</span>{" "}
                          <span className="text-red-400">-{f.deletions}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex min-h-[300px] min-w-0 flex-1 flex-col bg-[#1e1e1e]">
              {activeFile ? (
                mode === "playback" ? (
                  <CodePlayback
                    key={`${commit.id}:${activeFile.path}`}
                    file={activeFile}
                  />
                ) : (
                  <DiffEditor
                    key={activeFile.path}
                    height="100%"
                    language={activeFile.language}
                    theme="vs-dark"
                    original={activeFile.original}
                    modified={activeFile.modified}
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                    }}
                  />
                )
              ) : (
                <p className="p-6 text-sm text-slate-500">No file selected.</p>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
