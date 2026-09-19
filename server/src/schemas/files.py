from typing import Optional
from pydantic import BaseModel, ConfigDict

class TreeEntry(BaseModel):
    path: str
    mode: str
    kind: str
    blob_sha: str
    size: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True)

class FileContent(BaseModel):
    commit_sha: str
    path: str
    blob_sha: str
    size: int
    binary: bool
    content: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class BlobContent(BaseModel):
    blob_sha: str
    size: int
    binary: bool
    content: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class DiffFile(BaseModel):
    path: str
    original: str = ""
    modified: str = ""
    additions: int = 0
    deletions: int = 0
    binary: bool = False

    model_config = ConfigDict(populate_by_name=True)

class CommitDiff(BaseModel):
    sha: str
    parent_sha: Optional[str] = None
    files: list[DiffFile] = []

    model_config = ConfigDict(populate_by_name=True)
