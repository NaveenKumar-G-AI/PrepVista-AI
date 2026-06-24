"""
Tests for the Placement Readiness engine (app/services/placement_readiness.py).

Covers the pure math contracts the per-session report and student dashboard
both depend on: pillar rollup, the weighted 0-100 composite, per-company
hiring probabilities (ordering, clamping, archetype bars), tier reuse, and the
"no data yet" state.
"""

import pytest

from app.services.placement_readiness import (
    COMPANY_PROFILES,
    PILLAR_WEIGHTS,
    build_placement_readiness,
    category_averages_from_evaluations,
    category_averages_from_feedback,
    compute_hiring_probabilities,
    compute_pillar_scores,
    compute_readiness_score,
)
from app.services.analytics_helpers import (
    READINESS_TIER_NOT_STARTED,
    READINESS_TIER_READY,
    READINESS_TIER_AT_RISK,
)


# ── Pillar rollup ────────────────────────────────────────────────────────────

def test_pillar_scores_average_categories_within_a_pillar():
    # technical_depth + tool_method both map to the technical_depth pillar.
    pillars = compute_pillar_scores({"technical_depth": 80.0, "tool_method": 60.0})
    assert pillars["technical_depth"] == 70.0


def test_pillar_scores_ignore_unknown_categories():
    pillars = compute_pillar_scores({"communication": 75.0, "totally_made_up": 99.0})
    assert set(pillars) == {"communication"}
    assert pillars["communication"] == 75.0


def test_pillar_scores_skip_unusable_values():
    pillars = compute_pillar_scores({"communication": None, "ownership": "oops", "behavioral": 50.0})
    assert set(pillars) == {"behavioral"}


def test_pillar_scores_clamp_out_of_range():
    pillars = compute_pillar_scores({"communication": 150.0, "delivery": -20.0})
    # 100 (clamped) and 0 (clamped) -> mean 50
    assert pillars["communication"] == 50.0


# ── Readiness composite ──────────────────────────────────────────────────────

def test_readiness_score_none_when_no_data():
    assert compute_readiness_score({}) is None
    assert compute_readiness_score({"unknown_cat": 90.0}) is None


def test_readiness_score_equals_value_when_all_pillars_equal():
    # Every pillar at 70 -> weighted mean is 70 regardless of weights.
    averages = {
        "technical_depth": 70.0,
        "problem_solving": 70.0,
        "communication": 70.0,
        "ownership": 70.0,
        "behavioral": 70.0,
    }
    assert compute_readiness_score(averages) == 70.0


def test_readiness_score_weights_technical_and_problem_solving_more():
    # Same two pillars, swapped values. Because technical_depth (0.28) outweighs
    # behavioral (0.10), being strong on technical should score higher.
    strong_tech = compute_readiness_score({"technical_depth": 90.0, "behavioral": 50.0})
    strong_behavioral = compute_readiness_score({"technical_depth": 50.0, "behavioral": 90.0})
    assert strong_tech > strong_behavioral


def test_readiness_renormalizes_over_present_pillars():
    # Only one pillar present -> composite is just that pillar's score, not
    # diluted by absent pillars.
    assert compute_readiness_score({"communication": 64.0, "delivery": 64.0}) == 64.0


def test_pillar_weights_sum_to_one():
    assert round(sum(PILLAR_WEIGHTS.values()), 6) == 1.0


# ── Hiring probabilities ─────────────────────────────────────────────────────

def test_hiring_probabilities_empty_without_data():
    assert compute_hiring_probabilities({}) == []


def test_hiring_probabilities_one_entry_per_company_sorted_desc():
    averages = {k: 70.0 for k in (
        "technical_depth", "problem_solving", "communication", "ownership", "behavioral"
    )}
    probs = compute_hiring_probabilities(averages)
    assert len(probs) == len(COMPANY_PROFILES)
    values = [p["probability"] for p in probs]
    assert values == sorted(values, reverse=True)


def test_hiring_probabilities_clamped_to_band():
    high = compute_hiring_probabilities({k: 100.0 for k in (
        "technical_depth", "problem_solving", "communication", "ownership", "behavioral"
    )})
    low = compute_hiring_probabilities({k: 0.0 for k in (
        "technical_depth", "problem_solving", "communication", "ownership", "behavioral"
    )})
    assert all(2 <= p["probability"] <= 98 for p in high + low)
    assert max(p["probability"] for p in high) <= 98
    assert min(p["probability"] for p in low) >= 2


def test_product_company_has_a_higher_bar_than_service():
    # At a solid-but-not-elite uniform 65, the high-bar product archetype should
    # be less confident than the volume service recruiters.
    averages = {k: 65.0 for k in (
        "technical_depth", "problem_solving", "communication", "ownership", "behavioral"
    )}
    probs = {p["company"]: p["probability"] for p in compute_hiring_probabilities(averages)}
    assert probs["Product Company"] < probs["TCS"]


def test_higher_scores_raise_probability_monotonically():
    keys = ("technical_depth", "problem_solving", "communication", "ownership", "behavioral")
    low = {k: 50.0 for k in keys}
    high = {k: 85.0 for k in keys}
    low_tcs = {p["company"]: p["probability"] for p in compute_hiring_probabilities(low)}["TCS"]
    high_tcs = {p["company"]: p["probability"] for p in compute_hiring_probabilities(high)}["TCS"]
    assert high_tcs > low_tcs


# ── Full assembly ────────────────────────────────────────────────────────────

def test_build_placement_readiness_not_started_state():
    block = build_placement_readiness({})
    assert block["score"] is None
    assert block["tier"] == READINESS_TIER_NOT_STARTED
    assert block["tier_color"] == "gray"
    assert block["hiring_probabilities"] == []
    assert block["top_company"] is None
    assert "unlock" in block["headline"].lower()


def test_build_placement_readiness_ready_tier_and_top_company():
    averages = {k: 88.0 for k in (
        "technical_depth", "problem_solving", "communication", "ownership", "behavioral"
    )}
    block = build_placement_readiness(averages, session_count=4, trend_slope=2.5)
    assert block["score"] >= 75
    assert block["tier"] == READINESS_TIER_READY
    assert block["tier_color"] == "green"
    assert block["top_company"] == block["hiring_probabilities"][0]["company"]
    assert block["session_count"] == 4
    assert block["trend_slope"] == 2.5
    # Pillars come back in stable PILLAR_WEIGHTS order.
    pillar_keys = [p["key"] for p in block["pillars"]]
    assert pillar_keys == [k for k in PILLAR_WEIGHTS if k in {p["key"] for p in block["pillars"]}]


def test_build_placement_readiness_at_risk_tier():
    block = build_placement_readiness({"technical_depth": 20.0, "communication": 25.0})
    assert block["tier"] == READINESS_TIER_AT_RISK
    assert block["tier_color"] == "red"


# ── Adapter ──────────────────────────────────────────────────────────────────

def test_category_averages_from_feedback_rescales_and_filters():
    # average_score is on the 0-10 per-question scale; adapter rescales to 0-100.
    feedback = [
        {"category": "Technical_Depth", "average_score": 8.0},     # -> 80.0
        {"category": "communication", "average_score": 0.0},       # zero -> dropped
        {"category": "", "average_score": 7.0},                    # no category -> dropped
        {"category": "ownership", "average_score": None},          # bad score -> dropped
        "not a dict",                                              # ignored
    ]
    averages = category_averages_from_feedback(feedback)
    assert averages == {"technical_depth": 80.0}


def test_category_averages_from_evaluations_groups_and_rescales():
    evals = [
        {"rubric_category": "technical_depth", "score": 8.0},
        {"rubric_category": "technical_depth", "score": 6.0},   # avg 7.0 -> 70.0
        {"category": "communication", "score": 9.0},           # fallback key -> 90.0
        {"rubric_category": "ownership", "score": 0},          # zero -> dropped
        {"rubric_category": "", "score": 5.0},                 # no category -> dropped
        "not a dict",
    ]
    averages = category_averages_from_evaluations(evals)
    assert averages == {"technical_depth": 70.0, "communication": 90.0}


def test_adapter_feeds_build_end_to_end():
    # 0-10 inputs flow through the adapter and produce a sensible 0-100 score.
    feedback = [
        {"category": "technical_depth", "average_score": 7.8},
        {"category": "problem_solving", "average_score": 7.2},
        {"category": "communication", "average_score": 8.0},
    ]
    block = build_placement_readiness(category_averages_from_feedback(feedback))
    assert block["score"] is not None
    assert 70 <= block["score"] <= 80
    assert block["hiring_probabilities"]
