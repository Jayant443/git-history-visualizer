from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict

class Commit(BaseModel):
    id: Optional[int] = None
    sha: str 
    short_sha: str
    message: str
    author_name: str
    author_email: str
    committer_name: str = ""
    committer_email: str = ""
    author_timestamp: datetime
    commit_timestamp: datetime
    parents: List[str]
    parent_count: int
    tree_sha: str
    branches: List[str]
    tags: List[str]
    commit_type: str

    model_config = ConfigDict(populate_by_name=True)
