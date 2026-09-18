import asyncio
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from src.git.repository import GitRepository

repo_router = APIRouter()

class CloneRepoRequest(BaseModel):
    url: str

def _validate_clone_and_inspect(url: str):
    repo = GitRepository.clone(url)
    return {
        "path": repo.get_path(),
        "branch": repo.get_default_branch(),
        "source": repo.source,
    }

@repo_router.post("/clone")
async def clone_repository(request: CloneRepoRequest):
    try:
        result = await asyncio.to_thread(_validate_clone_and_inspect, request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=f"Clone failed: {e}")
    return result
