import asyncio
from pathlib import Path
from sqlmodel.ext.asyncio.session import AsyncSession
from src.git.commits import parse_git_commits
from src.git.repository import GitRepository
from src.models.enums import RepoStatus
from src.models.repository import Repository
from src.services.commit_service import clear_commits, persist_commits
from src.services.repository_service import (
    get_repository_by_url,
    mark_repository_status,
    normalize_repository_url,
    store_repository,
)

async def ingest_repository(session: AsyncSession, url: str) -> Repository:
    normalized_url = normalize_repository_url(url)
    if not normalized_url:
        raise ValueError("Repository URL must not be empty")

    existing = await get_repository_by_url(session, normalized_url)
    if existing is not None:
        return existing

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
        await mark_repository_status(session, repository, RepoStatus.ready)
    except Exception as exc:
        await mark_repository_status(session, repository, RepoStatus.error, str(exc))
        raise
    return repository
