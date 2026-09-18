from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from src.models.commit import Commit
from src.models.enums import ChangeType

class FileChangeBase(SQLModel):
    file_path: str
    old_path: Optional[str] = None
    change_type: ChangeType
    old_blob_sha: Optional[str] = None
    new_blob_sha: Optional[str] = None
    additions: int = Field(default=0)
    deletions: int = Field(default=0)
    is_binary: bool = Field(default=False)

class FileChange(FileChangeBase, table=True):
    __tablename__ = "file_changes"

    id: Optional[int] = Field(default=None, primary_key=True)
    commit_id: int = Field(foreign_key="commits.id", index=True)
    diff_text: Optional[str] = None
    commit: Commit = Relationship(back_populates="file_changes")

class FileChangeRead(FileChangeBase):
    id: int
    commit_id: int
    diff_text: Optional[str] = None
