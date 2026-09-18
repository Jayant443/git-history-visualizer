import asyncio
from typing import List
from fastapi import APIRouter, HTTPException
from src.git.commits import parse_git_commits
from src.models.commit import Commit

commit_router = APIRouter()

@commit_router.get("/commits", response_model=List[Commit])
async def fetch_commits(repo_path: str, max_count: int = 100):
    try:
        commits = await asyncio.to_thread(parse_git_commits, repo_path, max_count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (RuntimeError, TimeoutError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return commits
