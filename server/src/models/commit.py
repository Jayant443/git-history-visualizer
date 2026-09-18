from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict, Field


class Commit(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sha: str 
    short_sha: str
    message: str
    author_name: str
    author_email: str
    author_timestamp: datetime
    commit_timestamp: datetime
    parents: List[str]
    parent_count: int
    tree_sha: str
    branches: List[str]
    tags: List[str]
    commit_type: str