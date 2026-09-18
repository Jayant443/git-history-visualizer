import asyncio
from pathlib import Path
from sqlmodel.ext.asyncio.session import AsyncSession
from src.git.commits import parse_git_commits
from src.git.repository import GitRepository
from src.models.enums import RepoStatus
from src.models.repository import Repository
from src.services.commit_service import clear_commits, persist_commits
from src.services.repository_service import mark_repository_status, store_repository

async def ingest_repository(session: AsyncSession, url: str) -> Repository:
    url = url.strip()
    if not url:
        raise ValueError("Repository URL must not be empty")

    # git work stays in threads; the session stays on the event loop.
    cloned = await asyncio.to_thread(GitRepository.clone, url)
    branch = await asyncio.to_thread(cloned.get_default_branch)
    repository = await store_repository(
        session,
        url=url,
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
