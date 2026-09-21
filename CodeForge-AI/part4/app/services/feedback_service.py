from __future__ import annotations

from app.models.schemas import AIFeedback, AIStructuredDiagnosis, DeterministicEvaluation
from app.services.ai.base import AIProvider
from app.services.ai.prompts import FEEDBACK_SCHEMA_HINT, FEEDBACK_SYSTEM_PROMPT


def _deterministic_feedback(evaluation: DeterministicEvaluation, diagnosis: AIStructuredDiagnosis) -> AIFeedback:
    """Composed directly from real evidence (no AI prose) when no provider
    is available. Still specific, never generic filler."""
    failed_list = [(o.test_id, o.failure_category) for o in evaluation.outcomes if not o.passed]

    what_went_well = (
        f"{evaluation.tests_passed} of {evaluation.tests_total} test case(s) passed."
        if evaluation.tests_passed else "No test cases passed yet on this attempt."
    )
    what_failed = (
        "Failing cases: " + ", ".join(f"{tid} ({cat})" for tid, cat in failed_list) + "."
        if failed_list else "No failing cases."
    )
    why_it_failed = (
        "; ".join(diagnosis.observations[1:]) if len(diagnosis.observations) > 1
        else "Deterministic evidence only — no AI-assisted root-cause reasoning was available for this attempt."
    )
    what_to_improve = (
        "Review the failing category above and re-check that logic path against the failing case."
        if failed_list else "Consider the time/space complexity of your solution for larger inputs."
    )
    next_step = "Retry this challenge after adjusting your solution." if failed_list else "Move on to the next recommended challenge."

    return AIFeedback(
        what_went_well=what_went_well,
        what_failed=what_failed,
        why_it_failed=why_it_failed,
        what_to_improve=what_to_improve,
        optional_hint=None,
        next_step=next_step,
    )


def generate_feedback(
    provider: AIProvider | None,
    challenge_meta: dict,
    evaluation: DeterministicEvaluation,
    diagnosis: AIStructuredDiagnosis,
    level: str = "STANDARD",
) -> tuple[AIFeedback, str]:
    """Returns (feedback, ai_status). Falls back to deterministic,
    evidence-grounded feedback (never fabricated AI prose) if no provider
    is configured or the call fails."""
    if provider is None or not provider.is_available():
        return _deterministic_feedback(evaluation, diagnosis), "AI_EVALUATION_PENDING"

    payload = {
        "challenge": {**challenge_meta, "feedback_level": level},
        "evidence": {
            "tests_passed": evaluation.tests_passed,
            "tests_total": evaluation.tests_total,
            "diagnosis": diagnosis.model_dump(),
        },
        "submission": {},
    }
    try:
        raw = provider.complete_json(FEEDBACK_SYSTEM_PROMPT, payload, FEEDBACK_SCHEMA_HINT)
        parsed = AIFeedback.model_validate(raw)
        return parsed, "AI_GENERATED"
    except Exception as exc:  # noqa: BLE001
        fallback = _deterministic_feedback(evaluation, diagnosis)
        fallback.optional_hint = f"(AI feedback unavailable: {exc})"
        return fallback, "AI_RESPONSE_INVALID"
