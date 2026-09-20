from typing import List
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.database import get_session
from src.models.repository import Repository, RepositoryRead
from src.schemas.repository import CloneRepoRequest, StoreRepositoryRequest
from src.services.ingest_service import ingest_repository
from src.services.repository_service import (
    get_repository,
    list_repositories,
    store_repository,
)

repo_router = APIRouter()

def _to_read(repo: Repository) -> RepositoryRead:
    # Built field-by-field so relationship attributes are never touched
    # (they would trigger lazy loads outside the session).
    return RepositoryRead(
        id=repo.id,
        url=repo.url,
        name=repo.name,
        default_branch=repo.default_branch,
        status=repo.status,
        error_message=repo.error_message,
        clone_path=repo.clone_path,
        commit_count=repo.commit_count,
        created_at=repo.created_at,
        updated_at=repo.updated_at,
    )

@repo_router.post("/clone", response_model=RepositoryRead, name="clone-repository")
async def clone_repository(request: CloneRepoRequest, session: AsyncSession = Depends(get_session),):
    try:
        repo = await ingest_repository(session, request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        logging.warning("Repository ingest failed: %s", e)
        raise HTTPException(status_code=422, detail="Ingest failed: unable to clone or analyze the repository")
    except Exception as e:
        logging.exception("Unexpected ingest failure: %s", e)
        raise HTTPException(status_code=500, detail="Ingest failed due to an internal error")
    return _to_read(repo)

@repo_router.post("", response_model=RepositoryRead, status_code=201, name="store-repository")
async def store_repository_details(request: StoreRepositoryRequest, session: AsyncSession = Depends(get_session),):
    try:
        repo = await store_repository(
            session,
            url=request.url,
            name=request.name,
            default_branch=request.default_branch,
            clone_path=request.clone_path,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_read(repo)

@repo_router.get("", response_model=List[RepositoryRead], name="list-repositories")
async def list_repository_details(limit: int = Query(default=100, le=500), offset: int = Query(default=0, ge=0), session: AsyncSession = Depends(get_session)):
    repos = await list_repositories(session, limit=limit, offset=offset)
    return [_to_read(repo) for repo in repos]

@repo_router.get("/{repository_id:int}", response_model=RepositoryRead, name="get-repository")
async def get_repository_details(repository_id: int, session: AsyncSession = Depends(get_session),):
    repo = await get_repository(session, repository_id)
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    return _to_read(repo)
