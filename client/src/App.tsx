import { useMemo, useState } from "react";
import { Activity, GitCommitHorizontal, GitFork, Users } from "lucide-react";
import { Navbar } from "./components/Navbar";
import { CommitHeatmap } from "./components/CommitHeatmap";
import { CommitGraph } from "./components/CommitGraph";
import { DiffViewer } from "./components/DiffViewer";
import { MOCK_COMMITS, MOCK_HEATMAP, type MockCommit } from "./data/mockData";

export default function App() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/acme/visualizer");
  const [branch, setBranch] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<MockCommit | null>(null);

  const commits = useMemo(
    () => (branch === "all" ? MOCK_COMMITS : MOCK_COMMITS.filter((c) => c.branch === branch)),
    [branch],
  );

  const stats = useMemo(() => {
    const authors = new Set(commits.map((c) => c.author.handle));
    const merges = commits.filter((c) => c.isMerge).length;
    return [
      { label: "Commits", value: commits.length, icon: GitCommitHorizontal },
      { label: "Contributors", value: authors.size, icon: Users },
      { label: "Merges", value: merges, icon: GitFork },
      {
        label: "Active days",
        value: MOCK_HEATMAP.filter((d) => d.count > 0).length,
        icon: Activity,
      },
    ];
  }, [commits]);

  function handleVisualize() {
    if (!repoUrl.trim() || isLoading) return;
    setIsLoading(true);
    // Mock fetch — resolves instantly from local dataset.
    window.setTimeout(() => setIsLoading(false), 700);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased">
      <Navbar
        repoUrl={repoUrl}
        branch={branch}
        isLoading={isLoading}
        onRepoUrlChange={setRepoUrl}
        onBranchChange={setBranch}
        onVisualize={handleVisualize}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
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

        <CommitHeatmap days={MOCK_HEATMAP} />

        <div className="min-h-0">
          <CommitGraph
            commits={commits}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        </div>

        <p className="pb-6 text-center text-[11px] text-slate-600">
          Mock dataset rendered locally — connect a backend to the “Visualize
          Repo” action for live histories. Click any node to play back its code
          evolution line-by-line.
        </p>
      </main>

      <DiffViewer
        key={selected?.id ?? "none"}
        commit={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
