import re
from pathlib import Path
from src.git.git_runner import run_git, run_git_bytes
from src.schemas.files import CommitDiff, DiffFile

_SHA_RE = re.compile(r"[0-9a-fA-F]+")
_NULL_PROBE_BYTES = 8000
# Cap per-file payload so a huge generated file can't blow up the JSON response.
_MAX_CONTENT_BYTES = 1_000_000

def _ensure_repo(repo_path: str) -> Path:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError(f"{repo} is not a Git repository")
    return repo

def _validate_sha(sha: str) -> str:
    sha = sha.strip()
    if not sha or _SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"{sha!r} is not a valid commit SHA")
    return sha

def _object_type(repo: Path, sha: str) -> str | None:
    try:
        return run_git(["cat-file", "-t", sha], cwd=repo).strip()
    except RuntimeError:
        return None

def _first_parent(repo: Path, sha: str) -> str | None:
    try:
        output = run_git(["rev-list", "--parents", "-n", "1", sha], cwd=repo).strip()
    except RuntimeError as exc:
        raise LookupError(f"No commit {sha!r}") from exc
    parts = output.split()
    if not parts:
        raise LookupError(f"No commit {sha!r}")
    return parts[1] if len(parts) > 1 else None

def _show_file(repo: Path, rev: str, path: str) -> tuple[str, bool]:
    try:
        data = run_git_bytes(["show", f"{rev}:{path}"], cwd=repo)
    except RuntimeError:
        return "", False
    if len(data) > _MAX_CONTENT_BYTES:
        data = data[:_MAX_CONTENT_BYTES]
    binary = b"\x00" in data[:_NULL_PROBE_BYTES]
    if binary:
        return "", True
    return data.decode("utf-8", errors="replace"), False

def read_commit_diff(repo_path: str, sha: str) -> CommitDiff:
    repo = _ensure_repo(repo_path)
    sha = _validate_sha(sha)
    obj_type = _object_type(repo, sha)
    if obj_type is None:
        raise LookupError(f"No commit {sha!r}")
    if obj_type != "commit":
        raise LookupError(f"{sha!r} is a {obj_type}, not a commit")

    parent_sha = _first_parent(repo, sha)

    try:
        numstat = run_git(
            ["diff-tree", "--numstat", "-r", "--no-commit-id", "--root", sha],
            cwd=repo,
        )
    except RuntimeError as exc:
        raise LookupError(f"Cannot diff commit {sha!r}") from exc

    files: list[DiffFile] = []
    for line in numstat.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        add_raw, del_raw = parts[0], parts[1]
        # Rename rows look like `add\tdel\told\tnew` — diff the new path.
        path = parts[-1]
        if not path:
            continue
        binary_row = add_raw == "-" or del_raw == "-"
        try:
            additions = 0 if binary_row else int(add_raw)
        except ValueError:
            additions = 0
        try:
            deletions = 0 if binary_row else int(del_raw)
        except ValueError:
            deletions = 0

        original, original_binary = (
            _show_file(repo, parent_sha, path) if parent_sha else ("", False)
        )
        modified, modified_binary = _show_file(repo, sha, path)
        binary = binary_row or original_binary or modified_binary
        if binary:
            files.append(
                DiffFile(
                    path=path,
                    original="",
                    modified="",
                    additions=additions,
                    deletions=deletions,
                    binary=True,
                )
            )
        else:
            files.append(
                DiffFile(
                    path=path,
                    original=original,
                    modified=modified,
                    additions=additions,
                    deletions=deletions,
                    binary=False,
                )
            )
    return CommitDiff(sha=sha, parent_sha=parent_sha, files=files)
