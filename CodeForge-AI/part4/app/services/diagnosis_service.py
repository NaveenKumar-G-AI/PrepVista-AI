"""
Diagnosis service. Consumes deterministic evaluation + static analysis +
complexity + rule-based mistakes as EVIDENCE, and asks the AI layer to
produce hedged inferences on top of them (Phase 9-13). If no AI provider
is configured/available, this returns a diagnosis built purely from the
deterministic evidence with ai_status=AI_EVALUATION_PENDING — it never
fabricates AI-sounding prose to fill the gap (Phase 33).
"""
from __future__ import annotations

from app.models.schemas import (
    AIStructuredDiagnosis,
    CodeAnalysis,
    ComplexityEstimate,
    DeterministicEvaluation,
    MistakeInstance,
)
from app.services.ai.base import AIProvider, AIProviderError
from app.services.ai.prompts import DIAGNOSIS_SCHEMA_HINT, DIAGNOSIS_SYSTEM_PROMPT
from app.services.mistake_service import classify_from_evaluation, classify_from_static_analysis


class DiagnosisOutcome:
    def __init__(self, diagnosis: AIStructuredDiagnosis, ai_status: str,
                 deterministic_mistakes: list[MistakeInstance]):
        self.diagnosis = diagnosis
        self.ai_status = ai_status  # AI_GENERATED | AI_EVALUATION_PENDING | AI_RESPONSE_INVALID
        self.deterministic_mistakes = deterministic_mistakes


def _deterministic_only_diagnosis(
    evaluation: DeterministicEvaluation,
    det_mistakes: list[MistakeInstance],
) -> AIStructuredDiagnosis:
    observations = [f"{evaluation.tests_passed}/{evaluation.tests_total} tests passed."]
    for o in evaluation.outcomes:
        if not o.passed:
            observations.append(f"Test {o.test_id} failed (category: {o.failure_category}).")
    strengths = ["Handles at least some required cases correctly."] if evaluation.tests_passed else []
    return AIStructuredDiagnosis(
        observations=observations,
        inferences=[],  # no hedged reasoning available without an AI call
        mistakes=det_mistakes,
        strengths=strengths,
        recommendations=[],
        confidence="MEDIUM" if evaluation.tests_failed == 0 else "LOW",
    )


def diagnose(
    provider: AIProvider | None,
    challenge_meta: dict,
    source_code: str,
    evaluation: DeterministicEvaluation,
    code_analysis: CodeAnalysis | None,
    complexity: ComplexityEstimate,
) -> DiagnosisOutcome:
    det_mistakes = classify_from_evaluation(evaluation) + classify_from_static_analysis(code_analysis)

    if provider is None or not provider.is_available():
        return DiagnosisOutcome(
            _deterministic_only_diagnosis(evaluation, det_mistakes),
            ai_status="AI_EVALUATION_PENDING",
            deterministic_mistakes=det_mistakes,
        )

    failed_categories = [o.failure_category for o in evaluation.outcomes if not o.passed and o.failure_category]
    evidence_payload = {
        "tests_total": evaluation.tests_total,
        "tests_passed": evaluation.tests_passed,
        "failed_categories": failed_categories,
        "code_analysis": code_analysis.model_dump() if code_analysis else None,
        "complexity": complexity.model_dump(),
        "deterministic_mistakes": [m.model_dump() for m in det_mistakes],
        "mistake_taxonomy": sorted({
            "OFF_BY_ONE", "WRONG_LOOP_CONDITION", "WRONG_DATA_STRUCTURE", "WRONG_ALGORITHM",
            "LOGIC_ERROR", "BOUNDARY_ERROR", "EDGE_CASE_FAILURE", "INPUT_HANDLING",
            "STATE_MANAGEMENT", "TYPE_ERROR", "NULL_HANDLING", "RUNTIME_ERROR",
            "COMPILATION_ERROR", "COMPLEXITY_FAILURE", "PERFORMANCE_FAILURE",
            "API_ERROR", "ASYNC_ERROR", "UNKNOWN",
        }),
    }
    payload = {
        "challenge": challenge_meta,
        "evidence": evidence_payload,
        "submission": {"source_code": source_code},
    }

    try:
        raw = provider.complete_json(DIAGNOSIS_SYSTEM_PROMPT, payload, DIAGNOSIS_SCHEMA_HINT)
        parsed = AIStructuredDiagnosis.model_validate(raw)
    except (AIProviderError, Exception) as exc:  # noqa: BLE001 - deliberately broad: any bad output -> fallback
        fallback = _deterministic_only_diagnosis(evaluation, det_mistakes)
        fallback.recommendations = [f"(AI diagnosis unavailable: {exc})"]
        return DiagnosisOutcome(fallback, ai_status="AI_RESPONSE_INVALID", deterministic_mistakes=det_mistakes)

    # Merge: deterministic mistakes are always kept; AI-proposed ones are
    # appended as separate, lower-authority items rather than overwriting.
    merged_mistakes = det_mistakes + [
        m for m in parsed.mistakes if m.category not in {d.category for d in det_mistakes}
    ]
    parsed.mistakes = merged_mistakes

    return DiagnosisOutcome(parsed, ai_status="AI_GENERATED", deterministic_mistakes=det_mistakes)
