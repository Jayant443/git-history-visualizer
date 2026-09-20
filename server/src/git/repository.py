import re
import shutil
from pathlib import Path
from urllib.parse import urlparse
from src.core.config import config
from src.git.git_runner import run_git

MAX_URL_LENGTH = 2000
ALLOWED_SCHEMES = {"https"}
CLONE_CONFIG = [
    "-c", "protocol.file.allow=never",
    "-c", "protocol.ext.allow=never",
    "-c", "protocol.ssh.allow=never",
    "-c", "protocol.git.allow=never",
    "-c", "core.symlinks=false",
    "-c", "filter.lfs.smudge=",
]

def validate_clone_url(repo_url: str) -> str:
    url = (repo_url or "").strip()
    if not url:
        raise ValueError("Repository URL must not be empty")
    if len(url) > MAX_URL_LENGTH:
        raise ValueError("Repository URL is too long")
    if url.startswith("-"):
        raise ValueError("Repository URL must not start with '-'")
    if any(c in url for c in ("\x00", "\n", "\r")):
        raise ValueError("Repository URL contains invalid characters")
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError("Only public https:// repository URLs are allowed")
    if not parsed.hostname:
        raise ValueError("Repository URL must include a host")
    if parsed.username or parsed.password or "@" in parsed.netloc:
        raise ValueError("URLs with credentials are not allowed (public repositories only)")
    if parsed.port is not None:
        raise ValueError("Explicit ports are not allowed in repository URLs")
    if parsed.fragment or parsed.query:
        raise ValueError("Repository URL must not contain a fragment or query string")
    if not parsed.path or parsed.path.strip("/") == "":
        raise ValueError("Repository URL must include a repository path")
    if parsed.hostname and parsed.hostname.lower() in GitRepository.GITHUB_HOSTS:
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) < 2:
            raise ValueError("Not a valid GitHub repository URL (expected /owner/repo)")
    return url.rstrip("/")

def is_path_within_root(root: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False

def safe_rmtree_clone(root: Path, target: str | Path) -> None:
    path = Path(target)
    if not is_path_within_root(root, path):
        raise ValueError("Refusing to delete a path outside the repository root")
    resolved = path.resolve()
    if resolved == root.resolve():
        raise ValueError("Refusing to delete the repository root itself")
    shutil.rmtree(resolved, ignore_errors=True)

def _sanitize_dirname(name: str) -> str:
    name = "".join(c if (c.isalnum() or c in "-_.") else "-" for c in name)
    name = name.strip("-.")
    return name or "repository"

class GitRepository:
    GITHUB_HOSTS = {"github.com", "www.github.com"}

    def __init__(self, repo_path: str, source: str):
        self.repo_path = Path(repo_path).resolve()
        self.source = source
        if not (self.repo_path / ".git").is_dir():
            raise ValueError("Cloned directory is not a valid Git repository")

    @classmethod
    def _is_github(cls, parsed) -> bool:
        return parsed.hostname is not None and parsed.hostname.lower() in cls.GITHUB_HOSTS

    @classmethod
    def _github_repo_name(cls, parsed) -> str:
        owner_repo = [p for p in parsed.path.split("/") if p]
        if len(owner_repo) < 2:
            raise ValueError("Not a valid GitHub repository URL (expected /owner/repo)")
        repo = re.sub(r"\.git$", "", owner_repo[1])
        return _sanitize_dirname(repo)

    @classmethod
    def _generic_repo_name(cls, parsed) -> str:
        name = Path(parsed.path.rstrip("/")).name
        name = re.sub(r"\.git$", "", name)
        if not name:
            name = parsed.netloc
        return _sanitize_dirname(name)

    @classmethod
    def _derive_name_and_source(cls, url: str) -> tuple[str, str]:
        parsed = urlparse(url)
        if cls._is_github(parsed):
            return cls._github_repo_name(parsed), "github"
        return cls._generic_repo_name(parsed), "other"

    @classmethod
    def _reserve_target(cls, root: Path, name: str) -> Path:
        target = root / name
        i = 2
        while True:
            try:
                target.mkdir(parents=False, exist_ok=False)
                return target
            except FileExistsError:
                target = root / f"{name}-{i}"
                i += 1
                if i > 1000:
                    raise ValueError("Too many repositories with the same name")

    @classmethod
    def clone(cls, repo_url: str, target_path: str = config.REPOSITORY_ROOT, timeout: int = 120) -> "GitRepository":
        root = Path(target_path).resolve()
        root.mkdir(parents=True, exist_ok=True)
        url = validate_clone_url(repo_url)
        name, source = cls._derive_name_and_source(url)
        target = cls._reserve_target(root, name)
        if not is_path_within_root(root, target):
            safe_rmtree_clone(root, target)
            raise ValueError("Invalid repository target")
        try:
            run_git(
                [
                    *CLONE_CONFIG,
                    "clone",
                    "--no-checkout",
                    "--filter=blob:none",
                    "--origin", "origin",
                    "--",
                    url,
                    str(target),
                ],
                cwd=None,
                timeout=timeout,
            )
        except Exception:
            safe_rmtree_clone(root, target)
            raise
        return cls(str(target), source=source)

    def get_path(self) -> str:
        return str(self.repo_path)

    def get_default_branch(self) -> str:
        return run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=self.repo_path).strip()

    def __repr__(self) -> str:
        return f"<GitRepository path={self.repo_path} source={self.source}>"
