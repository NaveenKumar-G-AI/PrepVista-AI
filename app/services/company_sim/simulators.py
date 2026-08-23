"""
PrepVista — Round Simulators: contract + registry + deterministic fallback (M2)
===============================================================================
Every round type is played by a **simulator** that returns one *normalized*
``RoundResult`` (Dossier §7): ``{score_0_10, sub_scores, strengths, improvements,
rubric_notes, evidence}``. Because the shape is uniform, scoring, gate-resolution
and reporting never care *which* round they are looking at.

This module ships:
  * ``RoundResult`` — the normalized contract every simulator returns.
  * ``SimContext``  — everything a simulator is handed (blueprint, round, track,
                      candidate, resolved ai-assistance flag, platform skin).
  * ``RoundSimulator`` — the tiny protocol a simulator implements.
  * ``FallbackSimulator`` — a deterministic, LLM-free simulator that plays ANY
                            round from a ``CandidateModel``. It is what guarantees
                            "a session never breaks" and it is what makes a
                            text-only end-to-end run possible in M2.
  * a ``registry`` — ``register_simulator`` / ``resolve_simulator``. M3+ register
                     the real (reused + net-new) simulators per round_type; until
                     then every round resolves to the fallback. **Adding a real
                     simulator never touches the orchestrator.**

Pure stdlib, deterministic (seeded), no I/O.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from app.services.company_sim.models import CompanyBlueprint, Round, Section

# The Google/Amazon committee scale, low → high. Shared so the resolver + report
# speak the same vocabulary.
VERDICT_SCALE: tuple[str, ...] = (
    "strong_no_hire", "no_hire", "leaning_no_hire", "leaning_hire", "hire", "strong_hire",
)

# difficulty_profile → an ability multiplier (harder rounds depress performance).
_DIFFICULTY_FACTOR: dict[str, float] = {
    "easy": 1.10, "medium": 1.00, "mixed": 0.95, "hard": 0.85,
}


def _roll(*parts: object) -> float:
    """Deterministic pseudo-random in [0,1) from a tuple of keys (seed-stable)."""
    h = hashlib.md5("::".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


# ═══════════════════════════════════════════════════════════════════════════════
# NORMALIZED RESULT
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class RoundResult:
    """The single shape every round simulator returns (Dossier §7)."""

    round_id: str
    round_type: str
    score_0_10: float
    sub_scores: dict[str, float] = field(default_factory=dict)   # by section_id / dim
    strengths: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    rubric_notes: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)       # solved, percentile, verdict…
    max_score_0_10: float = 10.0

    @property
    def fraction(self) -> float:
        return _clamp(self.score_0_10 / self.max_score_0_10) if self.max_score_0_10 else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "round_id": self.round_id,
            "round_type": self.round_type,
            "score_0_10": round(self.score_0_10, 2),
            "sub_scores": {k: round(v, 2) for k, v in self.sub_scores.items()},
            "strengths": self.strengths,
            "improvements": self.improvements,
            "rubric_notes": self.rubric_notes,
            "evidence": self.evidence,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CANDIDATE MODEL (drives deterministic text-only play + tests)
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CandidateModel:
    """
    A deterministic ability profile used by the ``FallbackSimulator`` to play a
    session without a human or an LLM. ``ability`` maps a competency tag (the
    schema's ``Section.competency``) to a 0..1 skill; unknown competencies fall
    back to ``default_ability``. ``seed`` makes a run reproducible.

    In M3+ real simulators ignore this and consume real answers; it exists so the
    engine can be proven end-to-end and unit-tested deterministically now.
    """

    name: str = "candidate"
    ability: dict[str, float] = field(default_factory=dict)
    default_ability: float = 0.6
    seed: int = 0
    jitter: float = 0.08  # ± deterministic variation so sections differ realistically

    def ability_for(self, competency: str) -> float:
        return _clamp(self.ability.get(competency, self.default_ability))

    def section_ability(self, round_id: str, sec: Section, difficulty: float) -> float:
        base = self.ability_for(sec.competency)
        jit = (_roll(self.seed, round_id, sec.section_id) - 0.5) * 2.0 * self.jitter
        return _clamp((base + jit) * difficulty)


# ═══════════════════════════════════════════════════════════════════════════════
# SIMULATOR CONTEXT + PROTOCOL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SimContext:
    """Everything a simulator needs to play one round."""

    blueprint: CompanyBlueprint
    round: Round
    track: str
    candidate: CandidateModel
    ai_assistance_allowed: bool
    skin: dict[str, Any] = field(default_factory=dict)
    # Results of the rounds already played this session, in order. Outcome-style
    # rounds (hiring_committee, bar-raiser debrief) assemble a packet from these.
    prior_results: list["RoundResult"] = field(default_factory=list)


@runtime_checkable
class RoundSimulator(Protocol):
    """A round player. ``round_types`` it can handle is advertised by the registry."""

    def simulate(self, ctx: SimContext) -> RoundResult: ...


# ═══════════════════════════════════════════════════════════════════════════════
# DETERMINISTIC FALLBACK SIMULATOR (plays ANY round type)
# ═══════════════════════════════════════════════════════════════════════════════

class FallbackSimulator:
    """
    Plays any round from the ``CandidateModel``. Produces a normalized result rich
    enough to resolve every gate type: per-section ``sub_scores``, an mcq
    correct/wrong tally, a coding ``solved`` count, a ``percentile`` estimate, and
    a 6-point committee ``verdict``. Never raises, never calls out — the safety net
    that keeps a session alive if a real simulator is missing or errors.
    """

    def simulate(self, ctx: SimContext) -> RoundResult:
        rnd = ctx.round
        difficulty = _DIFFICULTY_FACTOR.get(rnd.difficulty_profile, 0.95)
        sub_scores: dict[str, float] = {}
        sections_evidence: dict[str, dict[str, Any]] = {}
        total_solved = 0
        total_coding_items = 0
        weight_sum = 0.0
        weighted_score = 0.0

        sections = rnd.sections or [
            # A round with no declared sections still plays as one interview block.
            Section(section_id=rnd.round_id, label=rnd.label,
                    competency="behavioral", item_type="interview_qa", count=1, minutes=rnd.total_minutes)
        ]

        for sec in sections:
            a = ctx.candidate.section_ability(rnd.round_id, sec, difficulty)
            score10 = round(a * 10.0, 2)
            sub_scores[sec.section_id] = score10
            count = max(sec.count, 1)
            weight = float(count)
            weighted_score += score10 * weight
            weight_sum += weight

            ev: dict[str, Any] = {"score_0_10": score10, "count": count,
                                  "competency": sec.competency, "item_type": sec.item_type}

            if sec.item_type in ("coding", "build_app"):
                solved = sum(
                    1 for i in range(count)
                    if _roll(ctx.candidate.seed, rnd.round_id, sec.section_id, i) < a
                )
                total_solved += solved
                total_coding_items += count
                ev["solved"] = solved
                ev["clean_solve"] = solved == count and a >= 0.75
            elif sec.item_type in ("mcq", "pseudocode_mcq", "sql", "web_ui", "game"):
                correct = int(round(count * a))
                ev["correct"] = correct
                ev["wrong"] = count - correct
            sections_evidence[sec.section_id] = ev

        score_0_10 = round(weighted_score / weight_sum, 2) if weight_sum else 0.0
        percentile = round(_clamp(score_0_10 / 10.0, 0.01, 0.99) * 100, 1)
        verdict = self._verdict(score_0_10)

        strengths, improvements = self._coach(ctx, sub_scores)

        return RoundResult(
            round_id=rnd.round_id,
            round_type=rnd.round_type,
            score_0_10=score_0_10,
            sub_scores=sub_scores,
            strengths=strengths,
            improvements=improvements,
            rubric_notes=(
                f"[fallback:{rnd.round_type}] deterministic play at difficulty "
                f"'{rnd.difficulty_profile}' → {score_0_10}/10 (~p{percentile})."
            ),
            evidence={
                "sections": sections_evidence,
                "solved": total_solved,
                "coding_items": total_coding_items,
                "percentile": percentile,
                "verdict": verdict,
                "difficulty_factor": difficulty,
                "simulator": "fallback",
            },
        )

    @staticmethod
    def _verdict(score_0_10: float) -> str:
        cuts = [(3.0, "strong_no_hire"), (4.5, "no_hire"), (5.5, "leaning_no_hire"),
                (6.5, "leaning_hire"), (8.0, "hire")]
        for hi, label in cuts:
            if score_0_10 < hi:
                return label
        return "strong_hire"

    @staticmethod
    def _coach(ctx: SimContext, sub_scores: dict[str, float]) -> tuple[list[str], list[str]]:
        if not sub_scores:
            return [], []
        best = max(sub_scores, key=sub_scores.get)
        worst = min(sub_scores, key=sub_scores.get)
        strengths = [f"Strong on '{best}' ({sub_scores[best]}/10)."]
        improvements = []
        if sub_scores[worst] < 6.0:
            improvements.append(f"Lift '{worst}' ({sub_scores[worst]}/10) — the round's weakest section.")
        val = (ctx.blueprint.what_they_value or "").strip()
        if val and improvements:
            improvements.append(f"{ctx.blueprint.display_name} values: {val}")
        return strengths, improvements


# ═══════════════════════════════════════════════════════════════════════════════
# REGISTRY  (M3+ register real simulators here; orchestrator never changes)
# ═══════════════════════════════════════════════════════════════════════════════

_FALLBACK = FallbackSimulator()
_REGISTRY: dict[str, RoundSimulator] = {}


def register_simulator(round_type: str, simulator: RoundSimulator) -> None:
    """Register the simulator that plays ``round_type`` (later calls override)."""
    _REGISTRY[round_type] = simulator


def resolve_simulator(round_type: str) -> RoundSimulator:
    """The registered simulator for ``round_type``, or the fallback (never None)."""
    return _REGISTRY.get(round_type, _FALLBACK)


def registered_round_types() -> set[str]:
    return set(_REGISTRY.keys())
