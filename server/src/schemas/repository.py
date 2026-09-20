from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from src.core.config import config

def _ensure_clone_url(url: str) -> str:
    from src.git.repository import validate_clone_url

    return validate_clone_url(url)

def _ensure_clone_path(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    candidate = Path(value.strip())
    if not candidate.is_absolute():
        raise ValueError("clone_path must be an absolute path")
    root = Path(config.REPOSITORY_ROOT).resolve()
    try:
        candidate.resolve().relative_to(root)
    except ValueError:
        raise ValueError("clone_path must be inside the repository root")
    if candidate.resolve() == root:
        raise ValueError("clone_path must not be the repository root itself")
    return str(candidate)

class CloneRepoRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        return _ensure_clone_url(value)

class StoreRepositoryRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    name: str = Field(min_length=1, max_length=255)
    default_branch: Optional[str] = Field(default=None, max_length=255)
    clone_path: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        return _ensure_clone_url(value)

    @field_validator("clone_path")
    @classmethod
    def _validate_clone_path(cls, value: Optional[str]) -> Optional[str]:
        return _ensure_clone_path(value)
