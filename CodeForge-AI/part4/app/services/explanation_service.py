"""
Explanation evaluation (Phase 15-16). If a challenge supports it and the
student answered "why did you choose this approach?", this service
assesses conceptual understanding and whether the stated reasoning
matches the actual submitted code — as its OWN AI responsibility (Phase
10), separate from failure diagnosis and feedback generation.

Explanation is optional (Phase 16: "Do not require explanation for every
challenge"): if the student didn't provide one, this returns a
NOT_APPLICABLE result immediately, no AI call, no evidence generated.
"""
from __future__ import annotations

from app.models.schemas import ExplanationEvaluation
from app.services.ai.base import AIProvider, AIProviderError
from app.services.ai.prompts import EXPLANATION_SCHEMA_HINT, EXPLANATION_SYSTEM_PROMPT


class ExplanationOutcome:
    def __init__(self, provided: bool, evaluation: ExplanationEvaluation | None, ai_status: str):
        self.provided = provided
        self.evaluation = evaluation
        self.ai_status = ai_status  # AI_GENERATED | AI_EVALUATION_PENDING | AI_RESPONSE_INVALID | NOT_APPLICABLE


def evaluate_explanation(
    provider: AIProvider | None,
    challenge_meta: dict,
    source_code: str,
    explanation_text: str | None,
) -> ExplanationOutcome:
    if not explanation_text or not explanation_text.strip():
        return ExplanationOutcome(provided=False, evaluation=None, ai_status="NOT_APPLICABLE")

    if provider is None or not provider.is_available():
        return ExplanationOutcome(provided=True, evaluation=None, ai_status="AI_EVALUATION_PENDING")

    payload = {
        "challenge": challenge_meta,
        "evidence": {},
        "submission": {"source_code": source_code, "explanation_text": explanation_text},
    }
    try:
        raw = provider.complete_json(EXPLANATION_SYSTEM_PROMPT, payload, EXPLANATION_SCHEMA_HINT)
        parsed = ExplanationEvaluation.model_validate(raw)
        return ExplanationOutcome(provided=True, evaluation=parsed, ai_status="AI_GENERATED")
    except (AIProviderError, Exception):  # noqa: BLE001 - any bad output -> explicit invalid state, no fabrication
        return ExplanationOutcome(provided=True, evaluation=None, ai_status="AI_RESPONSE_INVALID")
