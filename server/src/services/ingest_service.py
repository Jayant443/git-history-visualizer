import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.config import config
from src.git.commits import count_git_commits, parse_git_commits
from src.git.diff import read_commit_diff
from src.git.refs import list_branches, list_tags
from src.git.repository import GitRepository, safe_rmtree_clone
from src.models.enums import RepoStatus
from src.models.repository import Repository
from src.schemas.branches import CommitWithBranches
from src.schemas.files import CommitDiff
from src.services.branch_service import persist_branches, persist_tags
from src.services.commit_service import (
    clear_commits,
    count_commits,
    list_commits,
    persist_commits,
    to_commit_with_branches_list,
)
from src.services.repository_service import (
    get_repository,
    get_repository_by_url,
    mark_repository_status,
    normalize_repository_url,
    store_repository,
)

INITIAL_COMMIT_PAGE_SIZE = 50
MAX_BACKFILL_PER_REQUEST = 50

def _needs_reingest(repository: Repository) -> bool:
    if repository.status == RepoStatus.error:
        return True
    return repository.status == RepoStatus.ready and repository.commit_count == 0

async def ingest_repository(session: AsyncSession, url: str) -> Repository:
    normalized_url = normalize_repository_url(url)
    if not normalized_url:
        raise ValueError("Repository URL must not be empty")

    existing = await get_repository_by_url(session, normalized_url)
    if existing is not None and not _needs_reingest(existing):
        return existing
    if existing is not None and existing.clone_path:
        root = Path(config.REPOSITORY_ROOT).resolve()
        try:
            await asyncio.to_thread(safe_rmtree_clone, root, existing.clone_path)
        except ValueError as exc:
            logging.warning("Skipping clone cleanup outside repository root: %s", exc)

    cloned = await asyncio.to_thread(GitRepository.clone, normalized_url)
    branch = await asyncio.to_thread(cloned.get_default_branch)
    repository = await store_repository(
        session,
        url=normalized_url,
        name=Path(cloned.get_path()).name,
        default_branch=branch,
        clone_path=cloned.get_path(),
        status=RepoStatus.cloning,
    )
    try:
        records = await asyncio.to_thread(parse_git_commits, cloned.get_path(), INITIAL_COMMIT_PAGE_SIZE)
        await clear_commits(session, repository)
        await persist_commits(session, repository, records)
        branches = await asyncio.to_thread(list_branches, cloned.get_path())
        await persist_branches(session, repository, branches)
        tags = await asyncio.to_thread(list_tags, cloned.get_path())
        await persist_tags(session, repository, tags)
        await mark_repository_status(session, repository, RepoStatus.ready)
    except Exception as exc:
        await mark_repository_status(session, repository, RepoStatus.error, str(exc))
        raise
    return repository

async def _refresh_refs(session: AsyncSession, repository: Repository, clone_path: str) -> None:
    branches = await asyncio.to_thread(list_branches, clone_path)
    await persist_branches(session, repository, branches)
    tags = await asyncio.to_thread(list_tags, clone_path)
    await persist_tags(session, repository, tags)

async def fetch_commit_page(
    session: AsyncSession,
    repository_id: int,
    *,
    skip: int = 0,
    limit: int = INITIAL_COMMIT_PAGE_SIZE,
    with_files: bool = True,
) -> tuple[List[CommitWithBranches], Dict[str, Optional[CommitDiff]], int, int]:
    if skip < 0:
        raise ValueError("skip must not be negative")
    if limit < 1 or limit > MAX_BACKFILL_PER_REQUEST:
        raise ValueError(f"limit must be between 1 and {MAX_BACKFILL_PER_REQUEST}")
    repository = await get_repository(session, repository_id)
    if repository is None or repository.id is None:
        raise LookupError("Repository not found")
    if not repository.clone_path:
        raise ValueError("Repository has no local clone")

    total = await asyncio.to_thread(count_git_commits, repository.clone_path)
    ingested = await count_commits(session, repository.id)
    target = min(skip + limit, total)
    while ingested < target:
        batch = min(target - ingested, MAX_BACKFILL_PER_REQUEST)
        records = await asyncio.to_thread(parse_git_commits, repository.clone_path, batch, ingested)
        if not records:
            break
        await persist_commits(session, repository, records, sequence_offset=ingested)
        await _refresh_refs(session, repository, repository.clone_path)
        ingested = await count_commits(session, repository.id)
        if len(records) < batch:
            break

    rows = await list_commits(session, repository.id, limit=limit, offset=skip)
    enriched = await to_commit_with_branches_list(session, rows)
    diffs: Dict[str, Optional[CommitDiff]] = {}
    if with_files and rows:
        results = await asyncio.gather(
            *(asyncio.to_thread(read_commit_diff, repository.clone_path, row.sha) for row in rows)
        )
        diffs = {row.sha: diff for row, diff in zip(rows, results)}
    return enriched, diffs, total, ingested
