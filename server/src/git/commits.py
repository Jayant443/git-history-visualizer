import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from src.git.git_runner import run_git
from src.schemas.commit import Commit

_FORMAT = "%H%x00%h%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%P%x00%T%x00%D%x00%s"
_SHA_RE = re.compile(r"[0-9a-fA-F]+")

def _to_datetime(value: str) -> datetime:
    try:
        return datetime.fromtimestamp(int(value.strip()), tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return datetime.fromtimestamp(0, tz=timezone.utc)

def _parse_refs(refs: str) -> tuple[List[str], List[str]]:
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
                branches.append(ref)
    return branches, tags

def _ensure_repo(repo_path: str) -> Path:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError(f"{repo} is not a Git repository")
    return repo

def _parse_line(line: str) -> Optional[Commit]:
    parts = line.split("\x00")
    if len(parts) != 12:
        return None
    (
        sha,
        short_sha,
        author_name,
        author_email,
        author_ts,
        committer_name,
        committer_email,
        commit_ts,
        parents_str,
        tree_sha,
        refs,
        message,
    ) = parts
    parents = [p for p in parents_str.split() if p]
    parent_count = len(parents)
    branches, tags = _parse_refs(refs)
    return Commit(
        sha=sha,
        short_sha=short_sha,
        message=message,
        author_name=author_name.strip(),
        author_email=author_email.strip(),
        committer_name=committer_name.strip(),
        committer_email=committer_email.strip(),
        author_timestamp=_to_datetime(author_ts),
        commit_timestamp=_to_datetime(commit_ts),
        parents=parents,
        parent_count=parent_count,
        tree_sha=tree_sha,
        branches=branches,
        tags=tags,
        commit_type="merge" if parent_count > 1 else "normal",
    )

def parse_git_commits(repo_path: str, max_count: Optional[int] = 100, skip: int = 0) -> List[Commit]:
    """Commits in replay order (oldest first); `skip`/`max_count` page from there.

    `git log --reverse` cannot page oldest-first (`-n`/`--skip` apply before
    reversing), so the full log is fetched and sliced here instead.
    """
    repo = _ensure_repo(repo_path)
    if max_count is not None and max_count < 1:
        raise ValueError("max_count must be positive")
    if skip < 0:
        raise ValueError("skip must not be negative")
    output = run_git(["log", f"--pretty=format:{_FORMAT}"], cwd=repo)
    commits: List[Commit] = []
    for line in output.splitlines():
        commit = _parse_line(line)
        if commit is not None:
            commits.append(commit)
    commits.reverse()  # git log is newest-first; replay starts at the first commit
    if skip:
        commits = commits[skip:]
    if max_count is not None:
        commits = commits[:max_count]
    return commits

def get_commit_by_sha(repo_path: str, sha: str) -> Optional[Commit]:
    repo = _ensure_repo(repo_path)
    sha = sha.strip()
    if not sha or _SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"{sha!r} is not a valid commit SHA")
    try:
        output = run_git(["log", "-1", f"--pretty=format:{_FORMAT}", sha], cwd=repo)
    except RuntimeError:
        return None
    if not output.strip():
        return None
    return _parse_line(output.splitlines()[0])
