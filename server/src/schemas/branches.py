from typing import List
from src.models.commit import CommitRead


class CommitWithBranches(CommitRead):
    """Commit payload with branch containment attached.

    `branches` lists every branch whose tip reaches this commit via
    parent links (sorted by name), so the frontend learns both how many
    branches exist and where each commit sits. Purely additive —
    clients unaware of the field ignore it.
    """

    branches: List[str] = []
