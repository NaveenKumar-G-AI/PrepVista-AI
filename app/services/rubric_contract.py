"""Canonical rubric-category contract shared by database and application.

This module is the SINGLE SOURCE OF TRUTH for which category strings are
valid in question_evaluations.rubric_category and skill_scores.category.

Migration 038_rubric_category_expansion.sql uses these exact values in its
CHECK constraints.  Runtime validation (analytics_helpers, evaluator_feedback)
should import from here rather than maintaining independent literal lists.

── Design constraints ──
- Migration SQL must remain self-contained (it embeds the literals directly).
- This module provides the authoritative Python set for runtime validation,
  preflight checks, and tests that prove migration ↔ runtime agreement.
- DO NOT add values here without a corresponding migration.
"""
from __future__ import annotations

# ── Legacy categories (migration 001 original 14) ─────────────────────────
# These exist in historical rows and must remain accepted forever.
LEGACY_DB_CATEGORIES: frozenset[str] = frozenset({
    "communication",   "technical_depth",  "problem_solving",
    "confidence",      "structure_star",   "vocabulary",
    "vocal_delivery",  "leadership",       "teamwork",
    "adaptability",    "reasoning",        "conciseness",
    "professionalism", "role_fit",
})

# ── Current runtime categories ────────────────────────────────────────────
# Emitted by normalize_rubric_category() in evaluator_feedback.py.
CURRENT_RUNTIME_CATEGORIES: frozenset[str] = frozenset({
    "introduction",          "project_ownership",   "behavioral",
    "communication",         "technical_depth",     "problem_solving",
    "situational_judgment",  "creative_thinking",   "ai_tool_fluency",
    "programming_language",  "skill_verification",  "certification",
    "self_assessment",
})

# ── Synthetic category ────────────────────────────────────────────────────
# "delivery" is derived from communication_score in derive_skill_score_rows()
# and written to skill_scores.category.  It is never a rubric_category value
# in question_evaluations.
SYNTHETIC_SKILL_CATEGORIES: frozenset[str] = frozenset({"delivery"})

# ── Canonical sets matching migration 038 CHECK constraints ───────────────
VALID_EVALUATION_CATEGORIES: frozenset[str] = LEGACY_DB_CATEGORIES | CURRENT_RUNTIME_CATEGORIES
"""All values accepted by question_evaluations.rubric_category CHECK (24)."""

VALID_SKILL_SCORE_CATEGORIES: frozenset[str] = VALID_EVALUATION_CATEGORIES | SYNTHETIC_SKILL_CATEGORIES
"""All values accepted by skill_scores.category CHECK (25)."""

# ── Preflight ─────────────────────────────────────────────────────────────
PREFLIGHT_EVALUATION_QUERY = """\
SELECT DISTINCT rubric_category
FROM question_evaluations
WHERE rubric_category NOT IN ({placeholders})
LIMIT 100;
"""

PREFLIGHT_SKILL_SCORES_QUERY = """\
SELECT DISTINCT category
FROM skill_scores
WHERE category NOT IN ({placeholders})
LIMIT 100;
"""


def build_preflight_queries() -> tuple[str, str]:
    """Return two read-only SQL queries that detect unexpected category values.

    Each query returns rows only if the target table contains category strings
    outside the proposed new CHECK constraint.  Zero rows = safe to migrate.
    """
    eval_ph = ", ".join(f"'{v}'" for v in sorted(VALID_EVALUATION_CATEGORIES))
    skill_ph = ", ".join(f"'{v}'" for v in sorted(VALID_SKILL_SCORE_CATEGORIES))
    return (
        PREFLIGHT_EVALUATION_QUERY.format(placeholders=eval_ph),
        PREFLIGHT_SKILL_SCORES_QUERY.format(placeholders=skill_ph),
    )
