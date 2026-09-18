from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from src.models.author import Author, AuthorRead

if TYPE_CHECKING:
    from src.models.repository import Repository
    from src.models.file_change import FileChange

class CommitParentLink(SQLModel, table=True):
    __tablename__ = "commit_parent_links"

    child_id: int = Field(foreign_key="commits.id", primary_key=True)
    parent_id: int = Field(foreign_key="commits.id", primary_key=True)
    sequence: int = Field(default=0)

class CommitBase(SQLModel):
    sha: str
    message: str
    summary: str
    authored_at: datetime
    committed_at: datetime
    is_merge: bool = Field(default=False)

class Commit(CommitBase, table=True):
    __tablename__ = "commits"
    __table_args__ = (UniqueConstraint("repository_id", "sha", name="uq_commit_sha_per_repo"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    repository_id: int = Field(foreign_key="repositories.id", index=True)
    author_id: Optional[int] = Field(default=None, foreign_key="authors.id")
    committer_id: Optional[int] = Field(default=None, foreign_key="authors.id")
    sequence_index: int = Field(index=True)
    repository: "Repository" = Relationship(back_populates="commits")
    author: Optional[Author] = Relationship(back_populates="commits_authored", sa_relationship_kwargs={"foreign_keys": "Commit.author_id"})
    committer: Optional[Author] = Relationship(back_populates="commits_committed", sa_relationship_kwargs={"foreign_keys": "Commit.committer_id"},)
    file_changes: list["FileChange"] = Relationship(back_populates="commit")
    parents: list["Commit"] = Relationship(
        back_populates="children",
        link_model=CommitParentLink,
        sa_relationship_kwargs={
            "primaryjoin": "Commit.id==CommitParentLink.child_id",
            "secondaryjoin": "Commit.id==CommitParentLink.parent_id",
        },
    )
    children: list["Commit"] = Relationship(
        back_populates="parents",
        link_model=CommitParentLink,
        sa_relationship_kwargs={
            "primaryjoin": "Commit.id==CommitParentLink.parent_id",
            "secondaryjoin": "Commit.id==CommitParentLink.child_id",
        },
    )

class CommitRead(CommitBase):
    id: int
    repository_id: int
    sequence_index: int
    author: Optional[AuthorRead] = None
    committer: Optional[AuthorRead] = None
    parent_shas: list[str] = []
