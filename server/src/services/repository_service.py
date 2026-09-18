from datetime import datetime
from typing import List, Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.models.enums import RepoStatus
from src.models.repository import Repository

async def get_repository(session: AsyncSession, repository_id: int) -> Optional[Repository]:
    return await session.get(Repository, repository_id)

async def get_repository_by_url(session: AsyncSession, url: str) -> Optional[Repository]:
    result = await session.exec(select(Repository).where(Repository.url == url))
    return result.first()

async def list_repositories(session: AsyncSession, *, limit: int = 100, offset: int = 0) -> List[Repository]:
    result = await session.exec(select(Repository).order_by(Repository.id).offset(offset).limit(limit))
    return list(result.all())

async def store_repository(session: AsyncSession, *, url: str, name: str, default_branch: Optional[str] = None, clone_path: Optional[str] = None, status: RepoStatus = RepoStatus.ready) -> Repository:
    url = url.strip()
    name = name.strip()
    repository = await get_repository_by_url(session, url)
    if repository is None:
        repository = Repository(
            url=url,
            name=name,
            default_branch=default_branch,
            clone_path=clone_path,
            status=status,
        )
    else:
        repository.name = name
        repository.default_branch = default_branch
        repository.clone_path = clone_path
        repository.status = status
        repository.updated_at = datetime.utcnow()
    session.add(repository)
    await session.commit()
    await session.refresh(repository)
    return repository

async def mark_repository_status(session: AsyncSession, repository: Repository, status: RepoStatus, error_message: Optional[str] = None,) -> Repository:
    repository.status = status
    repository.error_message = error_message if status == RepoStatus.error else None
    repository.updated_at = datetime.utcnow()
    session.add(repository)
    await session.commit()
    await session.refresh(repository)
    return repository
