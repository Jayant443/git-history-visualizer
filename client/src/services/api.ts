/**
 * Typed client for the local FastAPI backend (`server/src/main.py`).
 *
 * Route map discovered from `server/src/api/`:
 * - repositories router, mounted at `/repositories`
 * - commits router, mounted at `/repositories`
 *
 * Repository metadata / details:
 * - POST   /repositories/clone          { url } -> RepositoryRead
 * - POST   /repositories                { url, name, default_branch?, clone_path? } -> RepositoryRead
 * - GET    /repositories?limit&offset   -> RepositoryRead[]
 * - GET /repositories/{repository_id:int} -> RepositoryRead
 * - GET /repositories/{repository_id:int}/stats?branch= -> RepositoryStats
 *
 * Commit history / list:
 * - GET /repositories/{id}/commits?limit&offset      -> CommitRead[]
 * - GET /repositories/{id}/commits/all               -> CommitRead[]
 * - GET /repositories/{id}/commits/next?skip&limit   -> CommitRead[]
 * - GET /repositories/{id}/commits/{short_sha}       -> CommitRead
 *
 * File contents at a given commit:
 * - GET /repositories/{id}/commits/{sha}/tree  -> TreeEntry[]
 * - GET /repositories/{id}/commits/{sha}/files -> FileContent[]
 * - GET /repositories/{id}/commits/{sha}/diff  -> CommitDiff
 * - GET /repositories/{id}/blobs/{blob_sha}    -> BlobContent
 */

const API_BASE_URL = "http://localhost:8000";

export type RepoStatus = "pending" | "cloning" | "ready" | "error";

export interface RepositoryRead {
  id: number;
  url: string;
  name: string;
  default_branch: string | null;
  status: RepoStatus;
  error_message: string | null;
  clone_path: string | null;
  commit_count: number;
  created_at: string;
  updated_at: string;
}

export interface AuthorRead {
  id: number;
  name: string;
  email: string;
}

/** Mirrors `server/src/models/commit.py::CommitRead` (snake_case JSON). */
export interface CommitRead {
  id: number;
  repository_id: number;
  sequence_index: number;
  sha: string;
  short_sha: string;
  message: string;
  summary: string;
  authored_at: string;
  committed_at: string;
  is_merge: boolean;
  author: AuthorRead | null;
  committer: AuthorRead | null;
  parent_shas: string[];
  branches: string[];
}

/** Mirrors `server/src/schemas/files.py`. */
export interface TreeEntry {
  path: string;
  mode: string;
  kind: string;
  blob_sha: string;
  size: number | null;
}

export interface FileContent {
  commit_sha: string;
  path: string;
  blob_sha: string;
  size: number;
  binary: boolean;
  content: string | null;
}

export interface BlobContent {
  blob_sha: string;
  size: number;
  binary: boolean;
  content: string | null;
}

/** Mirrors `server/src/schemas/files.py::DiffFile`. */
export interface DiffFile {
  path: string;
  original: string;
  modified: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

/** Mirrors `server/src/schemas/files.py::CommitDiff`. */
export interface CommitDiff {
  sha: string;
  parent_sha: string | null;
  files: DiffFile[];
}

/** Mirrors `server/src/schemas/branches.py::CommitWithFiles`. */
export interface CommitWithFiles extends CommitRead {
  diff: CommitDiff | null;
}

/** Mirrors `server/src/schemas/branches.py::CommitPage`. */
export interface CommitPage {
  commits: CommitWithFiles[];
  total: number;
  ingested: number;
  has_more: boolean;
}

export interface CloneRepoRequest {
  url: string;
}

/** Mirrors `server/src/schemas/branches.py::StatDay`. */
export interface StatDay {
  date: string;
  count: number;
  authors: string[];
}

/** Mirrors `server/src/schemas/branches.py::RepositoryStats`. */
export interface RepositoryStats {
  total: number;
  merges: number;
  contributors: number;
  active_days: number;
  first_day: string | null;
  last_day: string | null;
  scope: string;
  days: StatDay[];
}

export interface StoreRepositoryRequest {
  url: string;
  name: string;
  default_branch?: string | null;
  clone_path?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `API ${res.status} ${init?.method ?? "GET"} ${path}: ${detail || res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

function query(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  // -- Repository metadata / details -------------------------------------

  /** POST /repositories/clone — clone + ingest a repo by URL. */
  cloneRepository: (url: string): Promise<RepositoryRead> =>
    request<RepositoryRead>("/repositories/clone", {
      method: "POST",
      body: JSON.stringify({ url } satisfies CloneRepoRequest),
    }),

  /** POST /repositories — store repository details manually. */
  storeRepository: (body: StoreRepositoryRequest): Promise<RepositoryRead> =>
    request<RepositoryRead>("/repositories", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** GET /repositories — list known repositories. */
  listRepositories: (limit = 100, offset = 0): Promise<RepositoryRead[]> =>
    request<RepositoryRead[]>(`/repositories${query({ limit, offset })}`),

  /** GET /repositories/{repository_id} — single repo metadata. */
  getRepository: (repositoryId: number): Promise<RepositoryRead> =>
    request<RepositoryRead>(`/repositories/${repositoryId}`),

  /** GET /repositories/{id}/stats — full-history aggregates (branch-aware). */
  getRepositoryStats: (
    repositoryId: number,
    branch?: string,
  ): Promise<RepositoryStats> =>
    request<RepositoryStats>(
      `/repositories/${repositoryId}/stats${query({ branch })}`,
    ),

  // -- Commit history / list ----------------------------------------------

  /** GET /repositories/{id}/commits — paginated commit list. */
  listCommits: (
    repositoryId: number,
    limit = 100,
    offset = 0,
  ): Promise<CommitRead[]> =>
    request<CommitRead[]>(
      `/repositories/${repositoryId}/commits${query({ limit, offset })}`,
    ),

  /** GET /repositories/{id}/commits/all — full commit list. */
  getAllCommits: (repositoryId: number): Promise<CommitRead[]> =>
    request<CommitRead[]>(`/repositories/${repositoryId}/commits/all`),

  /** GET /repositories/{id}/commits/next — backfilled page with file content. */
  getNextCommits: (
    repositoryId: number,
    skip = 0,
    limit = 20,
    withFiles = true,
  ): Promise<CommitPage> =>
    request<CommitPage>(
      `/repositories/${repositoryId}/commits/next${query({ skip, limit, with_files: withFiles })}`,
    ),

  /** GET /repositories/{id}/commits/{short_sha} — single commit. */
  getCommitByShortSha: (
    repositoryId: number,
    shortSha: string,
  ): Promise<CommitRead> =>
    request<CommitRead>(
      `/repositories/${repositoryId}/commits/${encodeURIComponent(shortSha)}`,
    ),

  // -- File contents at a given commit -------------------------------------

  /** GET /repositories/{id}/commits/{sha}/tree — file tree at commit. */
  getCommitTree: (repositoryId: number, sha: string): Promise<TreeEntry[]> =>
    request<TreeEntry[]>(
      `/repositories/${repositoryId}/commits/${encodeURIComponent(sha)}/tree`,
    ),

  /** GET /repositories/{id}/commits/{sha}/files — all file contents at commit. */
  getCommitFiles: (repositoryId: number, sha: string): Promise<FileContent[]> =>
    request<FileContent[]>(
      `/repositories/${repositoryId}/commits/${encodeURIComponent(sha)}/files`,
    ),

  /** GET /repositories/{id}/commits/{sha}/diff — true parent→target diff. */
  getCommitDiff: (repositoryId: number, sha: string): Promise<CommitDiff> =>
    request<CommitDiff>(
      `/repositories/${repositoryId}/commits/${encodeURIComponent(sha)}/diff`,
    ),

  /** GET /repositories/{id}/blobs/{blob_sha} — single blob content. */
  getBlobContent: (
    repositoryId: number,
    blobSha: string,
  ): Promise<BlobContent> =>
    request<BlobContent>(
      `/repositories/${repositoryId}/blobs/${encodeURIComponent(blobSha)}`,
    ),
};

export { API_BASE_URL };
