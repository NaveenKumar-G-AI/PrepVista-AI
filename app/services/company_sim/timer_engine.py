"""
PrepVista — Timer Engine (Feature #01, M2)
==========================================
Per-section countdowns + a round master clock, plus **navigation-mode
enforcement** (the rule that decides whether a candidate may move backward /
between sections). Every duration comes from the blueprint
(``Round.total_minutes`` / ``Section.minutes``); nothing is hardcoded.

The clock is *injectable* (``clock`` callable returning monotonic seconds) so the
engine is fully deterministic under test and can be driven by the live frontend
in production. It measures elapsed time and reports expiry; it does not sleep or
block — the caller ticks it.

Navigation modes (from ``Platform.navigation``):
  * ``locked_forward``      — TCS: no revisiting a submitted question or a past
                              section (question-locking).
  * ``free_within_section`` — may move around inside the active section only.
  * ``free_all``            — may move anywhere until the master clock expires.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

from app.services.company_sim.models import Platform, Round

Clock = Callable[[], float]


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION / MASTER TIMERS
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SectionTimer:
    """A single countdown for one section (or the whole round)."""

    section_id: str
    allotted_seconds: float
    _clock: Clock = time.monotonic
    _started_at: float | None = None
    _stopped_at: float | None = None

    def start(self) -> "SectionTimer":
        if self._started_at is None:
            self._started_at = self._clock()
        return self

    def stop(self) -> "SectionTimer":
        if self._started_at is not None and self._stopped_at is None:
            self._stopped_at = self._clock()
        return self

    @property
    def started(self) -> bool:
        return self._started_at is not None

    @property
    def elapsed_seconds(self) -> float:
        if self._started_at is None:
            return 0.0
        end = self._stopped_at if self._stopped_at is not None else self._clock()
        return max(end - self._started_at, 0.0)

    @property
    def remaining_seconds(self) -> float:
        return max(self.allotted_seconds - self.elapsed_seconds, 0.0)

    @property
    def expired(self) -> bool:
        return self.elapsed_seconds >= self.allotted_seconds

    @property
    def overrun_seconds(self) -> float:
        """Seconds used beyond the allotment (0 if within time)."""
        return max(self.elapsed_seconds - self.allotted_seconds, 0.0)


class NavigationError(RuntimeError):
    """Raised when a move violates the round's navigation mode."""


@dataclass
class TimerEngine:
    """
    Owns one round's master clock + its per-section timers and enforces the
    navigation rule. Construct with :meth:`for_round`, then drive with
    ``enter_section`` / ``leave_section`` / ``can_navigate_to``.
    """

    round_id: str
    navigation: str
    master: SectionTimer
    sections: dict[str, SectionTimer]
    order: list[str]
    _clock: Clock = time.monotonic
    _active: str | None = None
    _completed: set[str] = field(default_factory=set)

    # ── construction ─────────────────────────────────────────────────────────
    @classmethod
    def for_round(
        cls,
        rnd: Round,
        platform: Platform,
        *,
        clock: Clock = time.monotonic,
    ) -> "TimerEngine":
        order = [s.section_id for s in rnd.sections if s.section_id]
        # Section allotment: explicit minutes, else an even split of the round.
        explicit = {s.section_id: s.minutes for s in rnd.sections if s.minutes > 0}
        fallback = (rnd.total_minutes / len(order) / 1.0) if order else rnd.total_minutes
        sections = {
            sid: SectionTimer(
                section_id=sid,
                allotted_seconds=float(explicit.get(sid, fallback)) * 60.0,
                _clock=clock,
            )
            for sid in order
        }
        master = SectionTimer(
            section_id=f"{rnd.round_id}:master",
            allotted_seconds=float(rnd.total_minutes) * 60.0,
            _clock=clock,
        )
        return cls(
            round_id=rnd.round_id,
            navigation=platform.navigation or "free_all",
            master=master,
            sections=sections,
            order=order,
            _clock=clock,
        )

    # ── navigation policy ────────────────────────────────────────────────────
    def can_navigate_to(self, section_id: str) -> bool:
        """Whether a move to ``section_id`` is allowed under the nav mode."""
        if section_id not in self.sections:
            return False
        if self.navigation == "free_all":
            return True
        if self.navigation == "free_within_section":
            # May stay in / re-enter the active section but not a *different* one
            # once it is left; forward-only across sections.
            if section_id == self._active:
                return True
            return self._is_forward(section_id)
        # locked_forward: strictly forward, never a completed/earlier section.
        return self._is_forward(section_id)

    def _is_forward(self, section_id: str) -> bool:
        if section_id in self._completed:
            return False
        if self._active is None:
            return True
        return self.order.index(section_id) >= self.order.index(self._active)

    # ── driving the clock ────────────────────────────────────────────────────
    def start(self) -> "TimerEngine":
        self.master.start()
        return self

    def enter_section(self, section_id: str) -> SectionTimer:
        if not self.can_navigate_to(section_id):
            raise NavigationError(
                f"{self.round_id}: navigation '{self.navigation}' forbids entering "
                f"'{section_id}' (active={self._active}, completed={sorted(self._completed)})"
            )
        if self._active and self._active != section_id:
            self.leave_section()
        self._active = section_id
        return self.sections[section_id].start()

    def leave_section(self, *, complete: bool = True) -> None:
        if self._active is None:
            return
        self.sections[self._active].stop()
        if complete and self.navigation != "free_all":
            # Under any restricted mode, leaving a section locks it behind you.
            self._completed.add(self._active)
        self._active = None

    # ── reporting ────────────────────────────────────────────────────────────
    def snapshot(self) -> dict[str, dict[str, float]]:
        """Elapsed/remaining/overrun per section + master (for the record/report)."""
        out = {
            sid: {
                "allotted_s": t.allotted_seconds,
                "elapsed_s": round(t.elapsed_seconds, 3),
                "remaining_s": round(t.remaining_seconds, 3),
                "overrun_s": round(t.overrun_seconds, 3),
                "expired": float(t.expired),
            }
            for sid, t in self.sections.items()
        }
        out["_master"] = {
            "allotted_s": self.master.allotted_seconds,
            "elapsed_s": round(self.master.elapsed_seconds, 3),
            "remaining_s": round(self.master.remaining_seconds, 3),
            "overrun_s": round(self.master.overrun_seconds, 3),
            "expired": float(self.master.expired),
        }
        return out
