import re
import shutil
from pathlib import Path
from urllib.parse import urlparse
from src.core.config import config
from src.git.git_runner import run_git
from enum import Enum

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
            raise ValueError(f"{self.repo_path} does not appear to be a Git repository")

    @classmethod
    def _is_github(cls, parsed) -> bool:
        return parsed.hostname is not None and parsed.hostname.lower() in cls.GITHUB_HOSTS

    @classmethod
    def _github_repo_name(cls, parsed) -> str:
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) < 2:
            raise ValueError("Not a valid GitHub repository URL (expected /owner/repo)")
        owner, repo = parts[0], parts[1]
        repo = re.sub(r"\.git$", "", repo)
        return _sanitize_dirname(f"{repo}")

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
    def _unique_target(cls, root: Path, name: str) -> Path:
        target = root / name
        i = 2
        while target.exists():
            target = root / f"{name}-{i}"
            i += 1
        return target

    @classmethod
    def clone(cls, repo_url: str, target_path: str = config.REPOSITORY_ROOT, timeout: int = 120) -> "GitRepository":
        root = Path(target_path).resolve()
        root.mkdir(parents=True, exist_ok=True)
        url = repo_url.strip()
        name, source = cls._derive_name_and_source(url)
        target = cls._unique_target(root, name)
        try:
            run_git(["clone", url, str(target)], cwd=None, timeout=timeout)
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise
        return cls(str(target), source=source)

    def get_path(self) -> str:
        return str(self.repo_path)

    def get_default_branch(self) -> str:
        return run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=self.repo_path).strip()

    def __repr__(self) -> str:
        return f"<GitRepository path={self.repo_path} source={self.source}>"
