export interface MockAuthor {
  name: string;
  handle: string;
  color: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  language: string;
  original: string;
  modified: string;
  /** Full evolved file content — streamed line-by-line in playback mode. */
  rawContent: string;
  /** Individual lines of `rawContent` — the playback unit. */
  patchLines: string[];
}

export interface MockCommit {
  id: string;
  short: string;
  message: string;
  author: MockAuthor;
  date: string;
  branch: string;
  parents: string[];
  isMerge?: boolean;
  files: FileChange[];
}

export interface HeatmapDay {
  date: string;
  count: number;
  authors: string[];
}

export const BRANCHES = ["main", "feature/auth", "feature/ui-redesign"] as const;

export const BRANCH_COLORS: Record<string, string> = {
  main: "#22c55e",
  "feature/auth": "#3b82f6",
  "feature/ui-redesign": "#a855f7",
};

const A = {
  maya: { name: "Maya Chen", handle: "@mayachen", color: "#22c55e" },
  leo: { name: "Leo Park", handle: "@leopark", color: "#3b82f6" },
  priya: { name: "Priya Nair", handle: "@priyanair", color: "#a855f7" },
  sam: { name: "Sam Ortiz", handle: "@samortiz", color: "#f59e0b" },
} satisfies Record<string, MockAuthor>;

const appTsxBefore = `import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <main className="p-8">
      <h1>Dashboard</h1>
      <button onClick={() => setCount(count + 1)}>
        Count is {count}
      </button>
    </main>
  )
}
`;

const appTsxAfter = `import { useState, useMemo } from 'react'
import { CommitGraph } from './components/CommitGraph'

export default function App() {
  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count * 2, [count])
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <CommitGraph zoom={1} />
      <button
        onClick={() => setCount((c) => c + 1)}
        className="mt-4 rounded-lg bg-green-500 px-4 py-2 font-medium text-slate-950"
      >
        Count is {count} (x2 = {doubled})
      </button>
    </main>
  )
}
`;

const authBefore = `export function getSession() {
  return localStorage.getItem('session')
}
`;

const authAfter = `import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(import.meta.env.VITE_JWT_SECRET)

export async function getSession(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload
  } catch {
    localStorage.removeItem('session')
    return null
  }
}

export function signOut() {
  localStorage.removeItem('session')
  window.location.href = '/login'
}
`;

type FileSeed = Omit<FileChange, "rawContent" | "patchLines">;
type CommitSeed = Omit<MockCommit, "files"> & { files: FileSeed[] };

const MOCK_COMMITS_SEED: CommitSeed[] = [
  {
    id: "a1b2c3d4e5f60000000000000000000000000001",
    short: "a1b2c3d",
    message: "feat: bootstrap visualizer dashboard shell",
    author: A.maya,
    date: "2026-09-02T09:12:00Z",
    branch: "main",
    parents: [],
    files: [
      {
        path: "src/App.tsx",
        additions: 12,
        deletions: 4,
        language: "typescript",
        original: appTsxBefore,
        modified: appTsxAfter,
      },
      {
        path: "package.json",
        additions: 3,
        deletions: 1,
        language: "json",
        original: `{\n  "name": "client",\n  "version": "0.0.0"\n}`,
        modified: `{\n  "name": "client",\n  "version": "0.1.0",\n  "dependencies": {\n    "@monaco-editor/react": "^4.7.0"\n  }\n}`,
      },
    ],
  },
  {
    id: "b2c3d4e5f6000000000000000000000000000002",
    short: "b2c3d4e",
    message: "feat(auth): add JWT session helpers",
    author: A.leo,
    date: "2026-09-03T14:40:00Z",
    branch: "feature/auth",
    parents: ["a1b2c3d4e5f60000000000000000000000000001"],
    files: [
      {
        path: "src/lib/auth.ts",
        additions: 18,
        deletions: 3,
        language: "typescript",
        original: authBefore,
        modified: authAfter,
      },
    ],
  },
  {
    id: "c3d4e5f600000000000000000000000000000003",
    short: "c3d4e5f",
    message: "fix: harden empty-state for heatmap grid",
    author: A.maya,
    date: "2026-09-04T10:05:00Z",
    branch: "main",
    parents: ["a1b2c3d4e5f60000000000000000000000000001"],
    files: [
      {
        path: "src/components/CommitHeatmap.tsx",
        additions: 22,
        deletions: 6,
        language: "typescript",
        original: `export function CommitHeatmap({ days }: { days: number[] }) {\n  return <div>{days.length}</div>\n}`,
        modified: `export function CommitHeatmap({ days }: { days: number[] }) {\n  if (days.length === 0) return <p>No activity yet</p>\n  return (\n    <div className="grid">\n      {days.map((d, i) => (\n        <span key={i} data-count={d} />\n      ))}\n    </div>\n  )\n}`,
      },
    ],
  },
  {
    id: "d4e5f60000000000000000000000000000000004",
    short: "d4e5f60",
    message: "feat(auth): login form with validation",
    author: A.leo,
    date: "2026-09-05T16:22:00Z",
    branch: "feature/auth",
    parents: ["b2c3d4e5f6000000000000000000000000000002"],
    files: [
      {
        path: "src/components/LoginForm.tsx",
        additions: 45,
        deletions: 2,
        language: "typescript",
        original: `export function LoginForm() {\n  return <form />\n}`,
        modified: `import { useState } from 'react'\n\nexport function LoginForm() {\n  const [email, setEmail] = useState('')\n  const [error, setError] = useState<string | null>(null)\n\n  function submit(e: React.FormEvent) {\n    e.preventDefault()\n    if (!email.includes('@')) {\n      setError('Enter a valid email')\n      return\n    }\n    setError(null)\n  }\n\n  return (\n    <form onSubmit={submit}>\n      <input value={email} onChange={(e) => setEmail(e.target.value)} />\n      {error && <p>{error}</p>}\n    </form>\n  )\n}`,
      },
    ],
  },
  {
    id: "e5f6000000000000000000000000000000000005",
    short: "e5f6000",
    message: "feat(ui): dark theme tokens + slate palette",
    author: A.priya,
    date: "2026-09-06T11:48:00Z",
    branch: "feature/ui-redesign",
    parents: ["c3d4e5f600000000000000000000000000000003"],
    files: [
      {
        path: "src/index.css",
        additions: 14,
        deletions: 1,
        language: "css",
        original: `@import "tailwindcss";`,
        modified: `@import "tailwindcss";\n\n@theme {\n  --color-accent: #22c55e;\n  --color-surface: #0f172a;\n}\n\nbody {\n  background: #020617;\n  color: #e2e8f0;\n}`,
      },
    ],
  },
  {
    id: "f600000000000000000000000000000000000006",
    short: "f600000",
    message: "feat(heatmap): interactive day cells + hover cards",
    author: A.maya,
    date: "2026-09-08T09:30:00Z",
    branch: "main",
    parents: ["c3d4e5f600000000000000000000000000000003"],
    files: [
      {
        path: "src/components/CommitHeatmap.tsx",
        additions: 60,
        deletions: 8,
        language: "typescript",
        original: `// basic grid`,
        modified: `// animated hover cards with framer-motion\n// + intensity scale mapped to commit counts`,
      },
      {
        path: "src/data/mockData.ts",
        additions: 30,
        deletions: 0,
        language: "typescript",
        original: `export const x = 1`,
        modified: `export const HEATMAP = generateHeatmap()\n// 140 days, weighted toward weekdays`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000007",
    short: "9a8b7c6",
    message: "feat(ui): commit node hover cards",
    author: A.priya,
    date: "2026-09-09T15:10:00Z",
    branch: "feature/ui-redesign",
    parents: ["e5f6000000000000000000000000000000000005"],
    files: [
      {
        path: "src/components/CommitGraph.tsx",
        additions: 52,
        deletions: 5,
        language: "typescript",
        original: `// static nodes`,
        modified: `// floating detail card: avatar, hash, date, message\n// framer-motion spring on hover`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000008",
    short: "7d6e5f4",
    message: "feat(auth): OAuth callback route",
    author: A.sam,
    date: "2026-09-10T13:02:00Z",
    branch: "feature/auth",
    parents: ["d4e5f60000000000000000000000000000000004"],
    files: [
      {
        path: "src/routes/callback.tsx",
        additions: 38,
        deletions: 0,
        language: "typescript",
        original: ``,
        modified: `export async function loader({ request }: { request: Request }) {\n  const url = new URL(request.url)\n  const code = url.searchParams.get('code')\n  if (!code) throw new Response('Missing code', { status: 400 })\n  return { code }\n}`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000009",
    short: "5c4b3a2",
    message: "Merge branch 'feature/auth' into main",
    author: A.maya,
    date: "2026-09-11T10:44:00Z",
    branch: "main",
    parents: [
      "f600000000000000000000000000000000000006",
      "0000000000000000000000000000000000000008",
    ],
    isMerge: true,
    files: [
      {
        path: "package.json",
        additions: 2,
        deletions: 0,
        language: "json",
        original: `{ "version": "0.1.0" }`,
        modified: `{ "version": "0.2.0", "auth": true }`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000010",
    short: "3e2d1c0",
    message: "feat(graph): DAG edges + lane layout",
    author: A.sam,
    date: "2026-09-12T09:18:00Z",
    branch: "main",
    parents: ["0000000000000000000000000000000000000009"],
    files: [
      {
        path: "src/components/CommitGraph.tsx",
        additions: 80,
        deletions: 12,
        language: "typescript",
        original: `// flat list`,
        modified: `// lane assignment per branch\n// SVG bezier edges for parents + merges`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000011",
    short: "1a2b3c4",
    message: "feat(ui): DiffEditor side-by-side view",
    author: A.priya,
    date: "2026-09-13T17:55:00Z",
    branch: "feature/ui-redesign",
    parents: ["0000000000000000000000000000000000000007"],
    files: [
      {
        path: "src/components/DiffViewer.tsx",
        additions: 95,
        deletions: 4,
        language: "typescript",
        original: `// placeholder panel`,
        modified: `// @monaco-editor/react DiffEditor\n// theme vs-dark, file sidebar +/− indicators`,
      },
      {
        path: "src/App.tsx",
        additions: 12,
        deletions: 4,
        language: "typescript",
        original: appTsxBefore,
        modified: appTsxAfter,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000012",
    short: "8f7e6d5",
    message: "fix(graph): contain large histories with zoom",
    author: A.sam,
    date: "2026-09-15T12:26:00Z",
    branch: "main",
    parents: ["0000000000000000000000000000000000000010"],
    files: [
      {
        path: "src/components/CommitGraph.tsx",
        additions: 25,
        deletions: 7,
        language: "typescript",
        original: `// overflow visible`,
        modified: `// overflow-auto both axes\n// zoom 0.6x – 1.5x + reset`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000013",
    short: "6d5c4b3",
    message: "Merge branch 'feature/ui-redesign' into main",
    author: A.maya,
    date: "2026-09-16T18:03:00Z",
    branch: "main",
    parents: [
      "0000000000000000000000000000000000000012",
      "0000000000000000000000000000000000000011",
    ],
    isMerge: true,
    files: [
      {
        path: "src/index.css",
        additions: 6,
        deletions: 2,
        language: "css",
        original: `body { background: #020617; }`,
        modified: `body { background: #020617; }\n.graph-scroll { scrollbar-gutter: stable; }`,
      },
    ],
  },
  {
    id: "0000000000000000000000000000000000000014",
    short: "4c3b2a1",
    message: "chore: polish empty + loading states",
    author: A.leo,
    date: "2026-09-17T08:57:00Z",
    branch: "main",
    parents: ["0000000000000000000000000000000000000013"],
    files: [
      {
        path: "src/components/Navbar.tsx",
        additions: 15,
        deletions: 3,
        language: "typescript",
        original: `// plain header`,
        modified: `// repo input + branch filter + visualize button`,
      },
    ],
  },
];

// Playback source: the evolved file is the `modified` snapshot, split into lines.
// Every exported record therefore carries `rawContent` / `patchLines`.
export const MOCK_COMMITS: MockCommit[] = MOCK_COMMITS_SEED.map((commit) => ({
  ...commit,
  files: commit.files.map((file) => ({
    ...file,
    rawContent: file.modified,
    patchLines: file.modified.split("\n"),
  })),
}));

function seededCounts(): number[] {
  // Deterministic pseudo-random activity for ~140 days
  const out: number[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 140; i++) {
    const weekday = i % 7;
    const weekend = weekday === 5 || weekday === 6;
    const base = weekend ? 1.2 : 4;
    out.push(Math.max(0, Math.round(rand() * base + (i % 11 === 0 ? 5 : 0))));
  }
  return out;
}

const HANDLE_POOL = ["@mayachen", "@leopark", "@priyanair", "@samortiz"];

export function buildHeatmap(): HeatmapDay[] {
  const counts = seededCounts();
  const today = new Date("2026-09-18T00:00:00Z").getTime();
  return counts.map((count, i) => {
    const t = new Date(today - (counts.length - 1 - i) * 86_400_000);
    const authors =
      count === 0
        ? []
        : Array.from(
            new Set(
              Array.from({ length: Math.min(count, 3) }, (_, k) => HANDLE_POOL[(i + k) % HANDLE_POOL.length]),
            ),
          );
    return {
      date: t.toISOString().slice(0, 10),
      count,
      authors,
    };
  });
}

export const MOCK_HEATMAP: HeatmapDay[] = buildHeatmap();
