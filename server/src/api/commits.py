from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.database import get_session
from src.models.commit import CommitRead
from src.services.commit_service import (
    get_all_commits,
    get_commit_by_short_sha,
    list_commits,
    to_commit_read,
)
from src.services.repository_service import get_repository

commit_router = APIRouter()

async def _require_repository(session: AsyncSession, repository_id: int) -> None:
    if await get_repository(session, repository_id) is None:
        raise HTTPException(status_code=404, detail="Repository not found")

@commit_router.get("/{repository_id:int}/commits", response_model=List[CommitRead], name="list-commits")
async def fetch_commits(repository_id: int, limit: int = Query(default=100, le=500), offset: int = Query(default=0, ge=0), session: AsyncSession = Depends(get_session),):
    await _require_repository(session, repository_id)
    try:
        rows = await list_commits(session, repository_id, limit=limit, offset=offset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [to_commit_read(commit) for commit in rows]

@commit_router.get("/{repository_id:int}/commits/all", response_model=List[CommitRead], name="list-all-commits",)
async def fetch_all_commits(repository_id: int, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    rows = await get_all_commits(session, repository_id)
    return [to_commit_read(commit) for commit in rows]

@commit_router.get("/{repository_id:int}/commits/next", response_model=List[CommitRead], name="list-next-commits",)
async def fetch_next_commits(repository_id: int, skip: int = Query(default=0, ge=0), limit: int = Query(default=10, ge=1, le=500), session: AsyncSession = Depends(get_session),):
    await _require_repository(session, repository_id)
    try:
        rows = await list_commits(session, repository_id, limit=limit, offset=skip)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [to_commit_read(commit) for commit in rows]

@commit_router.get("/{repository_id:int}/commits/{short_sha}", response_model=CommitRead, name="get-commit-by-short-sha",)
async def fetch_commit_by_short_sha(repository_id: int, short_sha: str, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    try:
        commit = await get_commit_by_short_sha(session, repository_id, short_sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if commit is None:
        raise HTTPException(status_code=404, detail="Commit not found")
    return to_commit_read(commit)
