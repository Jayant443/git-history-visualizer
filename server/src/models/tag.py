from typing import TYPE_CHECKING, Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from src.models.commit import Commit

if TYPE_CHECKING:
    from src.models.repository import Repository

class TagBase(SQLModel):
    name: str
    message: Optional[str] = None

class Tag(TagBase, table=True):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("repository_id", "name", name="uq_tag_per_repo"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    repository_id: int = Field(foreign_key="repositories.id", index=True)
    commit_id: int = Field(foreign_key="commits.id")
    repository: "Repository" = Relationship(back_populates="tags")
    commit: Commit = Relationship()

class TagRead(TagBase):
    id: int
    commit_sha: str
