"""
PrepVista — Reused Interview Simulators, company-skinned (Feature #01, M3)
=========================================================================
Wires the *reused* interview round types to skinned adapters. Per Dossier §6 the
company skin only re-weights categories, difficulty, tone and values — the
underlying interview capability is reused, not rebuilt. Each adapter:

  1. maps the round to its **module family** (the §6 mapping — which of the tested
     interview question families this round is played by),
  2. plays the round through a pluggable ``InterviewBackend`` (a real content
     backend can be attached later; the default is a deterministic, LLM-free
     backend so a session always completes — Dossier §17),
  3. applies the ``CompanySkin`` (grading strictness + competency emphasis + the
     company's values/tone), and returns the normalized ``RoundResult``.

Registering these does **not** touch the orchestrator: it resolves whatever the
registry holds for a round_type. Until M4/real content is attached, the backend
is deterministic; the *architecture* (skin + family mapping + pluggable backend)
is the M3 deliverable.

MODULE-FAMILY MAP (Dossier §6):
  technical_interview  → technical_domain + resume_based
  managerial_interview → situational_star + stress_curveball + case_study
  hr_interview         → hr_behavioral + career_motivation + culture_fit +
                         salary_expectation + candidate_questions
  group_discussion     → group_discussion
  behavioral_survey    → situational_star + hr_behavioral + case_study
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.services.company_sim.simulators import (
    FallbackSimulator,
    RoundResult,
    SimContext,
    register_simulator,
)
from app.services.company_sim.skins import CompanySkin

# round_type → the tested interview question families it reuses (Dossier §6).
MODULE_FAMILY: dict[str, list[str]] = {
    "technical_interview": ["technical_domain", "resume_based"],
    "managerial_interview": ["situational_star", "stress_curveball", "case_study"],
    "hr_interview": [
        "hr_behavioral", "career_motivation", "culture_fit",
        "salary_expectation", "candidate_questions",
    ],
    "group_discussion": ["group_discussion"],
    "behavioral_survey": ["situational_star", "hr_behavioral", "case_study"],
}


@runtime_checkable
class InterviewBackend(Protocol):
    """
    The content source a reused adapter plays through. The default is
    deterministic; a real backend (wrapping the tested question modules or the
    app's live interview engine) can implement this and be injected without any
    change to the adapter or the orchestrator.
    """

    def play(self, ctx: SimContext, family: list[str]) -> RoundResult: ...


class DeterministicBackend:
    """LLM-free, seeded backend — the always-available static fallback."""

    _fallback = FallbackSimulator()

    def play(self, ctx: SimContext, family: list[str]) -> RoundResult:
        return self._fallback.simulate(ctx)


# The active backend (swap via ``set_interview_backend`` when real content lands).
_BACKEND: InterviewBackend = DeterministicBackend()


def set_interview_backend(backend: InterviewBackend) -> None:
    """Attach a real interview content backend (M4+). Affects all reused rounds."""
    global _BACKEND
    _BACKEND = backend


class ReusedInterviewSimulator:
    """One skinned adapter, bound to a reused ``round_type``."""

    def __init__(self, round_type: str) -> None:
        self.round_type = round_type
        self.family = MODULE_FAMILY.get(round_type, [])

    def simulate(self, ctx: SimContext) -> RoundResult:
        base = _BACKEND.play(ctx, self.family)
        skin = CompanySkin.for_company(ctx.blueprint)
        sections_ev = (base.evidence or {}).get("sections", {})

        # Apply strictness (leniency) to each section, then aggregate with the
        # company's competency emphasis as weights.
        new_sub: dict[str, float] = {}
        weighted, weight_sum = 0.0, 0.0
        for sid, score in base.sub_scores.items():
            comp = sections_ev.get(sid, {}).get("competency", "")
            adj = max(0.0, min(10.0, score * skin.leniency))
            new_sub[sid] = round(adj, 2)
            w = skin.weight_for(comp)
            weighted += adj * w
            weight_sum += w
        round_score = round(weighted / weight_sum, 2) if weight_sum else base.score_0_10

        base.sub_scores = new_sub
        base.score_0_10 = round_score
        base.evidence["percentile"] = round(min(max(round_score / 10.0, 0.01), 0.99) * 100, 1)
        base.evidence["verdict"] = FallbackSimulator._verdict(round_score)
        base.evidence["simulator"] = f"reused:{self.round_type}"
        base.evidence["module_family"] = self.family
        base.evidence["skin"] = skin.summary()
        base.rubric_notes = (
            f"[{skin.display_name} · {self.round_type} · {'/'.join(self.family)}] "
            f"{skin.rubric_preamble()} {base.rubric_notes}"
        )
        if base.improvements and skin.what_they_value:
            base.improvements.append(f"{skin.display_name} weighs: {skin.what_they_value}")
        return base


def register_reused_simulators() -> list[str]:
    """
    Register a skinned adapter for every reused interview round_type. Idempotent
    (re-registering overrides). Returns the round_types wired.
    """
    for rt in MODULE_FAMILY:
        register_simulator(rt, ReusedInterviewSimulator(rt))
    return sorted(MODULE_FAMILY)


# Wiring M3 on import: importing the package activates the skinned reused
# simulators (the orchestrator then plays interview rounds through them).
register_reused_simulators()
