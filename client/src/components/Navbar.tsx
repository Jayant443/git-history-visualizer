import { GitBranch, LoaderCircle, Search, Sparkles } from "lucide-react";
import { BRANCHES } from "../data/mockData";

interface NavbarProps {
  repoUrl: string;
  branch: string;
  branches?: string[];
  isLoading: boolean;
  onRepoUrlChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onVisualize: () => void;
}

export function Navbar({
  repoUrl,
  branch,
  branches = [...BRANCHES],
  isLoading,
  onRepoUrlChange,
  onBranchChange,
  onVisualize,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#30363d] bg-[#0d1117]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 text-green-400 ring-1 ring-green-500/30">
            <GitBranch className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-slate-100">
              CommitScope
            </p>
            <p className="text-xs text-slate-500">Git Commit Visualizer</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={repoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onVisualize();
              }}
              placeholder="https://github.com/acme/visualizer"
              spellCheck={false}
              className="w-full rounded-full border border-[#30363d] bg-[#161b22] py-2 pr-4 pl-10 text-sm text-slate-200 placeholder:text-slate-600 focus:border-green-500/60 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-full border border-[#30363d] bg-[#161b22] px-4 py-2">
            <GitBranch className="h-4 w-4 shrink-0 text-slate-500" />
            <select
              value={branch}
              onChange={(e) => onBranchChange(e.target.value)}
              className="bg-transparent text-sm text-slate-200 focus:outline-none"
              aria-label="Branch filter"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onVisualize}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-green-400 disabled:cursor-wait disabled:opacity-70"
          >
            {isLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Loading" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isLoading ? "Visualizing…" : "Visualize Repo"}
          </button>
        </div>
      </div>
    </header>
  );
}
