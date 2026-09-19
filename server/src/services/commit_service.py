import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import delete, func, or_, select
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

_COMMIT_ORDER = (
    Commit.committed_at.asc(),
    Commit.authored_at.asc(),
    Commit.sequence_index.asc(),
    Commit.id.asc(),
)

def _naive_utc(value: datetime) -> datetime:
    if value is None:
        return datetime(1970, 1, 1)
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)

def _normalize_author_identity(name: str, email: str) -> Tuple[str, str]:
    normalized_name = (name or "").strip()
    normalized_email = (email or "").strip().lower()
    return normalized_name, normalized_email


async def get_author(session: AsyncSession, name: str, email: str) -> Author:
    name, email = _normalize_author_identity(name, email)
    result = await session.exec(select(Author).where(Author.email == email, Author.name == name))
    author: Optional[Author] = result.first()
    if author is not None:
        return author
    author = Author(name=name, email=email)
    session.add(author)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError:
        result = await session.exec(select(Author).where(Author.email == email, Author.name == name))
        existing: Optional[Author] = result.first()
        if existing is None:
            raise
        return existing
    return author


async def _get_or_create_authors_cached(
    session: AsyncSession,
    cache: Dict[Tuple[str, str], Author],
    name: str,
    email: str,
) -> Author:
    key = _normalize_author_identity(name, email)
    cached = cache.get(key)
    if cached is not None:
        return cached
    author = await get_author(session, key[0], key[1])
    cache[key] = author
    return author


def _sort_key_for_record(record: ParsedCommit) -> Tuple[datetime, datetime, str]:
    return (
        _naive_utc(record.commit_timestamp),
        _naive_utc(record.author_timestamp),
        record.sha,
    )

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

async def persist_commits(session: AsyncSession, repository: Repository, records: List[ParsedCommit], _attempt: int = 0) -> int:
    if repository.id is None:
        await session.flush()
    if not records:
        return 0

    seen_shas: Set[str] = set()
    unique_records: List[ParsedCommit] = []
    for record in records:
        if record.sha in seen_shas:
            continue
        seen_shas.add(record.sha)
        unique_records.append(record)
    ordered = sorted(unique_records, key=_sort_key_for_record)

    shas = [record.sha for record in ordered]
    existing_result = await session.exec(
        select(Commit).where(Commit.repository_id == repository.id, Commit.sha.in_(shas))
    )
    existing_by_sha: Dict[str, Commit] = {commit.sha: commit for commit in existing_result.all()}

    author_cache: Dict[Tuple[str, str], Author] = {}
    commit_by_sha: Dict[str, Commit] = {}
    for index, record in enumerate(ordered):
        author = await _get_or_create_authors_cached(
            session, author_cache, record.author_name, record.author_email
        )
        committer = await _get_or_create_authors_cached(
            session,
            author_cache,
            record.committer_name or record.author_name,
            record.committer_email or record.author_email,
        )
        authored_at = _naive_utc(record.author_timestamp)
        committed_at = _naive_utc(record.commit_timestamp)
        is_merge = record.parent_count > 1
        existing = existing_by_sha.get(record.sha)
        if existing is not None:
            existing.short_sha = record.short_sha
            existing.summary = record.message
            existing.message = record.message
            existing.authored_at = authored_at
            existing.committed_at = committed_at
            existing.is_merge = is_merge
            existing.sequence_index = index
            existing.author_id = author.id
            existing.committer_id = committer.id
            session.add(existing)
            commit_by_sha[record.sha] = existing
            continue
        commit = Commit(
            repository_id=repository.id,
            sha=record.sha,
            short_sha=record.short_sha,
            summary=record.message,
            message=record.message,
            authored_at=authored_at,
            committed_at=committed_at,
            is_merge=is_merge,
            sequence_index=index,
            author_id=author.id,
            committer_id=committer.id,
        )
        session.add(commit)
        commit_by_sha[record.sha] = commit
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        if _attempt >= 1:
            raise
        fresh: Optional[Repository] = None
        if repository.id is not None:
            fresh = await session.get(Repository, repository.id)
        return await persist_commits(session, fresh or repository, records, _attempt + 1)

    commit_ids = [commit.id for commit in commit_by_sha.values() if commit.id is not None]
    existing_links: Set[Tuple[int, int]] = set()
    if commit_ids:
        link_result = await session.exec(
            select(CommitParentLink).where(
                or_(
                    CommitParentLink.child_id.in_(commit_ids),
                    CommitParentLink.parent_id.in_(commit_ids),
                )
            )
        )
        existing_links = {(link.child_id, link.parent_id) for link in link_result.all()}

    for record in ordered:
        child = commit_by_sha.get(record.sha)
        if child is None or child.id is None:
            continue
        ordered_parent_shas: List[str] = []
        seen_parents: Set[str] = set()
        for parent_sha in record.parents:
            if parent_sha == record.sha or parent_sha in seen_parents:
                continue
            seen_parents.add(parent_sha)
            ordered_parent_shas.append(parent_sha)
        for sequence, parent_sha in enumerate(ordered_parent_shas):
            parent = commit_by_sha.get(parent_sha)
            if parent is None:
                parent_result = await session.exec(
                    select(Commit).where(
                        Commit.repository_id == repository.id, Commit.sha == parent_sha
                    )
                )
                parent = parent_result.first()
            if parent is not None and parent.id is not None:
                if (child.id, parent.id) not in existing_links:
                    session.add(
                        CommitParentLink(child_id=child.id, parent_id=parent.id, sequence=sequence)
                    )
                    existing_links.add((child.id, parent.id))
    await session.flush()
    count_result = await session.exec(
        select(func.count(Commit.id)).where(Commit.repository_id == repository.id)
    )
    raw_total = count_result.one()
    if isinstance(raw_total, (tuple, list)):
        raw_total = raw_total[0] if raw_total else 0
    repository.commit_count = int(raw_total) if raw_total is not None else len(ordered)
    repository.updated_at = datetime.utcnow()
    session.add(repository)
    await session.commit()
    return len(ordered)

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
        .order_by(*_COMMIT_ORDER)
        .offset(offset)
        .limit(limit)
    )
    return list(result.all())


async def get_all_commits(session: AsyncSession, repository_id: int) -> List[Commit]:
    result = await session.exec(
        select(Commit)
        .where(Commit.repository_id == repository_id)
        .options(*_EAGER)
        .order_by(*_COMMIT_ORDER)
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
        .order_by(*_COMMIT_ORDER)
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
