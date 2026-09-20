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
