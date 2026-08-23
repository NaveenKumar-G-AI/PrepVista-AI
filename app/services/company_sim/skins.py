"""
PrepVista — Company Skins (Feature #01, M3)
===========================================
A **company skin** is the thin, *data-driven* layer that makes one generic
interview simulator behave like a specific company's round. Per the content
strategy (Dossier §7): "the company skin only re-weights categories, difficulty,
tone, and values." Everything here is **derived from the blueprint** — culture
values, ``what_they_value``, archetype, the AI-assistance rule — so adding or
retuning a company is still a *data* task with **zero per-company code**.

Two levers:
  * ``grading_strictness`` — the company's *bar*. A premium-product loop (Amazon,
    Google, Microsoft) grades the same answer harder than a mass-service OA (TCS,
    Infosys). Derived from ``archetype``. Applied as a leniency multiplier on
    scores so the SAME candidate scores a little lower at a higher-bar company.
  * ``emphasis`` — which competencies weigh more for this company. Derived from
    ``culture_values`` (e.g. Amazon's Leadership Principles → ``leadership_principles``
    is weighted up; Google's Googleyness → ``culture_fit``). Applied as a weight
    when a round's section scores are aggregated.

Pure stdlib, deterministic, no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.company_sim.models import CompanyBlueprint

# archetype → grading strictness (the company bar). > 1.0 == stricter.
_STRICTNESS_BY_ARCHETYPE: dict[str, float] = {
    "premium_product": 1.15,
    "unique": 1.12,
    "product": 1.10,
    "analytics": 1.05,
    "core": 1.02,
    "mass_service": 1.00,
}

# culture-value keyword → {competency: emphasis_bump}. Matched as substrings
# against each blueprint's culture_values, so the lean is inferred from data.
_VALUE_EMPHASIS: dict[str, dict[str, float]] = {
    "leadership": {"leadership_principles": 0.30, "situational_star": 0.20},
    "ownership": {"leadership_principles": 0.25, "project_ownership": 0.20},
    "dive_deep": {"technical_depth": 0.25, "leadership_principles": 0.15},
    "bias_for_action": {"situational_judgment": 0.20, "leadership_principles": 0.15},
    "deliver": {"situational_star": 0.20},
    "customer": {"situational_star": 0.20, "situational_judgment": 0.15},
    "googleyness": {"culture_fit": 0.30, "situational_judgment": 0.20},
    "collaboration": {"culture_fit": 0.20, "communication": 0.15},
    "ambiguity": {"situational_judgment": 0.25, "problem_solving": 0.15},
    "learning": {"culture_fit": 0.15, "career_motivation": 0.15},
    "communication": {"communication": 0.25},
    "relocation": {"hr_behavioral": 0.15},
    "learnability": {"career_motivation": 0.15, "problem_solving": 0.10},
    "integrity": {"hr_behavioral": 0.10, "culture_fit": 0.10},
    "reliability": {"situational_judgment": 0.15},
}


@dataclass
class CompanySkin:
    """A company's steering profile, derived entirely from its blueprint."""

    company_id: str
    display_name: str
    archetype: str
    grading_strictness: float
    ai_assistance_allowed: bool
    values: list[str] = field(default_factory=list)
    what_they_value: str = ""
    emphasis: dict[str, float] = field(default_factory=dict)

    @classmethod
    def for_company(cls, bp: CompanyBlueprint) -> "CompanySkin":
        emphasis: dict[str, float] = {}
        for val in bp.culture_values:
            key = (val or "").lower()
            for kw, bumps in _VALUE_EMPHASIS.items():
                if kw in key:
                    for comp, bump in bumps.items():
                        emphasis[comp] = round(emphasis.get(comp, 0.0) + bump, 3)
        return cls(
            company_id=bp.company_id,
            display_name=bp.display_name,
            archetype=bp.archetype,
            grading_strictness=_STRICTNESS_BY_ARCHETYPE.get(bp.archetype, 1.0),
            ai_assistance_allowed=bp.ai_assistance_allowed,
            values=list(bp.culture_values),
            what_they_value=bp.what_they_value,
            emphasis=emphasis,
        )

    # ── levers ────────────────────────────────────────────────────────────────
    @property
    def leniency(self) -> float:
        """Score multiplier: stricter bar → scores land a little lower."""
        return 1.0 / self.grading_strictness if self.grading_strictness else 1.0

    def weight_for(self, competency: str) -> float:
        """Aggregation weight for a section of this competency (>= 1.0)."""
        return 1.0 + self.emphasis.get(competency, 0.0)

    # ── presentation ─────────────────────────────────────────────────────────
    def rubric_preamble(self) -> str:
        vals = ", ".join(self.values[:4]) if self.values else "role-fit"
        ai = "AI assistance FORBIDDEN" if not self.ai_assistance_allowed else "AI assistance allowed"
        return (
            f"Grade to {self.display_name}'s bar (strictness {self.grading_strictness:.2f}); "
            f"weight {vals}. {ai}."
        )

    def summary(self) -> dict[str, Any]:
        return {
            "company": self.company_id,
            "archetype": self.archetype,
            "grading_strictness": self.grading_strictness,
            "ai_assistance_allowed": self.ai_assistance_allowed,
            "emphasis": self.emphasis,
        }
