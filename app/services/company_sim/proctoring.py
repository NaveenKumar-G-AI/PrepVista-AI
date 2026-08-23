"""
PrepVista — Proctoring Hook (Feature #01, M2)
=============================================
A **conservative** proctoring monitor that applies each company's real
``tab_switch_policy`` to focus-loss / integrity events during a company session.

Design stance (mirrors the app's ``integrity_config.json`` philosophy exactly —
never auto-penalise a score; only *flag for human review*):

  * ``terminate`` — TCS: a tab switch ENDS the exam. This is a hard, real rule of
    the platform (not a scoring penalty), so the monitor emits a ``TERMINATE``
    action the orchestrator honours by stopping the session at that round.
  * ``warn``      — surface a warning to the candidate; no score effect.
  * ``flag``      — silently record a review flag (Amazon-style); no score effect.
  * ``none``      — record for telemetry only.

The monitor NEVER changes a round score. Termination is a process rule, not a
punishment. In production this hook can delegate the raw signal set to the app's
``integrity_monitor`` — kept import-free here to preserve the package's isolation
(nothing outside imports in; nothing here imports the app).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ProctorAction(str, Enum):
    NONE = "none"
    RECORD = "record"
    WARN = "warn"
    FLAG = "flag"
    TERMINATE = "terminate"


# Which action a policy takes on a *focus-loss / tab-switch* event.
_POLICY_ACTION: dict[str, ProctorAction] = {
    "terminate": ProctorAction.TERMINATE,
    "warn": ProctorAction.WARN,
    "flag": ProctorAction.FLAG,
    "none": ProctorAction.RECORD,
}


@dataclass
class ProctorEvent:
    round_id: str
    kind: str                 # e.g. "tab_switch", "focus_loss", "paste", "multi_face"
    action: ProctorAction
    detail: str = ""


@dataclass
class ProctoringMonitor:
    """One monitor per company session. Conservative: flags, never penalises."""

    tab_switch_policy: str = "none"
    proctored: bool = False
    events: list[ProctorEvent] = field(default_factory=list)
    terminated_at_round: str | None = None

    def _record(self, ev: ProctorEvent) -> ProctorEvent:
        self.events.append(ev)
        if ev.action == ProctorAction.TERMINATE and self.terminated_at_round is None:
            self.terminated_at_round = ev.round_id
        return ev

    def tab_switch(self, round_id: str, detail: str = "") -> ProctorEvent:
        """Handle a tab-switch / focus-loss under this company's policy."""
        action = _POLICY_ACTION.get(self.tab_switch_policy, ProctorAction.RECORD)
        return self._record(ProctorEvent(round_id, "tab_switch", action, detail))

    def integrity_signal(self, round_id: str, kind: str, detail: str = "") -> ProctorEvent:
        """
        Record a non-tab integrity signal (paste, multiple faces, second voice…).
        Always a review FLAG when proctored — never a termination, never a score
        change (conservative, matches ``integrity_config.json``).
        """
        action = ProctorAction.FLAG if self.proctored else ProctorAction.RECORD
        return self._record(ProctorEvent(round_id, kind, action, detail))

    # ── reporting ──────────────────────────────────────────────────────────────
    @property
    def terminated(self) -> bool:
        return self.terminated_at_round is not None

    def flags_for_review(self) -> list[ProctorEvent]:
        """Events a TPO should see (flag/terminate/warn); student view stays clean."""
        return [
            e for e in self.events
            if e.action in (ProctorAction.FLAG, ProctorAction.WARN, ProctorAction.TERMINATE)
        ]

    def summary(self) -> dict[str, object]:
        by_kind: dict[str, int] = {}
        for e in self.events:
            by_kind[e.kind] = by_kind.get(e.kind, 0) + 1
        return {
            "policy": self.tab_switch_policy,
            "proctored": self.proctored,
            "total_events": len(self.events),
            "by_kind": by_kind,
            "review_flags": len(self.flags_for_review()),
            "terminated_at_round": self.terminated_at_round,
        }
