from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set
from src.git.git_runner import run_git

MAX_AUTHORS_PER_DAY = 20

def _ensure_repo(repo_path: str) -> Path:
    repo = Path(repo_path).resolve()
    if not (repo / ".git").is_dir():
        raise ValueError("Not a Git repository")
    return repo

def _count(repo: Path, rev: str, extra: List[str]) -> int:
    output = run_git(["rev-list", rev, "--count", *extra], cwd=repo).strip()
    try:
        return max(int(output), 0)
    except ValueError as exc:
        raise RuntimeError("Cannot count commits") from exc

def _resolve_rev(repo: Path, rev: Optional[str]) -> str:
    if rev is None:
        return "--all"
    try:
        sha = run_git(["rev-parse", "--verify", rev], cwd=repo).strip()
    except RuntimeError as exc:
        raise LookupError(f"No revision {rev!r}") from exc
    if not sha:
        raise LookupError(f"No revision {rev!r}")
    return sha

class DayStat:
    __slots__ = ("date", "count", "authors", "_seen")

    def __init__(self, date: str):
        self.date = date
        self.count = 0
        self.authors: List[str] = []
        self._seen: Set[str] = set()

    def add(self, email: str) -> None:
        self.count += 1
        email = (email or "").strip().lower()
        if email and email not in self._seen and len(self.authors) < MAX_AUTHORS_PER_DAY:
            self._seen.add(email)
            self.authors.append(email)

class RepoStats:
    __slots__ = ("total", "merges", "contributors", "active_days", "first_day", "last_day", "days")

    def __init__(
        self,
        total: int,
        merges: int,
        contributors: int,
        active_days: int,
        first_day: Optional[str],
        last_day: Optional[str],
        days: List[DayStat],
    ):
        self.total = total
        self.merges = merges
        self.contributors = contributors
        self.active_days = active_days
        self.first_day = first_day
        self.last_day = last_day
        self.days = days


def _scan_days(repo: Path, rev: str) -> Dict[str, DayStat]:
    output = run_git(["log", rev, "--pretty=format:%ct %ae"], cwd=repo) or ""
    days: Dict[str, DayStat] = {}
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        ts_raw, _, email = line.partition(" ")
        try:
            day = datetime.fromtimestamp(int(ts_raw), tz=timezone.utc).date().isoformat()
        except (ValueError, OverflowError, OSError):
            continue
        entry = days.get(day)
        if entry is None:
            entry = days[day] = DayStat(day)
        entry.add(email.strip())
    return days

def _fill_range(days: Dict[str, DayStat]) -> List[DayStat]:
    if not days:
        return []
    ordered = sorted(days)
    start = datetime.fromisoformat(ordered[0]).date()
    end = datetime.fromisoformat(ordered[-1]).date()
    filled: List[DayStat] = []
    current = start
    while current <= end:
        key = current.isoformat()
        filled.append(days.get(key, DayStat(key)))
        current += timedelta(days=1)
    return filled

def get_repo_stats(repo_path: str, rev: Optional[str] = None) -> RepoStats:
    repo = _ensure_repo(repo_path)
    resolved = _resolve_rev(repo, rev)
    try:
        total = _count(repo, resolved, [])
        merges = _count(repo, resolved, ["--merges"])
    except RuntimeError as exc:
        raise LookupError("Cannot read repository history") from exc
    if total == 0:
        return RepoStats(0, 0, 0, 0, None, None, [])
    days = _scan_days(repo, resolved)
    filled = _fill_range(days)
    contributors = len({email for day in filled for email in day.authors})
    active = sum(1 for day in filled if day.count > 0)
    return RepoStats(
        total=total,
        merges=merges,
        contributors=contributors,
        active_days=active,
        first_day=filled[0].date if filled else None,
        last_day=filled[-1].date if filled else None,
        days=filled,
    )
