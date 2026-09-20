from typing import Dict, List, Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
import asyncio
from src.git.refs import BranchInfo, TagInfo
from src.git.stats import get_repo_stats
from src.models.branch import Branch, BranchRead
from src.models.commit import Commit
from src.models.repository import Repository
from src.models.tag import Tag, TagRead
from src.schemas.branches import RepositoryStats, StatDay
from src.services.repository_service import get_repository

_BRANCH_EAGER = (selectinload(Branch.head_commit),)
_TAG_EAGER = (selectinload(Tag.commit),)

def _normalize_ref_name(name: str) -> str:
    return (name or "").strip()

async def _commit_id_by_sha(session: AsyncSession, repository_id: int) -> Dict[str, int]:
    result = await session.exec(select(Commit).where(Commit.repository_id == repository_id))
    return {commit.sha: commit.id for commit in result.all() if commit.id is not None}

async def persist_branches(session: AsyncSession, repository: Repository, infos: List[BranchInfo], _attempt: int = 0) -> int:
    if repository.id is None:
        await session.flush()
    seen: set[tuple[bool, str]] = set()
    unique: List[BranchInfo] = []
    for info in infos:
        name = _normalize_ref_name(info.name)
        if not name:
            continue
        key = (info.is_remote, name)
        if key in seen:
            continue
        seen.add(key)
        unique.append(BranchInfo(name=name, head_sha=info.head_sha.strip(), is_remote=info.is_remote))
    if not unique:
        return 0

    names = [info.name for info in unique]
    existing_result = await session.exec(
        select(Branch).where(Branch.repository_id == repository.id, Branch.name.in_(names))
    )
    existing_by_key: Dict[tuple[bool, str], Branch] = {
        (branch.is_remote, branch.name): branch for branch in existing_result.all()
    }
    sha_to_id = await _commit_id_by_sha(session, repository.id)

    for info in unique:
        existing = existing_by_key.get((info.is_remote, info.name))
        head_id: Optional[int] = sha_to_id.get(info.head_sha)
        if existing is not None:
            existing.head_commit_id = head_id
            existing.is_remote = info.is_remote
            session.add(existing)
            continue
        session.add(
            Branch(
                repository_id=repository.id,
                name=info.name,
                is_remote=info.is_remote,
                head_commit_id=head_id,
            )
        )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if _attempt >= 1:
            raise
        return await persist_branches(session, repository, infos, _attempt + 1)
    return len(unique)


async def persist_tags(session: AsyncSession, repository: Repository, infos: List[TagInfo], _attempt: int = 0) -> int:
    if repository.id is None:
        await session.flush()
    seen: set[str] = set()
    unique: List[TagInfo] = []
    for info in infos:
        name = _normalize_ref_name(info.name)
        if not name or name in seen:
            continue
        seen.add(name)
        unique.append(
            TagInfo(
                name=name,
                target_sha=info.target_sha.strip(),
                message=(info.message or "").strip() or None,
            )
        )
    if not unique:
        return 0

    names = [info.name for info in unique]
    existing_result = await session.exec(
        select(Tag).where(Tag.repository_id == repository.id, Tag.name.in_(names))
    )
    existing_by_name: Dict[str, Tag] = {tag.name: tag for tag in existing_result.all()}
    sha_to_id = await _commit_id_by_sha(session, repository.id)

    processed = 0
    for info in unique:
        commit_id = sha_to_id.get(info.target_sha)
        if commit_id is None:
            continue
        existing = existing_by_name.get(info.name)
        if existing is not None:
            existing.commit_id = commit_id
            existing.message = info.message
            session.add(existing)
            processed += 1
            continue
        session.add(
            Tag(
                repository_id=repository.id,
                name=info.name,
                message=info.message,
                commit_id=commit_id,
            )
        )
        processed += 1
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if _attempt >= 1:
            raise
        return await persist_tags(session, repository, infos, _attempt + 1)
    return processed

async def list_branches(session: AsyncSession, repository_id: int) -> List[Branch]:
    result = await session.exec(
        select(Branch)
        .where(Branch.repository_id == repository_id)
        .options(*_BRANCH_EAGER)
        .order_by(Branch.is_remote.asc(), Branch.name.asc())
    )
    return list(result.all())

async def list_tags(session: AsyncSession, repository_id: int) -> List[Tag]:
    result = await session.exec(
        select(Tag)
        .where(Tag.repository_id == repository_id)
        .options(*_TAG_EAGER)
        .order_by(Tag.name.asc())
    )
    return list(result.all())

def to_branch_read(branch: Branch) -> BranchRead:
    return BranchRead(
        id=branch.id,
        name=branch.name,
        is_remote=branch.is_remote,
        head_commit_sha=branch.head_commit.sha if branch.head_commit is not None else None,
    )

def to_tag_read(tag: Tag) -> TagRead:
    return TagRead(
        id=tag.id,
        name=tag.name,
        message=tag.message,
        commit_sha=tag.commit.sha,
    )

async def get_repository_stats(session: AsyncSession, repository_id: int, branch: Optional[str] = None) -> RepositoryStats:
    repository = await get_repository(session, repository_id)
    if repository is None or repository.id is None:
        raise LookupError("Repository not found")
    if not repository.clone_path:
        raise ValueError("Repository has no local clone")
    scope = (branch or "").strip()
    rev: Optional[str] = None
    if scope and scope.lower() != "all":
        result = await session.exec(select(Branch).where(Branch.repository_id == repository.id, Branch.name == scope))
        branch_row = result.first()
        if branch_row is None:
            raise LookupError(f"No branch {scope!r}")
        namespace = "refs/remotes" if branch_row.is_remote else "refs/heads"
        rev = f"{namespace}/{branch_row.name}"
    stats = await asyncio.to_thread(get_repo_stats, repository.clone_path, rev)
    return RepositoryStats(
        total=stats.total,
        merges=stats.merges,
        contributors=stats.contributors,
        active_days=stats.active_days,
        first_day=stats.first_day,
        last_day=stats.last_day,
        scope=scope if rev is not None else "all",
        days=[StatDay(date=d.date, count=d.count, authors=list(d.authors)) for d in stats.days],
    )
