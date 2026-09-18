import re
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import selectinload
from sqlmodel import delete, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.models.author import Author, AuthorRead
from src.models.commit import Commit, CommitParentLink, CommitRead
from src.models.repository import Repository
from src.schemas.commit import Commit as ParsedCommit

_SHA_RE = re.compile(r"[0-9a-fA-F]+")

_EAGER = (
    selectinload(Commit.author),
    selectinload(Commit.committer),
    selectinload(Commit.parents),
)

def _naive_utc(value: datetime) -> datetime:
    if value is None:
        return datetime(1970, 1, 1)
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)

async def get_author(session: AsyncSession, name: str, email: str) -> Author:
    result = await session.exec(select(Author).where(Author.email == email, Author.name == name))
    author: Optional[Author] = result.first()
    if author is None:
        author = Author(name=name, email=email)
        session.add(author)
        await session.flush()
    return author

async def clear_commits(session: AsyncSession, repository: Repository) -> int:
    if repository.id is None:
        return 0
    existing = list((await session.exec(select(Commit).where(Commit.repository_id == repository.id))).all())
    if not existing:
        return 0
    ids = [commit.id for commit in existing if commit.id is not None]
    await session.exec(
        delete(CommitParentLink).where(or_(CommitParentLink.child_id.in_(ids), CommitParentLink.parent_id.in_(ids),)))
    for commit in existing:
        await session.delete(commit)
    await session.commit()
    return len(existing)

async def persist_commits(session: AsyncSession, repository: Repository, records: List[ParsedCommit]) -> int:
    if repository.id is None:
        await session.flush()
    commit_by_sha: dict[str, Commit] = {}
    for index, record in enumerate(records):
        author = await get_author(session, record.author_name, record.author_email)
        committer = await get_author(
            session,
            record.committer_name or record.author_name,
            record.committer_email or record.author_email,
        )
        commit = Commit(
            repository_id=repository.id,
            sha=record.sha,
            short_sha=record.short_sha,
            summary=record.message,
            message=record.message,
            authored_at=_naive_utc(record.author_timestamp),
            committed_at=_naive_utc(record.commit_timestamp),
            is_merge=record.parent_count > 1,
            sequence_index=index,
            author=author,
            committer=committer,
        )
        session.add(commit)
        commit_by_sha[record.sha] = commit
    await session.flush()
    for record in records:
        child = commit_by_sha.get(record.sha)
        if child is None or child.id is None:
            continue
        for sequence, parent_sha in enumerate(record.parents):
            parent = commit_by_sha.get(parent_sha)
            if parent is not None and parent.id is not None:
                session.add(CommitParentLink(child_id=child.id, parent_id=parent.id, sequence=sequence))
    await session.flush()
    repository.commit_count = len(records)
    repository.updated_at = datetime.utcnow()
    await session.commit()
    return len(records)

def _validate_sha(sha: str) -> str:
    sha = sha.strip()
    if not sha or _SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"{sha!r} is not a valid commit SHA")
    return sha

async def list_commits(session: AsyncSession, repository_id: int, *, limit: int = 100, offset: int = 0) -> List[Commit]:
    result = await session.exec(
        select(Commit)
        .where(Commit.repository_id == repository_id)
        .options(*_EAGER)
        .order_by(Commit.sequence_index)
        .offset(offset)
        .limit(limit)
    )
    return list(result.all())

async def get_all_commits(session: AsyncSession, repository_id: int) -> List[Commit]:
    result = await session.exec(
        select(Commit)
        .where(Commit.repository_id == repository_id)
        .options(*_EAGER)
        .order_by(Commit.sequence_index)
    )
    return list(result.all())

async def get_commit_by_short_sha(
    session: AsyncSession, repository_id: int, short_sha: str
) -> Optional[Commit]:
    short_sha = _validate_sha(short_sha)
    result = await session.exec(
        select(Commit)
        .where(Commit.repository_id == repository_id, Commit.short_sha == short_sha)
        .options(*_EAGER)
        .order_by(Commit.sequence_index)
    )
    return result.first()

def to_commit_read(commit: Commit) -> CommitRead:
    return CommitRead(
        id=commit.id,
        repository_id=commit.repository_id,
        sequence_index=commit.sequence_index,
        sha=commit.sha,
        short_sha=commit.short_sha,
        message=commit.message,
        summary=commit.summary,
        authored_at=commit.authored_at,
        committed_at=commit.committed_at,
        is_merge=commit.is_merge,
        author=(
            AuthorRead(id=commit.author.id, name=commit.author.name, email=commit.author.email)
            if commit.author is not None and commit.author.id is not None
            else None
        ),
        committer=(
            AuthorRead(
                id=commit.committer.id,
                name=commit.committer.name,
                email=commit.committer.email,
            )
            if commit.committer is not None and commit.committer.id is not None
            else None
        ),
        parent_shas=[parent.sha for parent in commit.parents],
    )
