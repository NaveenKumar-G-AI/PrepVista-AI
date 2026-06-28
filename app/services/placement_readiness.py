"""
PrepVista AI - Placement Readiness Engine
==========================================
A single, deterministic source of truth for the two numbers colleges actually
quote when they buy a placement platform:

  1. Placement Readiness Score — one 0-100 number per student/session that
     answers "is this candidate placement-ready right now?".
  2. Hiring Probability — a per-company-archetype estimate ("TCS 82%,
     Product 61%") that turns the abstract score into something a TPO and a
     student both intuitively understand.

WHY THIS LIVES IN ITS OWN PURE MODULE
-------------------------------------
The readiness *tiers* (Ready / Almost Ready / Developing / At Risk) and the
0-100 scale already exist in analytics_helpers.py and drive the TPO cohort
dashboards. This module deliberately does NOT reinvent them — it imports
_bucket_into_tier and READINESS_TIER_COLOR so a student's per-session readiness
tier and a TPO's cohort readiness tier are computed by the exact same bucketing
logic. What is genuinely new here is:
  - collapsing the 19+ fine-grained rubric categories into 5 placement
    *competency pillars* with placement-value-weighted aggregation, and
  - mapping that composite onto per-company hiring probabilities via a
    calibrated logistic curve.

Everything here is a PURE function of category-average scores (already on the
0-100 scale used everywhere else). No I/O, no DB, no LLM — so it is trivially
unit-testable and safe to call from the per-session report path, the student
dashboard, and any future cohort rollup without connection/latency concerns.

CALIBRATION NOTE
----------------
The company emphasis weights and probability bars below are documented,
tunable *heuristics* — not scraped hiring data. They encode well-known,
defensible patterns (service-based mass recruiters weight communication and
consistency and clear a lower bar; product companies weight technical depth and
problem solving and clear a much higher bar). They are isolated in named
constants so a future TPO-facing calibration screen can retune them without
touching the math.
"""

from __future__ import annotations

import math
from typing import Iterable

# Reuse the EXISTING readiness-tier bucketing + colors so per-session and
# cohort readiness never drift apart. (analytics_helpers is pure stdlib — no
# import cycle: interview_summary -> placement_readiness -> analytics_helpers.)
from app.services.analytics_helpers import (
    READINESS_TIER_COLOR,
    READINESS_TIER_NOT_STARTED,
    _bucket_into_tier,
)

# ---------------------------------------------------------------------------
# Competency pillars
# ---------------------------------------------------------------------------
# The evaluator emits many fine-grained rubric categories (the 19 canonical
# ones in analytics_helpers.VALID_RUBRIC_CATEGORIES plus richer-plan families
# like skill_verification / situational_judgment). For a single placement
# score we roll them up into 5 pillars a recruiter would recognize. Any
# category not listed here is simply ignored by the pillar math (it still
# appears in the detailed category_feedback elsewhere) — unknown strings must
# never silently distort the headline number.
PILLAR_CATEGORY_MAP: dict[str, tuple[str, ...]] = {
    "technical_depth": (
        "technical_depth", "tool_method", "validation_metrics",
        "skill_verification", "programming_language", "ai_tool_fluency",
        "certification",
    ),
    "problem_solving": (
        "problem_solving", "challenge_debugging", "tradeoff_decision",
        "workflow_process", "situational_judgment", "creative_thinking",
    ),
    "communication": (
        "communication", "communication_explain", "delivery",
    ),
    "ownership": (
        "project_ownership", "ownership", "role_fit", "self_assessment",
    ),
    "behavioral": (
        "behavioral", "teamwork_pressure", "learning_growth", "closeout",
        "introduction", "studies_background",
    ),
}

PILLAR_DISPLAY_NAMES: dict[str, str] = {
    "technical_depth": "Technical Depth",
    "problem_solving": "Problem Solving",
    "communication": "Communication",
    "ownership": "Ownership",
    "behavioral": "Behavioral",
}

# Reverse index (category -> pillar), built once at import. Asserts the map is
# self-consistent so an edit that duplicates a category across two pillars
# fails loudly at import instead of double-counting it.
_CATEGORY_TO_PILLAR: dict[str, str] = {}
for _pillar, _cats in PILLAR_CATEGORY_MAP.items():
    for _cat in _cats:
        assert _cat not in _CATEGORY_TO_PILLAR, (
            f"category {_cat!r} mapped to multiple pillars"
        )
        _CATEGORY_TO_PILLAR[_cat] = _pillar

# Placement-value weights for the overall readiness composite. Technical depth
# and problem solving dominate hireability across most placement tracks;
# communication is the universal multiplier; ownership and behavioral round out
# the signal. Weights are renormalized over the pillars that actually have data
# (see _weighted_mean), so a session that never probed, say, behavioral does
# not get penalized for a missing axis.
PILLAR_WEIGHTS: dict[str, float] = {
    "technical_depth": 0.28,
    "problem_solving": 0.24,
    "communication": 0.22,
    "ownership": 0.16,
    "behavioral": 0.10,
}
assert set(PILLAR_WEIGHTS) == set(PILLAR_CATEGORY_MAP), (
    "PILLAR_WEIGHTS must cover exactly the defined pillars"
)


# ---------------------------------------------------------------------------
# Company archetypes
# ---------------------------------------------------------------------------
# Each archetype declares:
#   emphasis — how it weights the 5 pillars when judging a candidate.
#   bar      — the emphasis-weighted score at which hiring probability == 50%.
#   steepness— logistic slope k; larger = a sharper pass/fail transition.
# "Product" is the high-bar, technical-heavy archetype (Amazon/Microsoft-like);
# the named service companies are mass recruiters with a lower bar and a
# communication/consistency lean. These are tunable heuristics (see module
# docstring), not hiring guarantees.
class CompanyProfile:
    __slots__ = ("name", "emphasis", "bar", "steepness")

    def __init__(self, name: str, emphasis: dict[str, float], bar: float, steepness: float):
        self.name = name
        self.emphasis = emphasis
        self.bar = bar
        self.steepness = steepness


_SERVICE_EMPHASIS = {
    "communication": 0.30,
    "problem_solving": 0.22,
    "technical_depth": 0.20,
    "behavioral": 0.18,
    "ownership": 0.10,
}
_PRODUCT_EMPHASIS = {
    "technical_depth": 0.36,
    "problem_solving": 0.30,
    "ownership": 0.16,
    "communication": 0.13,
    "behavioral": 0.05,
}

COMPANY_PROFILES: tuple[CompanyProfile, ...] = (
    CompanyProfile("TCS", _SERVICE_EMPHASIS, bar=55.0, steepness=0.085),
    CompanyProfile("Infosys", _SERVICE_EMPHASIS, bar=57.0, steepness=0.085),
    CompanyProfile("Wipro", _SERVICE_EMPHASIS, bar=54.0, steepness=0.085),
    CompanyProfile("Cognizant", _SERVICE_EMPHASIS, bar=56.0, steepness=0.085),
    CompanyProfile(
        "Accenture",
        # Slightly more consulting/communication-led, higher bar than the
        # pure-volume recruiters.
        {
            "communication": 0.34,
            "problem_solving": 0.24,
            "technical_depth": 0.18,
            "behavioral": 0.16,
            "ownership": 0.08,
        },
        bar=60.0,
        steepness=0.090,
    ),
    CompanyProfile("Product Company", _PRODUCT_EMPHASIS, bar=72.0, steepness=0.105),
)

# Probabilities are clamped to this band — never report a literal 0% or 100%
# from a handful of mock interviews; it would be both statistically dishonest
# and demotivating/over-confident to a student.
_MIN_PROBABILITY = 2
_MAX_PROBABILITY = 98


# ---------------------------------------------------------------------------
# Calibration overlay (Fix 3)
# ---------------------------------------------------------------------------
# The bars/steepness above are documented heuristics. Once a college has fed
# back >= 30 real placement outcomes for a company (see placement_outcomes +
# app/services/calibration.py), a logistic fit replaces those heuristics with
# data-derived values. To keep THIS module pure (no DB / no I/O — it is called
# from the per-session report path, the student dashboard, and cohort rollups),
# the fitted values are not loaded here. Instead calibration.py writes them into
# this in-process registry via set_calibration_overrides(); the compute
# functions read it synchronously and fall back to the hardcoded heuristic when
# a company has no calibrated entry.
#
#   _CALIBRATION_OVERRIDES["TCS"] = {"bar": 53.1, "steepness": 0.091, "sample_n": 47}
#
# This is a plain dict swapped atomically by set_calibration_overrides(), so a
# concurrent reader either sees the whole old map or the whole new map.
_CALIBRATION_OVERRIDES: dict[str, dict] = {}


def set_calibration_overrides(overrides: dict[str, dict] | None) -> None:
    """Replace the calibrated-parameter registry (called by calibration.py).

    `overrides` maps company name -> {"bar": float, "steepness": float,
    "sample_n": int}. Pass an empty dict / None to clear all overrides and fall
    back to the hardcoded heuristics everywhere.
    """
    global _CALIBRATION_OVERRIDES
    cleaned: dict[str, dict] = {}
    for name, params in (overrides or {}).items():
        try:
            bar = float(params["bar"])
            steepness = float(params["steepness"])
        except (KeyError, TypeError, ValueError):
            continue
        if steepness <= 0 or math.isnan(bar) or math.isinf(bar):
            continue
        cleaned[str(name)] = {
            "bar": bar,
            "steepness": steepness,
            "sample_n": int(params.get("sample_n", 0) or 0),
        }
    _CALIBRATION_OVERRIDES = cleaned


def _effective_curve(profile: "CompanyProfile") -> tuple[float, float, int | None]:
    """Return (bar, steepness, sample_n) for a company, preferring a calibrated
    entry over the hardcoded heuristic. sample_n is None when uncalibrated.
    """
    override = _CALIBRATION_OVERRIDES.get(profile.name)
    if override:
        return override["bar"], override["steepness"], override.get("sample_n")
    return profile.bar, profile.steepness, None


# ---------------------------------------------------------------------------
# Core math
# ---------------------------------------------------------------------------
def _coerce_score(value: object) -> float | None:
    """Coerce a stored score to a float in [0, 100], or None if unusable."""
    try:
        if value is None:
            return None
        score = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(score) or math.isinf(score):
        return None
    # Scores are persisted on a 0-100 scale; clamp defensively so a stray
    # out-of-range evaluator value can't blow past 100 or below 0.
    return max(0.0, min(100.0, score))


def _weighted_mean(scores: dict[str, float], weights: dict[str, float]) -> float | None:
    """Weighted mean of `scores`, using `weights` renormalized to the keys
    that are actually present in `scores`. Returns None if nothing overlaps.
    """
    total_weight = 0.0
    accum = 0.0
    for key, score in scores.items():
        weight = weights.get(key)
        if weight is None or weight <= 0:
            continue
        total_weight += weight
        accum += weight * score
    if total_weight <= 0:
        return None
    return accum / total_weight


def compute_pillar_scores(category_averages: dict[str, float]) -> dict[str, float]:
    """Collapse per-category averages into per-pillar averages (0-100).

    A pillar's score is the simple mean of the present category averages that
    map to it. Pillars with no underlying data are omitted from the result
    (not zero-filled) so downstream weighting can renormalize honestly.
    """
    buckets: dict[str, list[float]] = {}
    for raw_category, raw_score in (category_averages or {}).items():
        pillar = _CATEGORY_TO_PILLAR.get(str(raw_category).strip().lower())
        if pillar is None:
            continue
        score = _coerce_score(raw_score)
        if score is None:
            continue
        buckets.setdefault(pillar, []).append(score)
    return {
        pillar: round(sum(values) / len(values), 1)
        for pillar, values in buckets.items()
        if values
    }


def compute_readiness_score(category_averages: dict[str, float]) -> float | None:
    """The single 0-100 Placement Readiness Score, or None if no scored data.

    Composite = placement-value-weighted mean of the present competency
    pillars (see PILLAR_WEIGHTS). None propagates a genuine "not started"
    state distinct from a real low score, mirroring _bucket_into_tier.
    """
    pillars = compute_pillar_scores(category_averages)
    if not pillars:
        return None
    composite = _weighted_mean(pillars, PILLAR_WEIGHTS)
    if composite is None:
        return None
    return round(composite, 1)


def _logistic_probability(weighted_score: float, bar: float, steepness: float) -> int:
    """Map an emphasis-weighted competency to a 0-100 hiring probability via a
    logistic curve centered on `bar`, then clamp to the sane reporting band.
    """
    try:
        raw = 1.0 / (1.0 + math.exp(-steepness * (weighted_score - bar)))
    except OverflowError:
        # Extreme inputs saturate the curve; resolve to the correct rail.
        raw = 0.0 if weighted_score < bar else 1.0
    pct = round(raw * 100)
    return max(_MIN_PROBABILITY, min(_MAX_PROBABILITY, pct))


def compute_hiring_probabilities(category_averages: dict[str, float]) -> list[dict]:
    """Per-company hiring-probability estimates, sorted most-likely first.

    Returns [] when there is no scored data yet — callers should treat an
    empty list as "take an interview to unlock this", not "0% everywhere".
    """
    pillars = compute_pillar_scores(category_averages)
    if not pillars:
        return []
    results: list[dict] = []
    for profile in COMPANY_PROFILES:
        weighted = _weighted_mean(pillars, profile.emphasis)
        if weighted is None:
            continue
        bar, steepness, sample_n = _effective_curve(profile)
        results.append({
            "company": profile.name,
            "probability": _logistic_probability(weighted, bar, steepness),
            # Honesty signals for the report (Fix 3 §5): is this number grounded
            # in real outcomes, and how many?
            "calibrated": sample_n is not None,
            "sample_n": sample_n,
        })
    results.sort(key=lambda row: row["probability"], reverse=True)
    return results


def _headline(score: float | None, tier: str, top: dict | None) -> str:
    """One human sentence a student/recruiter reads first."""
    if score is None:
        return "Take an interview to unlock your placement readiness score."
    if top is not None:
        return (
            f"Placement readiness {round(score)}/100 ({tier}). "
            f"Strongest match right now: {top['company']} (~{top['probability']}%)."
        )
    return f"Placement readiness {round(score)}/100 ({tier})."


def build_placement_readiness(
    category_averages: dict[str, float],
    *,
    session_count: int | None = None,
    trend_slope: float | None = None,
) -> dict:
    """Assemble the full placement-readiness block from category averages.

    `category_averages` maps rubric-category -> average score (0-100) — exactly
    the shape produced by derive_skill_score_rows / a session's
    category_feedback / a student's latest per-category radar values.

    Returns a stable, additive dict safe for any caller to ignore:
        {
          "score": int | None,          # 0-100 headline number
          "tier": str,                  # Ready / Almost Ready / ... (shared bucketing)
          "tier_color": str,            # green / yellow / orange / red / gray
          "pillars": [ {key,label,score}, ... ],   # 5 competency pillars (present ones)
          "hiring_probabilities": [ {company,probability}, ... ],  # sorted desc
          "top_company": str | None,
          "session_count": int | None,  # passthrough context
          "trend_slope": float | None,  # passthrough context (points/session)
          "headline": str,
        }
    """
    score = compute_readiness_score(category_averages)
    pillars = compute_pillar_scores(category_averages)
    probabilities = compute_hiring_probabilities(category_averages)

    tier = _bucket_into_tier(score) if score is not None else READINESS_TIER_NOT_STARTED
    top = probabilities[0] if probabilities else None

    return {
        "score": round(score) if score is not None else None,
        "tier": tier,
        "tier_color": READINESS_TIER_COLOR.get(tier, "gray"),
        "pillars": [
            {
                "key": pillar,
                "label": PILLAR_DISPLAY_NAMES.get(pillar, pillar.replace("_", " ").title()),
                "score": pillars[pillar],
            }
            # Stable display order regardless of dict insertion order.
            for pillar in PILLAR_WEIGHTS
            if pillar in pillars
        ],
        "hiring_probabilities": probabilities,
        "top_company": top["company"] if top else None,
        "session_count": session_count,
        "trend_slope": trend_slope,
        "headline": _headline(score, tier, top),
        # Fix 3 §5 — report transparency. The honest provenance of the numbers
        # the TPO is looking at: data-grounded vs. heuristic. A TPO respects
        # "estimated using scoring model" far more than a confident percentage
        # with no source.
        "calibration_note": _calibration_note(probabilities),
    }


def _calibration_note(probabilities: list[dict]) -> str:
    """One honest sentence on where these probabilities come from.

    "Based on N placement outcomes" when the displayed companies are calibrated
    against real outcomes; otherwise the scoring-model disclaimer.
    """
    if not probabilities:
        return "Take an interview to unlock placement probabilities."
    calibrated = [p for p in probabilities if p.get("calibrated")]
    if calibrated:
        total_n = sum(int(p.get("sample_n") or 0) for p in calibrated)
        return f"Based on {total_n} placement outcomes."
    return "Estimated using scoring model."


# Per-question rubric scores are persisted on a 0-10 scale (evaluator_scoring
# clamps each to 10.0; the five [0,2] components sum to <=10). The readiness
# engine works on the 0-100 scale shared by final_score and the readiness
# tiers, so the adapters below rescale 0-10 -> 0-100. Mirrors
# interview_summary.QUESTION_SCORE_SCALE_MAX / normalize_score_to_100 without
# importing them (keeps this module dependency-light and cycle-free).
QUESTION_SCORE_SCALE_MAX = 10.0


def _rescale_to_100(value: object, scale_max: float) -> float | None:
    """Coerce a raw stored score and rescale it from [0, scale_max] to [0, 100].

    Returns None for unusable input. The result is clamped to [0, 100] so a
    stray out-of-range evaluator value can't push a category above 100.
    """
    if scale_max <= 0:
        return None
    try:
        if value is None:
            return None
        score = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(score) or math.isinf(score):
        return None
    rescaled = (max(0.0, score) / scale_max) * 100.0
    return min(100.0, round(rescaled, 1))


def category_averages_from_feedback(
    category_feedback: Iterable[dict],
    *,
    scale_max: float = QUESTION_SCORE_SCALE_MAX,
) -> dict[str, float]:
    """Adapter: pull a 0-100 {category: average_score} map out of the
    category_feedback list compute_premium_interview_report builds.

    category_feedback's average_score is on the 0-10 per-question scale, so it
    is rescaled to 0-100 here. Isolates the shape + scale knowledge so a future
    change to category_feedback only touches this function.
    """
    averages: dict[str, float] = {}
    for entry in category_feedback or []:
        if not isinstance(entry, dict):
            continue
        category = str(entry.get("category") or "").strip().lower()
        raw = entry.get("average_score")
        score = _rescale_to_100(raw, scale_max)
        if category and score is not None and score > 0:
            averages[category] = score
    return averages


def category_averages_from_evaluations(
    evaluations: Iterable[dict],
    *,
    scale_max: float = QUESTION_SCORE_SCALE_MAX,
) -> dict[str, float]:
    """Adapter: aggregate raw per-question evaluations into a 0-100
    {category: average_score} map.

    Groups by rubric_category (falling back to "category"), averages the 0-10
    per-question scores within each, and rescales to 0-100. This is the direct
    path used by the live report summaries (build_pro/career_readiness_summary)
    so placement readiness is computed from the same evaluations the rest of the
    report already trusts — no dependency on persisted skill_scores.
    """
    buckets: dict[str, list[float]] = {}
    for ev in evaluations or []:
        if not isinstance(ev, dict):
            continue
        category = str(ev.get("rubric_category") or ev.get("category") or "").strip().lower()
        if not category:
            continue
        score = _rescale_to_100(ev.get("score"), scale_max)
        if score is not None and score > 0:
            buckets.setdefault(category, []).append(score)
    return {
        category: round(sum(values) / len(values), 1)
        for category, values in buckets.items()
        if values
    }
