from __future__ import annotations

from typing import Any

from .base import AIProvider


class StubProvider(AIProvider):
    """
    TEST DOUBLE ONLY. Deterministically derives a structurally-valid
    response from the evidence it's given so unit/integration tests can
    exercise diagnosis_service/feedback_service without hitting a real
    network. It must never be wired up as the production default —
    production with no configured provider must report AI_EVALUATION_PENDING
    instead (see diagnosis_service.py / feedback_service.py), because
    presenting stub text as if it were model output would itself violate
    the "never present a fabricated diagnosis as authoritative" rule.
    """

    name = "stub"

    def complete_json(self, system_prompt: str, user_payload: dict[str, Any], schema_hint: str) -> dict:
        evidence = user_payload.get("evidence", {})
        failed = evidence.get("failed_categories", [])
        observations = [f"{evidence.get('tests_passed', 0)}/{evidence.get('tests_total', 0)} tests passed."]
        if failed:
            observations.append(f"Failing test categories observed: {', '.join(sorted(set(failed)))}.")

        inferences = []
        mistakes = []
        if "BOUNDARY" in failed or "EDGE_CASE" in failed:
            inferences.append("The implementation may not correctly handle boundary/edge-case inputs.")
            mistakes.append({
                "category": "BOUNDARY_ERROR",
                "evidence": "Public/hidden tests covering boundary or edge-case inputs failed.",
                "confidence": "MEDIUM",
                "severity": "MEDIUM",
            })
        if "TIMEOUT" in failed:
            inferences.append("The current approach may not scale within the time limit for larger inputs.")
            mistakes.append({
                "category": "PERFORMANCE_FAILURE",
                "evidence": "Execution exceeded the allotted time limit on at least one test case.",
                "confidence": "MEDIUM",
                "severity": "HIGH",
            })
        if not failed:
            inferences.append("No failure evidence to analyze beyond what deterministic evaluation already reports.")

        strengths = []
        if evidence.get("tests_passed", 0) > 0:
            strengths.append("Correctly handles at least some of the required cases.")

        return {
            "observations": observations,
            "inferences": inferences,
            "mistakes": mistakes,
            "strengths": strengths,
            "recommendations": ["Re-examine handling of the failing categories listed above."] if failed else [],
            "confidence": "MEDIUM" if failed else "HIGH",
        }
