from pydantic import BaseModel
from typing import Optional

class CloneRepoRequest(BaseModel):
    url: str

class StoreRepositoryRequest(BaseModel):
    url: str
    name: str
    default_branch: Optional[str] = None
    clone_path: Optional[str] = None
