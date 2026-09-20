import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.database import get_session
from src.git.files import read_all_files_at_commit, read_blob_content, read_tree
from src.git.diff import read_commit_diff
from src.models.repository import Repository
from src.schemas.branches import CommitPage, CommitWithBranches, CommitWithFiles
from src.schemas.files import BlobContent, CommitDiff, FileContent, TreeEntry
from src.services.commit_service import (
    get_all_commits,
    get_commit_by_short_sha,
    list_commits,
    to_commit_with_branches_list,
)
from src.services.ingest_service import (
    INITIAL_COMMIT_PAGE_SIZE,
    MAX_BACKFILL_PER_REQUEST,
    fetch_commit_page,
)
from src.services.repository_service import get_repository

commit_router = APIRouter()

async def _require_repository(session: AsyncSession, repository_id: int) -> None:
    if await get_repository(session, repository_id) is None:
        raise HTTPException(status_code=404, detail="Repository not found")

async def _require_clone(session: AsyncSession, repository_id: int) -> Repository:
    repo = await get_repository(session, repository_id)
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    if not repo.clone_path:
        raise HTTPException(status_code=422, detail="Repository has no local clone")
    return repo

@commit_router.get("/{repository_id:int}/commits", response_model=List[CommitWithBranches])
async def fetch_commits(repository_id: int, limit: int = Query(default=100, le=500), offset: int = Query(default=0, ge=0), session: AsyncSession = Depends(get_session),):
    await _require_repository(session, repository_id)
    try:
        rows = await list_commits(session, repository_id, limit=limit, offset=offset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await to_commit_with_branches_list(session, rows)

@commit_router.get("/{repository_id:int}/commits/all", response_model=List[CommitWithBranches])
async def fetch_all_commits(repository_id: int, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    rows = await get_all_commits(session, repository_id)
    return await to_commit_with_branches_list(session, rows)

@commit_router.get("/{repository_id:int}/commits/next", response_model=CommitPage)
async def fetch_next_commits(repository_id: int, skip: int = Query(default=0, ge=0), limit: int = Query(default=INITIAL_COMMIT_PAGE_SIZE, ge=1, le=MAX_BACKFILL_PER_REQUEST), with_files: bool = Query(default=True), session: AsyncSession = Depends(get_session),):
    try:
        enriched, diffs, total, ingested = await fetch_commit_page(
            session, repository_id, skip=skip, limit=limit, with_files=with_files
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CommitPage(
        commits=[
            CommitWithFiles(**commit.model_dump(), diff=diffs.get(commit.sha))
            for commit in enriched
        ],
        total=total,
        ingested=ingested,
        has_more=ingested < total,
    )

@commit_router.get("/{repository_id:int}/commits/{short_sha}", response_model=CommitWithBranches)
async def fetch_commit_by_short_sha(repository_id: int, short_sha: str, session: AsyncSession = Depends(get_session)):
    await _require_repository(session, repository_id)
    try:
        commit = await get_commit_by_short_sha(session, repository_id, short_sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if commit is None:
        raise HTTPException(status_code=404, detail="Commit not found")
    return (await to_commit_with_branches_list(session, [commit]))[0]

@commit_router.get("/{repository_id:int}/commits/{sha}/tree", response_model=List[TreeEntry])
async def fetch_commit_tree(repository_id: int, sha: str, session: AsyncSession = Depends(get_session)):
    repo = await _require_clone(session, repository_id)
    try:
        return await asyncio.to_thread(read_tree, repo.clone_path, sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))

@commit_router.get("/{repository_id:int}/commits/{sha}/files", response_model=List[FileContent])
async def fetch_commit_files(repository_id: int, sha: str, session: AsyncSession = Depends(get_session)):
    repo = await _require_clone(session, repository_id)
    try:
        return await asyncio.to_thread(read_all_files_at_commit, repo.clone_path, sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))

@commit_router.get("/{repository_id:int}/commits/{sha}/diff", response_model=CommitDiff)
async def fetch_commit_diff(repository_id: int, sha: str, session: AsyncSession = Depends(get_session)):
    repo = await _require_clone(session, repository_id)
    try:
        return await asyncio.to_thread(read_commit_diff, repo.clone_path, sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))

@commit_router.get("/{repository_id:int}/blobs/{blob_sha}", response_model=BlobContent)
async def fetch_blob_content(repository_id: int, blob_sha: str, session: AsyncSession = Depends(get_session)):
    repo = await _require_clone(session, repository_id)
    try:
        return await asyncio.to_thread(read_blob_content, repo.clone_path, blob_sha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))
