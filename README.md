<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>

<h1>Git Wiz — Git Commit Visualizer</h1>

<h2>1. Description</h2>
<p>
  Git Wiz is a web app that turns any public Git repository into an interactive visual history.<br />
  Paste a repo URL and it clones the repo on the backend, parses its commits, branches and diffs, and stores them in PostgreSQL.<br />
  The frontend then shows commit stats, an activity heatmap, a branch-aware commit graph, and a Monaco-based diff viewer with line-by-line playback.
</p>

<div class="screenshot"><img src="docs/images/image1.png"></img></div>

<h2>2. Technologies Used</h2>

<h3>Frontend (<code>client/</code>)</h3>
<table>
  <tr><th>Technology</th><th>Purpose</th></tr>
  <tr><td>React 19 + TypeScript</td><td>UI, typed view-models (<code>src/types.ts</code>, <code>src/App.tsx</code>)</td></tr>
  <tr><td>Vite 8</td><td>Dev server, build, HMR</td></tr>
  <tr><td>Tailwind CSS v4 (+ Vite plugin)</td><td>Styling (via <code>@import "tailwindcss"</code> in <code>src/index.css</code>, no config file)</td></tr>
  <tr><td>@monaco-editor/react</td><td>Code / diff editor in <code>DiffViewer.tsx</code></td></tr>
  <tr><td>framer-motion</td><td>Animations</td></tr>
  <tr><td>lucide-react</td><td>Icons (commits, contributors, merges, search, loader)</td></tr>
  <tr><td>clsx + tailwind-merge</td><td>Conditional class merging (<code>src/lib/cn.ts</code>)</td></tr>
</table>

<h3>Backend (<code>server/</code>)</h3>
<table>
  <tr><th>Technology</th><th>Purpose</th></tr>
  <tr><td>FastAPI + Uvicorn</td><td>REST API (<code>src/main.py</code>, routers in <code>src/api/</code>)</td></tr>
  <tr><td>SQLModel + asyncpg</td><td>Async ORM over PostgreSQL (models in <code>src/models/</code>)</td></tr>
  <tr><td>PostgreSQL</td><td>Stores repositories, commits, authors, branches, tags, file changes</td></tr>
  <tr><td>Pydantic / pydantic-settings</td><td>Request/response schemas (<code>src/schemas/</code>) and env config (<code>src/core/config.py</code>)</td></tr>
  <tr><td>Git CLI (via subprocess)</td><td>Clone, log parsing, diffs, refs — wrappers in <code>src/git/</code> (<code>repository.py</code>, <code>commits.py</code>, <code>diff.py</code>, <code>refs.py</code>, <code>stats.py</code>)</td></tr>
  <tr><td>uv</td><td>Python package / environment manager (<code>pyproject.toml</code>, <code>uv.lock</code>, <code>.python-version</code>)</td></tr>
</table>

<div class="screenshot"><img src="docs/images/image2.png"></img></div>

<!-- ==================== 3. WORKFLOW ==================== -->
<h2>3. Workflow</h2>
<ol>
  <li><strong>Submit URL:</strong> The user pastes a repo URL (e.g. <code>https://github.com/owner/repo</code>) on the landing page and clicks <em>Visualize Repo</em>. The frontend calls <code>POST /repositories/clone</code>.</li>
  <li><strong>Clone + ingest:</strong> The backend (<code>ingest_service.ingest_repository</code>) normalizes the URL, reuses the existing record if already ingested, otherwise clones it with Git into <code>REPOSITORY_ROOT</code>, detects the default branch, and marks the repo as <code>cloning</code>.</li>
  <li><strong>Parse + persist:</strong> It parses the first 50 commits (<code>parse_git_commits</code>), clears old rows, persists commits/authors/parents, then persists branches and tags (<code>list_branches</code>, <code>list_tags</code>), and marks the repo <code>ready</code>. Full history is counted directly from git.</li>
  <li><strong>Overview render:</strong> The frontend fetches repo details, the full commit list (<code>GET /repositories/{id}/commits/all</code>) and aggregate stats (<code>GET /repositories/{id}/stats</code>), then renders stat cards (commits, contributors, merges, active days), the activity heatmap (<code>CommitHeatmap.tsx</code>), and the commit graph (<code>CommitGraph.tsx</code>) with a branch filter.</li>
  <li><strong>Lazy backfill:</strong> If the repo has more commits than loaded, infinite scroll (or the fallback button) calls <code>GET /repositories/{id}/commits/next?skip=&amp;limit=</code>, which ingests the next page from git into Postgres on demand and appends it to the graph.</li>
  <li><strong>Inspect a commit:</strong> Clicking a commit opens <code>DiffViewer.tsx</code>. The frontend requests the true parent-to-target diff (<code>GET /repositories/{id}/commits/{sha}/diff</code>, falling back to <code>/files</code>), showing per-file additions/deletions, the Monaco diff, and line-by-line playback of the evolved file content.</li>
</ol>

<div class="screenshot"><img src="docs/images/image3.png"></img></div>
<div class="screenshot"><img src="docs/images/image4.png"></img></div>

<h2>4. Setup Locally</h2>

<h3>Prerequisites</h3>
<ul>
  <li><strong>Node.js</strong> (18+) + npm</li>
  <li><strong>Python</strong> 3.13+ with <a href="https://docs.astral.sh/uv/">uv</a> installed</li>
  <li><strong>PostgreSQL</strong> running locally + a database created (default name in this project: <code>gitproj</code>)</li>
  <li><strong>Git</strong> CLI on PATH</li>
</ul>

<h3>Step 1 — Clone the project</h3>
<pre><code>git clone &lt;your-repo-url&gt;
cd git-history-visualizer</code></pre>

<h3>Step 2 — Configure the backend (<code>server/.env</code>)</h3>
<p>The backend reads config from <code>server/.env</code> (see <code>src/core/config.py</code>). Create/adjust it:</p>
<pre><code>DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/gitproj
REPOSITORY_ROOT=C:/path/to/.data/repos</code></pre>
<p>Notes: <code>REPOSITORY_ROOT</code> is where cloned repos are stored (relative paths resolve against the workspace root). Tables are auto-created on startup via <code>init_db()</code>.</p>

<h3>Step 3 — Start the backend</h3>
<pre><code>cd server
uv sync
uv run uvicorn src.main:app --reload --port 8000</code></pre>
<p>Verify at <code>http://localhost:8000/</code> → <code>{"message": "running"}</code>. API docs: <code>http://localhost:8000/docs</code>.</p>

<h3>Step 4 — Start the frontend</h3>
<pre><code>cd client
npm install
npm run dev</code></pre>
<p>Open <code>http://localhost:5173</code>. The frontend calls the API at same-origin by default; to point elsewhere set <code>VITE_API_URL</code>:</p>
<pre><code># client/.env
VITE_API_URL=http://localhost:8000</code></pre>
<p>CORS on the backend already allows <code>http://localhost:5173</code>, <code>http://127.0.0.1:5173</code>, <code>http://localhost:3000</code> (see <code>src/main.py</code>).</p>

<h3>Step 5 — Use it</h3>
<ol>
  <li>Make sure PostgreSQL + backend (<code>:8000</code>) + frontend (<code>:5173</code>) are all running.</li>
  <li>Paste a public repo URL and click <strong>Visualize Repo</strong>.</li>
  <li>Browse stats / heatmap / graph, filter by branch, scroll to load more, click any commit for the diff + playback.</li>
</ol>

<h3>Useful commands</h3>
<pre><code># from client/
npm run build    # typecheck (tsc -b) + production build
npm run lint     # eslint
npm run preview  # preview production build</code></pre>

</body>
</html>
