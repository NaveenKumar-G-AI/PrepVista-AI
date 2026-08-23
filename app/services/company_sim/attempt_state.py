"""
PrepVista — Attempt State (Feature #01, M2)
===========================================
Tracks the per-item state of a round — *answered*, *locked*, *flagged*, *skipped*
— and enforces the **no-revisit** rule where the platform demands it
(``navigation == "locked_forward"``: TCS question-locking). This is the
book-keeping the live frontend and the session orchestrator share so that
"cannot revisit a submitted question" is enforced identically everywhere.

Pure stdlib, no I/O. One ``AttemptState`` per round; items are addressed by a
stable key (usually ``f"{section_id}:{index}"``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ItemStatus(str, Enum):
    UNSEEN = "unseen"
    SEEN = "seen"          # presented, not yet answered
    ANSWERED = "answered"  # an answer recorded
    FLAGGED = "flagged"    # marked for review (only meaningful if revisit allowed)
    LOCKED = "locked"      # submitted & no longer editable (locked_forward)
    SKIPPED = "skipped"    # moved past without answering (locked when forward-only)


class RevisitError(RuntimeError):
    """Raised when a revisit/edit is attempted on a locked item."""


@dataclass
class AttemptState:
    """Per-round item ledger + navigation-aware locking."""

    navigation: str = "free_all"
    status: dict[str, ItemStatus] = field(default_factory=dict)
    answers: dict[str, object] = field(default_factory=dict)

    @property
    def _forward_only(self) -> bool:
        return self.navigation in ("locked_forward", "free_within_section")

    # ── lifecycle ────────────────────────────────────────────────────────────
    def see(self, key: str) -> None:
        """Mark an item as presented (idempotent; never downgrades)."""
        if self.status.get(key, ItemStatus.UNSEEN) == ItemStatus.UNSEEN:
            self.status[key] = ItemStatus.SEEN

    def can_edit(self, key: str) -> bool:
        """Whether ``key`` may still be answered/changed."""
        return self.status.get(key, ItemStatus.UNSEEN) not in (
            ItemStatus.LOCKED,
            ItemStatus.SKIPPED,
        )

    def answer(self, key: str, value: object) -> None:
        """Record/overwrite an answer. Raises on a locked item."""
        if not self.can_edit(key):
            raise RevisitError(
                f"item '{key}' is {self.status.get(key).value}; navigation "
                f"'{self.navigation}' forbids revisiting it."
            )
        self.answers[key] = value
        self.status[key] = ItemStatus.ANSWERED

    def flag(self, key: str) -> None:
        """Flag for review. A no-op label under forward-only navigation (you
        cannot come back), but still recorded for the report."""
        self.see(key)
        if self.can_edit(key) and self.status.get(key) != ItemStatus.ANSWERED:
            self.status[key] = ItemStatus.FLAGGED

    def advance_past(self, key: str) -> None:
        """
        Leave an item. Under forward-only navigation this LOCKS it (answered) or
        SKIPS it (unanswered) so it can never be revisited; under ``free_all`` it
        simply stays editable.
        """
        cur = self.status.get(key, ItemStatus.UNSEEN)
        if not self._forward_only:
            return
        if cur == ItemStatus.ANSWERED:
            self.status[key] = ItemStatus.LOCKED
        else:
            self.status[key] = ItemStatus.SKIPPED

    def lock_all(self) -> None:
        """Lock every seen/answered item (round submitted)."""
        for key, st in list(self.status.items()):
            if st == ItemStatus.ANSWERED:
                self.status[key] = ItemStatus.LOCKED
            elif st in (ItemStatus.SEEN, ItemStatus.FLAGGED, ItemStatus.UNSEEN):
                self.status[key] = ItemStatus.SKIPPED

    # ── tallies ──────────────────────────────────────────────────────────────
    def counts(self) -> dict[str, int]:
        """Count of items in each status (for the timeline/report)."""
        out = {s.value: 0 for s in ItemStatus}
        for st in self.status.values():
            out[st.value] += 1
        return out

    @property
    def answered_count(self) -> int:
        return sum(
            1 for st in self.status.values()
            if st in (ItemStatus.ANSWERED, ItemStatus.LOCKED)
        )
