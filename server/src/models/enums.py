from enum import Enum

class RepoStatus(str, Enum):
    pending = "pending"
    cloning = "cloning"
    ready = "ready"
    error = "error"

class ChangeType(str, Enum):
    added = "added"
    deleted = "deleted"
    modified = "modified"
    renamed = "renamed"
    copied = "copied"
