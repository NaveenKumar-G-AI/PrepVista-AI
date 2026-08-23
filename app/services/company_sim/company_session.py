"""
PrepVista — Company Session Orchestrator (Feature #01, M2)
==========================================================
The *blueprint interpreter*. Given a ``CompanyBlueprint`` and a target track, it
walks the track's rounds in order and, for each round:

  1. builds the round's ``TimerEngine`` (per-section clocks + navigation mode),
  2. resolves the round's simulator from the registry (fallback if none yet),
  3. plays the round → a normalized ``RoundResult``,
  4. applies the round's ``negative_marking`` to any MCQ tally,
  5. applies the platform's proctoring policy (a scripted tab-switch can TERMINATE),
  6. resolves the round's ``gate_rule`` → cleared-floor / cleared-target / attained-track,
  7. if it is an elimination round and the *floor* bar was missed, STOPS the
     session and records **"eliminated at round X"**.

It then hands the walked timeline to the M5 :mod:`outcome_resolver`, which reads
the blueprint's ``outcome_model`` to produce the predicted track, confidence,
concrete gap-to-next-track, and per-attribute breakdown (Dossier Part 6). The
persistable ``CompanySessionRecord`` carries the round-by-round timeline, that
resolution, cleared/failed gates, and the proctoring summary.

GATE SEMANTICS (M2, documented on purpose)
------------------------------------------
Real service processes (TCS Ninja/Digital/Prime, Infosys SE/SP/DSE …) do not
eliminate you for missing your *ambition* — they down-track you. So a gate is
resolved at two bars:
  * **floor**  — the easiest track's bar in this gate. Missing it on an
    elimination round ends the process (you couldn't clear the minimum).
  * **target** — the bar for the track the student aimed at. Clearing the floor
    but missing the target keeps you in the process but caps the attainable track.

Pure stdlib, deterministic, never raises out of ``run_session`` (a failed
simulator degrades to the fallback; a genuinely broken round is recorded, not
crashed).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from app.services.company_sim.models import CompanyBlueprint, GateRule, Round
from app.services.company_sim.negative_marking import apply_negative_marking
from app.services.company_sim.outcome_resolver import (
    resolve_outcome,
    track_order_high_to_low,
)
from app.services.company_sim.proctoring import ProctorAction, ProctoringMonitor
from app.services.company_sim.simulators import (
    CandidateModel,
    RoundResult,
    SimContext,
    resolve_simulator,
)
from app.services.company_sim.timer_engine import TimerEngine

VERDICT_SCALE = (
    "strong_no_hire", "no_hire", "leaning_no_hire", "leaning_hire", "hire", "strong_hire",
)

# Scripted proctor events for a run: {round_id: [(kind, detail), ...]}.
ProctorScript = dict[str, list[tuple[str, str]]]


# ═══════════════════════════════════════════════════════════════════════════════
# GATE RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class GateOutcome:
    gate_type: str
    cleared_floor: bool          # cleared the easiest bar → NOT eliminated
    cleared_target: bool         # cleared the target track's bar
    attained_track: str | None   # highest track bar cleared in this round
    cleared_tracks: list[str] = field(default_factory=list)
    reason: str = ""
    detail: dict[str, Any] = field(default_factory=dict)


def _verdict_index(v: str) -> int:
    return VERDICT_SCALE.index(v) if v in VERDICT_SCALE else 0


def _track_bars(gate: GateRule, result: RoundResult) -> dict[str, bool]:
    """
    For a per-track gate, return {track: cleared?}. Empty for scalar gates
    (rubric/veto/committee/none), which are handled by :func:`_scalar_pass`.
    """
    p = gate.params or {}
    ev = result.evidence or {}
    bars: dict[str, bool] = {}

    if gate.type == "coding_count":
        need = p.get("min_solved_by_track") or {}
        solved = int(ev.get("solved", 0))
        for tk, n in need.items():
            bars[tk] = solved >= int(n)
    elif gate.type in ("sectional", "overall", "sectional_and_overall"):
        cutoffs = p.get("min_percentile_by_track") or {}
        overall_pct = float(ev.get("percentile", 0.0))
        for tk, spec in cutoffs.items():
            ok = True
            if isinstance(spec, dict):
                for key, cut in spec.items():
                    if key == "overall":
                        ok = ok and overall_pct >= float(cut)
                    else:  # a section_id cutoff → section score (0..10) → percentile
                        sec_pct = min(max(result.sub_scores.get(key, 0.0) * 10.0, 1.0), 99.0)
                        ok = ok and sec_pct >= float(cut)
            else:  # a bare number == overall cutoff
                ok = overall_pct >= float(spec)
            bars[tk] = ok
    return bars


def _scalar_pass(gate: GateRule, result: RoundResult) -> bool:
    """Pass/fail for gates that are not per-track."""
    p = gate.params or {}
    if gate.type in ("rubric", "veto"):
        return result.score_0_10 >= float(p.get("min_score_0_10", 5.0))
    if gate.type == "committee":
        threshold = p.get("hire_threshold", "leaning_hire")
        verdict = str((result.evidence or {}).get("verdict", "no_hire"))
        return _verdict_index(verdict) >= _verdict_index(str(threshold))
    if gate.type == "coding_count":  # scalar fallback when no track map given
        return int((result.evidence or {}).get("solved", 0)) >= int(p.get("min_solved", 1))
    return True  # "none" / unknown → non-blocking


def resolve_gate(
    gate: GateRule | None,
    result: RoundResult,
    *,
    target_track: str,
    order_high_to_low: list[str],
) -> GateOutcome:
    """Resolve a round's gate to floor/target clearance + the attained track."""
    if gate is None or gate.type in ("none", ""):
        return GateOutcome("none", True, True, target_track, [target_track],
                           reason="no gate")

    bars = _track_bars(gate, result)
    if bars:
        cleared = [tk for tk, ok in bars.items() if ok]
        present = [tk for tk in order_high_to_low if tk in bars] or list(bars.keys())
        floor_track = present[-1]  # easiest bar
        cleared_floor = bars.get(floor_track, True)
        cleared_target = bars.get(target_track, cleared_floor)
        attained = next((tk for tk in order_high_to_low if tk in cleared), None)
        if attained is None and cleared:
            attained = cleared[0]
        return GateOutcome(
            gate.type, cleared_floor, cleared_target, attained, sorted(cleared),
            reason=(
                f"cleared floor '{floor_track}'={cleared_floor}; "
                f"target '{target_track}'={cleared_target}; attained={attained}"
            ),
            detail={"bars": bars, **({} if "percentile" not in (result.evidence or {})
                                     else {"percentile": result.evidence["percentile"]})},
        )

    ok = _scalar_pass(gate, result)
    return GateOutcome(
        gate.type, ok, ok, (target_track if ok else None),
        [target_track] if ok else [],
        reason=f"{gate.type} scalar pass={ok} (score {result.score_0_10}/10)",
        detail={k: v for k, v in (result.evidence or {}).items()
                if k in ("verdict", "solved", "percentile")},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# RECORDS
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class RoundOutcome:
    order: int
    round_id: str
    round_type: str
    label: str
    is_elimination: bool
    result: RoundResult
    gate: GateOutcome
    status: str                       # "cleared" | "downgraded" | "eliminated" | "terminated"
    negative_marking: dict[str, Any] = field(default_factory=dict)
    timers: dict[str, Any] = field(default_factory=dict)
    proctor_actions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "order": self.order,
            "round_id": self.round_id,
            "round_type": self.round_type,
            "label": self.label,
            "is_elimination": self.is_elimination,
            "status": self.status,
            "score_0_10": round(self.result.score_0_10, 2),
            "gate": {
                "type": self.gate.gate_type,
                "cleared_floor": self.gate.cleared_floor,
                "cleared_target": self.gate.cleared_target,
                "attained_track": self.gate.attained_track,
                "reason": self.gate.reason,
            },
            "negative_marking": self.negative_marking,
            "result": self.result.to_dict(),
            "proctor_actions": self.proctor_actions,
        }


@dataclass
class CompanySessionRecord:
    company_id: str
    display_name: str
    target_track: str
    candidate: str
    rounds: list[RoundOutcome] = field(default_factory=list)
    eliminated_at: str | None = None
    terminated_at: str | None = None
    completed: bool = False
    predicted_track: str | None = None
    predicted_label: str = ""
    next_track: str | None = None
    next_label: str = ""
    confidence: float = 0.0
    gap_to_next_track: list[str] = field(default_factory=list)
    gap_hint: str = ""
    attribute_breakdown: dict[str, float] = field(default_factory=dict)
    verdict: str | None = None
    cleared_gates: list[str] = field(default_factory=list)
    failed_gate: str | None = None
    proctoring: dict[str, Any] = field(default_factory=dict)
    outcome: dict[str, Any] = field(default_factory=dict)   # full resolver payload
    format_confidence: float = 0.0
    last_verified: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "company_id": self.company_id,
            "display_name": self.display_name,
            "target_track": self.target_track,
            "candidate": self.candidate,
            "completed": self.completed,
            "eliminated_at": self.eliminated_at,
            "terminated_at": self.terminated_at,
            "predicted_track": self.predicted_track,
            "predicted_label": self.predicted_label,
            "next_track": self.next_track,
            "next_label": self.next_label,
            "confidence": round(self.confidence, 2),
            "gap_to_next_track": self.gap_to_next_track,
            "gap_hint": self.gap_hint,
            "attribute_breakdown": {k: round(v, 1) for k, v in self.attribute_breakdown.items()},
            "verdict": self.verdict,
            "cleared_gates": self.cleared_gates,
            "failed_gate": self.failed_gate,
            "format_confidence": self.format_confidence,
            "last_verified": self.last_verified,
            "proctoring": self.proctoring,
            "outcome": self.outcome,
            "rounds": [r.to_dict() for r in self.rounds],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

def run_session(
    blueprint: CompanyBlueprint,
    *,
    target_track: str | None = None,
    candidate: CandidateModel | None = None,
    proctor_script: ProctorScript | None = None,
    clock: Callable[[], float] = time.monotonic,
    skins: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> CompanySessionRecord:
    """
    Run one complete company session and return its record. Never raises: a
    simulator that errors degrades to the fallback so the session always finishes
    with a verdict (Dossier §17 "sessions never break on failure").
    """
    candidate = candidate or CandidateModel()
    proctor_script = proctor_script or {}
    target_track = target_track or _default_target(blueprint)
    order_high_to_low = track_order_high_to_low(blueprint)

    proctor = ProctoringMonitor(
        tab_switch_policy=blueprint.platform.tab_switch_policy,
        proctored=blueprint.platform.proctored,
    )

    record = CompanySessionRecord(
        company_id=blueprint.company_id,
        display_name=blueprint.display_name,
        target_track=target_track,
        candidate=candidate.name,
        format_confidence=blueprint.format_confidence,
        last_verified=blueprint.last_verified,
    )

    for rnd in blueprint.rounds_for_track(target_track):
        # 1) timers (built + started so the record carries an honest snapshot)
        timers = TimerEngine.for_round(rnd, blueprint.platform, clock=clock).start()

        # 2) proctoring — scripted events for this round (e.g. a tab switch)
        proctor_actions: list[str] = []
        for kind, detail in proctor_script.get(rnd.round_id, []):
            ev = (proctor.tab_switch(rnd.round_id, detail) if kind == "tab_switch"
                  else proctor.integrity_signal(rnd.round_id, kind, detail))
            proctor_actions.append(ev.action.value)

        # 3) play the round (registry → fallback), degrading gracefully on error
        prior_results = [ro.result for ro in record.rounds]
        result = _play(rnd, blueprint, target_track, candidate, skins, prior_results)

        # 4) negative marking on any MCQ tally
        nm_summary = _apply_negative_marking(rnd, result)

        # 5) resolve the gate
        gate = resolve_gate(
            rnd.gate_rule, result,
            target_track=target_track, order_high_to_low=order_high_to_low,
        )

        # 6) proctoring termination (TCS-style tab-switch=terminate) wins immediately
        if proctor.terminated and proctor.terminated_at_round == rnd.round_id:
            record.rounds.append(RoundOutcome(
                rnd.order, rnd.round_id, rnd.round_type, rnd.label, rnd.is_elimination,
                result, gate, status="terminated", negative_marking=nm_summary,
                timers=timers.snapshot(), proctor_actions=proctor_actions,
            ))
            record.terminated_at = rnd.round_id
            record.failed_gate = rnd.round_id
            break

        # 7) elimination on missing the floor bar
        if rnd.is_elimination and not gate.cleared_floor:
            record.rounds.append(RoundOutcome(
                rnd.order, rnd.round_id, rnd.round_type, rnd.label, rnd.is_elimination,
                result, gate, status="eliminated", negative_marking=nm_summary,
                timers=timers.snapshot(), proctor_actions=proctor_actions,
            ))
            record.eliminated_at = rnd.round_id
            record.failed_gate = rnd.round_id
            break

        status = "cleared" if gate.cleared_target else "downgraded"
        record.rounds.append(RoundOutcome(
            rnd.order, rnd.round_id, rnd.round_type, rnd.label, rnd.is_elimination,
            result, gate, status=status, negative_marking=nm_summary,
            timers=timers.snapshot(), proctor_actions=proctor_actions,
        ))
        record.cleared_gates.append(rnd.round_id)
    else:
        # loop finished without break → the candidate sat every round
        record.completed = True

    # M5: full outcome_model resolution → predicted track, confidence, concrete
    # gap-to-next, and per-attribute breakdown (Dossier Part 6).
    resolution = resolve_outcome(
        blueprint, record.rounds,
        target_track=target_track,
        completed=record.completed,
        eliminated_at=record.eliminated_at,
        terminated_at=record.terminated_at,
        cleared_gates=record.cleared_gates,
        failed_gate=record.failed_gate,
        context=context,
    )
    record.predicted_track = resolution.predicted_track
    record.predicted_label = resolution.predicted_label
    record.next_track = resolution.next_track
    record.next_label = resolution.next_label
    record.confidence = resolution.confidence
    record.gap_to_next_track = resolution.gap_to_next_track
    record.gap_hint = resolution.gap_hint
    record.attribute_breakdown = resolution.attribute_breakdown
    record.verdict = resolution.verdict
    record.outcome = resolution.to_dict()
    record.proctoring = proctor.summary()
    return record


# ── helpers ───────────────────────────────────────────────────────────────────

def _play(rnd, blueprint, target_track, candidate, skins, prior_results=None) -> RoundResult:
    sim = resolve_simulator(rnd.round_type)
    aia = rnd.ai_assistance_allowed
    if aia is None:
        aia = blueprint.ai_assistance_allowed
    ctx = SimContext(
        blueprint=blueprint, round=rnd, track=target_track, candidate=candidate,
        ai_assistance_allowed=aia,
        skin=(skins or {}).get(blueprint.platform.emulation_profile, {}),
        prior_results=list(prior_results or []),
    )
    try:
        return sim.simulate(ctx)
    except Exception as exc:  # never break a session — degrade to fallback
        from app.services.company_sim.simulators import FallbackSimulator
        res = FallbackSimulator().simulate(ctx)
        res.rubric_notes += f" [recovered from simulator error: {exc!r}]"
        res.evidence["simulator_error"] = repr(exc)
        return res


def _apply_negative_marking(rnd: Round, result: RoundResult) -> dict[str, Any]:
    """Apply the round's negative marking to each MCQ-style section tally."""
    nm = rnd.negative_marking
    sections = (result.evidence or {}).get("sections", {})
    applied: dict[str, Any] = {"model": nm.model, "enabled": nm.enabled, "sections": {}}
    if not nm.enabled or nm.model == "none":
        return applied
    for sid, ev in sections.items():
        if "correct" not in ev:
            continue
        mr = apply_negative_marking(
            nm, correct=int(ev.get("correct", 0)), wrong=int(ev.get("wrong", 0)),
        )
        applied["sections"][sid] = {
            "adjusted_fraction": round(mr.adjusted_fraction, 3),
            "penalised": mr.penalised_count,
        }
        # reflect the penalty back into the section sub-score so gates see it
        result.sub_scores[sid] = round(mr.adjusted_fraction * 10.0, 2)
    return applied


def _default_target(blueprint: CompanyBlueprint) -> str:
    order = track_order_high_to_low(blueprint)
    return order[0] if order else ""
