import re
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from src.git.git_runner import run_git

_SHA_RE = re.compile(r"[0-9a-fA-F]{4,}")

class BranchInfo(BaseModel):
    name: str
    head_sha: str
    is_remote: bool = False

class TagInfo(BaseModel):
    name: str
    target_sha: str
    message: Optional[str] = None

def _ensure_repo(repo_path: str) -> Path:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError(f"{repo} is not a Git repository")
    return repo

def _is_valid_sha(value: str) -> bool:
    return bool(value) and _SHA_RE.fullmatch(value.strip()) is not None

def list_branches(repo_path: str) -> List[BranchInfo]:
    repo = _ensure_repo(repo_path)
    output = run_git(
        ["for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads", "refs/remotes"],
        cwd=repo,
    )
    branches: List[BranchInfo] = []
    seen: set[str] = set()
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\x00")
        if len(parts) != 2:
            continue
        refname, head_sha = parts[0].strip(), parts[1].strip()
        if refname.startswith("refs/heads/"):
            name = refname[len("refs/heads/"):].strip()
            is_remote = False
        elif refname.startswith("refs/remotes/"):
            name = refname[len("refs/remotes/"):].strip()
            is_remote = True
        else:
            continue
        if not name or name == "HEAD" or name.endswith("/HEAD"):
            continue
        if not _is_valid_sha(head_sha):
            continue
        key = ("r" if is_remote else "l") + "\x00" + name
        if key in seen:
            continue
        seen.add(key)
        branches.append(BranchInfo(name=name, head_sha=head_sha, is_remote=is_remote))
    return branches

def list_tags(repo_path: str) -> List[TagInfo]:
    repo = _ensure_repo(repo_path)
    output = run_git(
        [
            "for-each-ref",
            "--format=%(refname:strip=2)%00%(objectname)%00%(*objectname)%00%(contents:subject)",
            "refs/tags",
        ],
        cwd=repo,
    )
    tags: List[TagInfo] = []
    seen: set[str] = set()
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\x00")
        if len(parts) != 4:
            continue
        name, objectname, peeled, subject = (p.strip() for p in parts)
        if not name or name in seen:
            continue
        is_annotated = _is_valid_sha(peeled)
        target_sha = peeled if is_annotated else objectname
        if not _is_valid_sha(target_sha):
            continue
        seen.add(name)
        message = (subject.strip() or None) if is_annotated else None
        tags.append(TagInfo(name=name, target_sha=target_sha, message=message))
    return tags
