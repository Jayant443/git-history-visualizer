from typing import List, Optional
from pydantic import BaseModel
from src.models.commit import CommitRead
from src.schemas.files import CommitDiff

class CommitWithBranches(CommitRead):
    branches: List[str] = []

class CommitWithFiles(CommitWithBranches):
    diff: Optional[CommitDiff] = None

class CommitPage(BaseModel):
    commits: List[CommitWithFiles] = []
    total: int = 0
    ingested: int = 0
    has_more: bool = False

class StatDay(BaseModel):
    date: str
    count: int = 0
    authors: List[str] = []

class RepositoryStats(BaseModel):
    total: int = 0
    merges: int = 0
    contributors: int = 0
    active_days: int = 0
    first_day: Optional[str] = None
    last_day: Optional[str] = None
    scope: str = "all"
    days: List[StatDay] = []
