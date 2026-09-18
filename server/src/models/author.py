from typing import TYPE_CHECKING, Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint

if TYPE_CHECKING:
    from src.models.commit import Commit

class AuthorBase(SQLModel):
    name: str
    email: str

class Author(AuthorBase, table=True):
    __tablename__ = "authors"
    __table_args__ = (UniqueConstraint("email", "name", name="uq_author_identity"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    commits_authored: list["Commit"] = Relationship(back_populates="author", sa_relationship_kwargs={"foreign_keys": "Commit.author_id"})
    commits_committed: list["Commit"] = Relationship(back_populates="committer", sa_relationship_kwargs={"foreign_keys": "Commit.committer_id"})

class AuthorRead(AuthorBase):
    id: int
