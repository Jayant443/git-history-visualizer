import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  LoaderCircle,
  Search,
  Users,
} from "lucide-react";
import { Navbar } from "./components/Navbar";
import { CommitHeatmap } from "./components/CommitHeatmap";
import { CommitGraph } from "./components/CommitGraph";
import { DiffViewer } from "./components/DiffViewer";
import type { FileChange, HeatmapDay, MockCommit } from "./types";
import {
  api,
  type CommitDiff,
  type CommitRead,
  type FileContent,
  type RepositoryRead,
  type RepositoryStats,
} from "./services/api";

const AUTHOR_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"];

function authorColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return AUTHOR_COLORS[hash % AUTHOR_COLORS.length];
}

function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mts":
    case "cts":
      return "typescript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    case "md":
    case "markdown":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

function handleForAuthor(name: string, email: string): string {
  const local = email.split("@")[0] || name;
  const compact = local.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `@${compact || "author"}`;
}

/** Adapt a backend `CommitRead` to the graph's `MockCommit` view model. */
function adaptCommit(commit: CommitRead, defaultBranch: string): MockCommit {
  const name = commit.author?.name ?? commit.committer?.name ?? "Unknown";
  const email = commit.author?.email ?? commit.committer?.email ?? "unknown";
  const fallback = defaultBranch || "main";
  const branches = commit.branches.length > 0 ? commit.branches : [fallback];
  return {
    id: commit.sha,
    short: commit.short_sha,
    message: commit.message,
    author: {
      name,
      handle: handleForAuthor(name, email),
      color: authorColor(email),
    },
    date: commit.committed_at,
    branch: branches[0],
    branches,
    parents: commit.parent_shas,
    isMerge: commit.is_merge,
    files: [],
  };
}

/** Adapt backend `FileContent` rows to Monaco/CodePlayback file models. */
function adaptFiles(files: FileContent[]): FileChange[] {
  return files
    .filter((f) => !f.binary)
    .slice(0, 50)
    .map((f) => {
      const modified = f.content ?? "";
      const patchLines = modified === "" ? [] : modified.split("\n");
      return {
        path: f.path,
        additions: patchLines.length,
        deletions: 0,
        language: languageForPath(f.path),
        original: "",
        modified,
        rawContent: modified,
        patchLines,
      };
    });
}

/** Adapt the real `CommitDiff` payload: true parent content + true counts. */
function adaptDiffFiles(diff: CommitDiff): FileChange[] {
  return diff.files
    .filter((f) => !f.binary)
    .slice(0, 50)
    .map((f) => {
      const original = f.original ?? "";
      const modified = f.modified ?? "";
      const patchLines = modified === "" ? [] : modified.split("\n");
      return {
        path: f.path,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        language: languageForPath(f.path),
        original,
        modified,
        rawContent: modified,
        patchLines,
      };
    });
}

function buildHeatmapFromCommits(commits: CommitRead[]): HeatmapDay[] {
  const counts = new Map<string, { count: number; authors: Set<string> }>();
  for (const c of commits) {
    const day = c.committed_at.slice(0, 10);
    if (!day) continue;
    const entry = counts.get(day) ?? { count: 0, authors: new Set<string>() };
    entry.count += 1;
    const email = c.author?.email ?? c.committer?.email;
    if (email) entry.authors.add(handleForAuthor("", email));
    counts.set(day, entry);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, count: v.count, authors: [...v.authors] }));
}

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [repository, setRepository] = useState<RepositoryRead | null>(null);
  const [backendCommits, setBackendCommits] = useState<CommitRead[]>([]);
  const [repoStats, setRepoStats] = useState<RepositoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MockCommit | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  const isLive = backendCommits.length > 0;
  const defaultBranch = repository?.default_branch ?? "main";
  // Total known from full-history stats; the button hides once everything
  // loaded is everything there is.
  const canExpand =
    isLive && repoStats !== null && backendCommits.length < repoStats.total;

  // Fetch live file content for the selected commit (Monaco / playback).
  useEffect(() => {
    if (!selected) {
      setSelectedFiles([]);
      return;
    }
    // Loaded commits carry no file content; fetch it per selection.
    if (!isLive || selected.files.length > 0) {
      setSelectedFiles(selected.files);
      return;
    }
    let cancelled = false;
    const sha = selected.id;
    async function loadFiles() {
      setFilesLoading(true);
      // Drop the previous commit's files so the panel shows its loading
      // state instead of briefly flashing stale content.
      setSelectedFiles([]);
      try {
        const repoId = repository?.id ?? backendCommits[0]?.repository_id;
        if (repoId === undefined) return;
        // Real diff pipeline: parent content + modified content + true counts.
        try {
          const diff = await api.getCommitDiff(repoId, sha);
          if (!cancelled) setSelectedFiles(adaptDiffFiles(diff));
        } catch {
          // Fallback for older backends: full-file snapshot at this commit.
          const files = await api.getCommitFiles(repoId, sha);
          if (!cancelled) setSelectedFiles(adaptFiles(files));
        }
      } catch {
        if (!cancelled) setSelectedFiles([]);
      } finally {
        if (!cancelled) setFilesLoading(false);
      }
    }
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [selected, isLive, repository?.id, backendCommits]);

  // Refetch full-history stats when the branch filter changes (scoped).
  useEffect(() => {
    if (!isLive || repository === null) return;
    let cancelled = false;
    const scope = branch === "all" ? undefined : branch;
    api
      .getRepositoryStats(repository.id, scope)
      .then((stats) => {
        if (!cancelled) setRepoStats(stats);
      })
      .catch(() => {
        // Keep the previous scope's stats rather than blanking the cards.
      });
    return () => {
      cancelled = true;
    };
  }, [branch, isLive, repository]);

  const commits: MockCommit[] = useMemo(() => {
    if (!isLive) return [];
    return backendCommits.map((c) => adaptCommit(c, defaultBranch));
  }, [backendCommits, defaultBranch, isLive]);

  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    for (const c of commits) {
      for (const b of c.branches ?? [c.branch]) set.add(b);
    }
    return [...set].sort();
  }, [commits]);

  const filteredCommits = useMemo(
    () =>
      branch === "all"
        ? commits
        : commits.filter((c) => (c.branches ?? [c.branch]).includes(branch)),
    [branch, commits],
  );

  const heatmapDays: HeatmapDay[] = useMemo(() => {
    // Full-history stats when available (covers not-yet-loaded pages);
    // otherwise fall back to the loaded commits.
    if (repoStats) {
      return repoStats.days.map((d) => ({
        date: d.date,
        count: d.count,
        authors: d.authors.map((email) => handleForAuthor("", email)),
      }));
    }
    if (!isLive) return [];
    return buildHeatmapFromCommits(backendCommits);
  }, [backendCommits, isLive, repoStats]);

  const stats = useMemo(() => {
    if (isLive && repoStats) {
      return [
        { label: "Commits", value: repoStats.total, icon: GitCommitHorizontal },
        { label: "Contributors", value: repoStats.contributors, icon: Users },
        { label: "Merges", value: repoStats.merges, icon: GitFork },
        { label: "Active days", value: repoStats.active_days, icon: Activity },
      ];
    }
    const authors = new Set(filteredCommits.map((c) => c.author.handle));
    const merges = filteredCommits.filter((c) => c.isMerge).length;
    return [
      {
        label: "Commits",
        value: filteredCommits.length,
        icon: GitCommitHorizontal,
      },
      { label: "Contributors", value: authors.size, icon: Users },
      { label: "Merges", value: merges, icon: GitFork },
      {
        label: "Active days",
        value: heatmapDays.filter((d) => d.count > 0).length,
        icon: Activity,
      },
    ];
  }, [filteredCommits, heatmapDays, isLive, repoStats]);

  /** Enriched selection: live backend file content fed into Monaco/playback. */
  const enrichedSelected: MockCommit | null = useMemo(() => {
    if (!selected) return null;
    if (selected.files.length > 0) return selected;
    if (selectedFiles.length === 0) return selected;
    return { ...selected, files: selectedFiles };
  }, [selected, selectedFiles]);

  async function handleVisualize() {
    if (!repoUrl.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      // Clone (or re-ingest) by URL, then load metadata + commit history.
      const repo = await api.cloneRepository(repoUrl.trim());
      const [details, commits] = await Promise.all([
        api.getRepository(repo.id),
        api.getAllCommits(repo.id),
      ]);
      setRepository(details);
      setBackendCommits(commits);
      setRepoStats(await api.getRepositoryStats(repo.id).catch(() => null));
      // Auto-open the first (oldest) commit so the editor starts playing.
      const firstBranch = details.default_branch ?? "main";
      const adapted = commits.map((c) => adaptCommit(c, firstBranch));
      setSelected(adapted[0] ?? null);
      setBranch("all");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to visualize repository",
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Paged loading — fetch the next page (metadata + branches; file content
  // loads on demand per commit) and append it at the end of the graph.
  // Triggered by infinite scroll (or the fallback button); the guards make
  // overlapping scroll events harmless.
  async function handleRequestMore() {
    if (!isLive || repository === null || isExpanding || !canExpand) return;
    setIsExpanding(true);
    try {
      const page = await api.getNextCommits(
        repository.id,
        backendCommits.length,
        50,
        false,
      );
      setBackendCommits((prev) => {
        const seen = new Set(prev.map((c) => c.sha));
        const fresh = page.commits.filter((c) => !seen.has(c.sha));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more commits");
    } finally {
      setIsExpanding(false);
    }
  }

  // Landing: no repo loaded yet (fresh reload shows this, never mock data
  // or a previously visualized repository).
  if (repository === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#010409] px-4 text-slate-200 antialiased">
        <div className="w-full max-w-xl rounded-2xl border border-[#30363d] bg-[#0d1117] p-6 shadow-2xl shadow-black/60 sm:p-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl ring-1 ring-green-500/30">
              <img
                src="/logo.jpeg"
                alt="Logo"
                // Changes are here: h-full w-full and object-cover
                className="h-full w-full object-cover"
              />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-100">
                Git Wiz
              </p>
              <p className="text-xs text-slate-500">Git Commit Visualizer</p>
            </div>
          </div>

          <label className="relative mt-6 block">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleVisualize();
              }}
              placeholder="https://github.com/owner/repo"
              spellCheck={false}
              className="w-full rounded-full border border-[#30363d] bg-[#161b22] py-2 pr-4 pl-10 text-sm text-slate-200 placeholder:text-slate-600 focus:border-green-500/60 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleVisualize()}
            disabled={isLoading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-green-400 disabled:cursor-wait disabled:opacity-70"
          >
            {isLoading && (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-label="Loading"
              />
            )}
            {isLoading ? "Visualizing…" : "Visualize Repo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        selected !== null
          ? // Editor open: viewport-filling focus view (navbar + graph + editor).
            "flex h-dvh flex-col overflow-hidden bg-[#010409] text-slate-200 antialiased"
          : "min-h-screen bg-[#010409] text-slate-200 antialiased"
      }
    >
      <Navbar
        repoUrl={repoUrl}
        branch={branch}
        branches={availableBranches}
        isLoading={isLoading}
        onRepoUrlChange={setRepoUrl}
        onBranchChange={setBranch}
        onVisualize={() => void handleVisualize()}
      />

      <main
        className={
          selected !== null
            ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-3 sm:px-6"
            : "mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6"
        }
      >
        {error && (
          <p
            role="alert"
            className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
          >
            Backend error: {error} — is FastAPI running on
            http://localhost:8000?
          </p>
        )}
        {repository && selected === null && (
          <p className="truncate text-xs text-slate-500">
            <span className="font-semibold text-slate-300">
              {repository.name}
            </span>
            {" · "}
            {repository.status}
            {" · "}
            {isLive && repoStats
              ? repoStats.total
              : repository.commit_count}{" "}
            commits
          </p>
        )}

        {selected === null && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <s.icon className="h-3.5 w-3.5 text-green-400" />
                    {s.label}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-slate-50 tabular-nums">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            <CommitHeatmap days={heatmapDays} />
          </>
        )}

        <div
          className={
            selected !== null
              ? "flex min-h-0 flex-1 flex-col"
              : "flex max-h-[72dvh] min-h-[420px] min-w-0 flex-col"
          }
        >
          <CommitGraph
            commits={filteredCommits}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            expand={
              isLive && repoStats
                ? {
                    canExpand,
                    isExpanding,
                    loaded: backendCommits.length,
                    total: repoStats.total,
                    onRequestMore: () => void handleRequestMore(),
                  }
                : undefined
            }
          />
        </div>
      </main>

      <DiffViewer
        key={selected?.id ?? "none"}
        commit={enrichedSelected}
        isLoadingFiles={filesLoading}
        onClose={() => setSelected(null)}
        onNextCommit={(() => {
          if (!selected) return null;
          const idx = filteredCommits.findIndex((c) => c.id === selected.id);
          if (idx < 0 || idx >= filteredCommits.length - 1) return null;
          const next = filteredCommits[idx + 1];
          return () => setSelected(next);
        })()}
      />
    </div>
  );
}
