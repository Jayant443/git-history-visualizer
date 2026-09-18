from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from src.models.enums import RepoStatus
from src.models.commit import Commit
from src.models.branch import Branch
from src.models.tag import Tag

class RepositoryBase(SQLModel):
    url: str = Field(index=True)
    name: str
    default_branch: Optional[str] = None

class Repository(RepositoryBase, table=True):
    __tablename__ = "repositories"
    __table_args__ = (UniqueConstraint("url", name="uq_repository_url"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    status: RepoStatus = Field(default=RepoStatus.pending)
    error_message: Optional[str] = None
    clone_path: Optional[str] = None
    commit_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    commits: list["Commit"] = Relationship(back_populates="repository")
    branches: list["Branch"] = Relationship(back_populates="repository")
    tags: list["Tag"] = Relationship(back_populates="repository")

class RepositoryCreate(SQLModel):
    url: str

class RepositoryRead(RepositoryBase):
    id: int
    status: RepoStatus
    error_message: Optional[str] = None
    commit_count: int
    created_at: datetime
    updated_at: datetime
