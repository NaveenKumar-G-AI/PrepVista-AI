"""
Deterministic, rule-based mistake classification. This layer runs BEFORE
any AI call and never needs one — it maps observed failure categories and
static-analysis signals directly onto the canonical taxonomy. The AI
diagnosis layer (diagnosis_service.py) may propose *additional* mistakes
(as inferences, lower confidence) but these rule-based ones are facts.
"""
from __future__ import annotations

from app.models.schemas import CodeAnalysis, DeterministicEvaluation, MistakeInstance

_CATEGORY_TO_MISTAKE = {
    "COMPILATION": "COMPILATION_ERROR",
    "TIMEOUT": "PERFORMANCE_FAILURE",
    "MEMORY": "PERFORMANCE_FAILURE",
    "BOUNDARY": "BOUNDARY_ERROR",
    "EDGE_CASE": "EDGE_CASE_FAILURE",
    "INPUT_HANDLING": "INPUT_HANDLING",
    "RUNTIME": "RUNTIME_ERROR",
    "LOGIC": "LOGIC_ERROR",
    "UNKNOWN": "UNKNOWN",
}


def classify_from_evaluation(evaluation: DeterministicEvaluation) -> list[MistakeInstance]:
    mistakes: list[MistakeInstance] = []
    seen_categories: set[str] = set()

    for outcome in evaluation.outcomes:
        if outcome.passed or not outcome.failure_category:
            continue
        category = outcome.failure_category
        if category in seen_categories:
            continue
        seen_categories.add(category)

        mistake_category = _CATEGORY_TO_MISTAKE.get(category, "UNKNOWN")
        severity = "HIGH" if category in ("TIMEOUT", "MEMORY", "COMPILATION") else "MEDIUM"
        confidence = "HIGH" if category in (
            "COMPILATION", "TIMEOUT", "MEMORY", "RUNTIME"
        ) else "MEDIUM"

        mistakes.append(MistakeInstance(
            category=mistake_category,
            evidence=f"Test {outcome.test_id} failed with deterministic category '{category}'.",
            confidence=confidence,
            severity=severity,
        ))

    return mistakes


def classify_from_static_analysis(analysis: CodeAnalysis | None) -> list[MistakeInstance]:
    if analysis is None:
        return []
    mistakes: list[MistakeInstance] = []
    if analysis.duplicate_blocks > 0:
        mistakes.append(MistakeInstance(
            category="LOGIC_ERROR",
            evidence=f"{analysis.duplicate_blocks} structurally duplicate code block(s) detected — "
                      "often a sign a shared abstraction was missed rather than an incorrect result "
                      "on its own; recorded as low-severity structural evidence.",
            confidence="LOW",
            severity="LOW",
        ))
    return mistakes
