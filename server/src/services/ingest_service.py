import asyncio
import shutil
from pathlib import Path
from sqlmodel.ext.asyncio.session import AsyncSession
from src.git.commits import parse_git_commits
from src.git.refs import list_branches, list_tags
from src.git.repository import GitRepository
from src.models.enums import RepoStatus
from src.models.repository import Repository
from src.services.branch_service import persist_branches, persist_tags
from src.services.commit_service import clear_commits, persist_commits
from src.services.repository_service import (
    get_repository_by_url,
    mark_repository_status,
    normalize_repository_url,
    store_repository,
)

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
        await asyncio.to_thread(shutil.rmtree, existing.clone_path, True)

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
        records = await asyncio.to_thread(parse_git_commits, cloned.get_path(), None)
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
