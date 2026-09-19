from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.database import get_session
from src.models.branch import BranchRead
from src.models.tag import TagRead
from src.services.branch_service import (
    list_branches,
    list_tags,
    to_branch_read,
    to_tag_read,
)
from src.services.repository_service import get_repository

branch_router = APIRouter()


async def _require_repository(session: AsyncSession, repository_id: int) -> None:
    if await get_repository(session, repository_id) is None:
        raise HTTPException(status_code=404, detail="Repository not found")


@branch_router.get("/{repository_id:int}/branches", response_model=List[BranchRead])
async def fetch_branches(repository_id: int, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    rows = await list_branches(session, repository_id)
    return [to_branch_read(branch) for branch in rows]


@branch_router.get("/{repository_id:int}/tags", response_model=List[TagRead])
async def fetch_tags(repository_id: int, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    rows = await list_tags(session, repository_id)
    return [to_tag_read(tag) for tag in rows]
