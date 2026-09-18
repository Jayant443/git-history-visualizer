import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from src.models.commit import Commit

def _to_datetime(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)

def parse_git_commits(repo_path: str, max_count: int = 100) -> List[Commit]:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError(f"{repo} is not a Git repository")
    format_str = ("%H%x00%h%x00%an%x00%ae%x00%at%x00%ct%x00%P%x00%T%x00%D%x00%s")
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

    commits: List[Commit] = []
    for line in result.stdout.splitlines():
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
