import re
from pathlib import Path
from typing import List, Optional
from src.git.git_runner import run_git, run_git_bytes
from src.schemas.files import BlobContent, FileContent, TreeEntry

_SHA_RE = re.compile(r"[0-9a-fA-F]+")
_NULL_PROBE_BYTES = 8000

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

def _validate_blob_sha(blob_sha: str) -> str:
    blob_sha = blob_sha.strip()
    if not blob_sha or _SHA_RE.fullmatch(blob_sha) is None:
        raise ValueError(f"{blob_sha!r} is not a valid blob SHA")
    return blob_sha

def _parse_tree_line(line: str) -> Optional[TreeEntry]:
    if "\t" not in line:
        return None
    head, path = line.split("\t", 1)
    fields = head.split()
    if len(fields) < 3:
        return None
    mode, kind, blob_sha = fields[0], fields[1], fields[2]
    size: Optional[int] = None
    if len(fields) > 3 and fields[3] != "-":
        try:
            size = int(fields[3])
        except ValueError:
            size = None
    return TreeEntry(path=path, mode=mode, kind=kind, blob_sha=blob_sha, size=size)

def _object_type(repo: Path, sha: str) -> Optional[str]:
    try:
        return run_git(["cat-file", "-t", sha], cwd=repo).strip()
    except RuntimeError:
        return None

def read_tree(repo_path: str, sha: str) -> List[TreeEntry]:
    repo = _ensure_repo(repo_path)
    sha = _validate_sha(sha)
    obj_type = _object_type(repo, sha)
    if obj_type is None:
        raise LookupError(f"No commit {sha!r} in {repo}")
    if obj_type == "blob":
        raise LookupError(
            f"{sha!r} is a file blob, not a commit "
            "(use its blob_sha with the blobs endpoint)"
        )
    if obj_type not in ("commit", "tree"):
        raise LookupError(f"{sha!r} is a {obj_type}, not a commit")
    try:
        output = run_git(["ls-tree", "-r", "-l", sha], cwd=repo)
    except RuntimeError as exc:
        raise LookupError(f"Cannot list tree for {sha!r} in {repo}") from exc
    entries: List[TreeEntry] = []
    for line in output.splitlines():
        entry = _parse_tree_line(line)
        if entry is not None:
            entries.append(entry)
    return entries

def resolve_blob(repo_path: str, sha: str, path: str) -> str:
    repo = _ensure_repo(repo_path)
    sha = _validate_sha(sha)
    path = path.strip().lstrip("/")
    if not path:
        raise ValueError("File path must not be empty")
    try:
        resolved = run_git(["rev-parse", "--verify", f"{sha}:{path}"], cwd=repo).strip()
    except RuntimeError as exc:
        raise LookupError(f"No file {path!r} at commit {sha!r}") from exc
    if run_git(["cat-file", "-t", resolved], cwd=repo).strip() != "blob":
        raise LookupError(f"{path!r} at commit {sha!r} is not a file")
    return resolved

def read_blob(repo_path: str, blob_sha: str) -> bytes:
    repo = _ensure_repo(repo_path)
    blob_sha = _validate_blob_sha(blob_sha)
    try:
        return run_git_bytes(["cat-file", "-p", blob_sha], cwd=repo)
    except RuntimeError as exc:
        raise LookupError(f"No blob {blob_sha!r} in {repo}") from exc

def read_file_at_commit(repo_path: str, sha: str, path: str) -> FileContent:
    repo = _ensure_repo(repo_path)
    blob_sha = resolve_blob(str(repo), sha, path)
    data = read_blob(str(repo), blob_sha)
    binary = b"\x00" in data[:_NULL_PROBE_BYTES]
    return FileContent(
        commit_sha=_validate_sha(sha),
        path=path.strip().lstrip("/"),
        blob_sha=blob_sha,
        size=len(data),
        binary=binary,
        content=None if binary else data.decode("utf-8", errors="replace"),
    )

def read_all_files_at_commit(repo_path: str, sha: str) -> List[FileContent]:
    repo = _ensure_repo(repo_path)
    sha = _validate_sha(sha)
    entries = read_tree(str(repo), sha)
    files: List[FileContent] = []
    for entry in entries:
        if entry.kind != "blob":
            continue
        data = read_blob(str(repo), entry.blob_sha)
        binary = b"\x00" in data[:_NULL_PROBE_BYTES]
        files.append(
            FileContent(
                commit_sha=sha,
                path=entry.path,
                blob_sha=entry.blob_sha,
                size=len(data),
                binary=binary,
                content=None if binary else data.decode("utf-8", errors="replace"),
            )
        )
    return files

def read_blob_content(repo_path: str, blob_sha: str) -> BlobContent:
    repo = _ensure_repo(repo_path)
    data = read_blob(str(repo), blob_sha)
    binary = b"\x00" in data[:_NULL_PROBE_BYTES]
    return BlobContent(
        blob_sha=_validate_blob_sha(blob_sha),
        size=len(data),
        binary=binary,
        content=None if binary else data.decode("utf-8", errors="replace"),
    )
