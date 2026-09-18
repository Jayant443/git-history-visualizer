from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from src.models.commit import Commit
from src.models.repository import Repository

class BranchBase(SQLModel):
    name: str
    is_remote: bool = Field(default=False)

class Branch(BranchBase, table=True):
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("repository_id", "name", name="uq_branch_per_repo"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    repository_id: int = Field(foreign_key="repositories.id", index=True)
    head_commit_id: Optional[int] = Field(default=None, foreign_key="commits.id")
    repository: Repository = Relationship(back_populates="branches")
    head_commit: Optional[Commit] = Relationship()

class BranchRead(BranchBase):
    id: int
    head_commit_sha: Optional[str] = None
