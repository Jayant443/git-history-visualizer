import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from src.schemas.commit import Commit

@dataclass
class GitAuthor:
    name: str
    email: str

@dataclass
class GitCommitRecord:
    sha: str
    summary: str
    message: str
    authored_at: datetime
    committed_at: datetime
    is_merge: bool
    author: GitAuthor
    committer: GitAuthor
    parents: List[str]

def _to_datetime(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)

def _safe_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except ValueError:
        return default

def _run_git_log(repo_path: str, max_count: int, format_str: str) -> List[str]:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError(f"{repo} is not a Git repository")
    cmd = [
        "git",
        "log",
        f"-n {max_count}",
        f"--pretty=format:{format_str}",
    ]
    result = subprocess.run(
        cmd,
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git log failed: {result.stderr.strip()}")
    return result.stdout.splitlines()

def parse_git_commits(repo_path: str, max_count: int = 100) -> List[Commit]:
    format_str = ("%H%x00%h%x00%an%x00%ae%x00%at%x00%ct%x00%P%x00%T%x00%D%x00%s")
    lines = _run_git_log(repo_path, max_count, format_str)
    commits: List[Commit] = []
    for line in lines:
        (
            sha,
            short_sha,
            author_name,
            author_email,
            author_ts,
            commit_ts,
            parents_str,
            tree_sha,
            refs,
            message,
        ) = line.split("\x00")
        parents = [p for p in parents_str.split() if p]
        parent_count = len(parents)
        commit_type = "merge" if parent_count > 1 else "normal"
        branches: List[str] = []
        tags: List[str] = []
        if refs:
            for ref in refs.split(","):
                ref = ref.strip()
                if "->" in ref:
                    _, branch = ref.split("->", 1)
                    branches.append(branch.strip())
                elif ref.startswith("tag: "):
                    tags.append(ref[5:].strip())
                else:
                    if "/" in ref or not ref.startswith("tag:"):
                        branches.append(ref)
        commits.append(
            Commit(
                sha=sha,
                short_sha=short_sha,
                message=message,
                author_name=author_name,
                author_email=author_email,
                author_timestamp=_to_datetime(int(author_ts)),
                commit_timestamp=_to_datetime(int(commit_ts)),
                parents=parents,
                parent_count=parent_count,
                tree_sha=tree_sha,
                branches=branches,
                tags=tags,
                commit_type=commit_type,
            )
        )
    return commits

def extract_commits(repo_path: str, max_count: int = 100) -> List[GitCommitRecord]:
    format_str = "%H%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%P%x00%s"
    lines = _run_git_log(repo_path, max_count, format_str)
    records: List[GitCommitRecord] = []
    for line in lines:
        parts = line.split("\x00")
        if len(parts) < 9:
            continue
        sha = parts[0]
        author_name = parts[1].strip()
        author_email = parts[2].strip()
        author_ts = parts[3].strip()
        committer_name = parts[4].strip()
        committer_email = parts[5].strip()
        commit_ts = parts[6].strip()
        parents_str = parts[7]
        subject = parts[8].strip()

        parents = [p for p in parents_str.split() if p]
        records.append(
            GitCommitRecord(
                sha=sha,
                summary=subject,
                message=subject,
                authored_at=_to_datetime(_safe_int(author_ts)),
                committed_at=_to_datetime(_safe_int(commit_ts)),
                is_merge=len(parents) > 1,
                author=GitAuthor(name=author_name, email=author_email),
                committer=GitAuthor(name=committer_name, email=committer_email),
                parents=parents,
            )
        )
    return records
