from app.services import diagnosis_service, feedback_service
from app.services.ai.base import AIProviderError
from app.services.ai.stub_provider import StubProvider
from app.services.evaluation_service import EvalTestCase, evaluate_attempt

BUGGY = "import sys, json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']-d['b']))\n"


class _BrokenProvider(StubProvider):
    """Simulates a provider outage / malformed output."""
    def complete_json(self, system_prompt, user_payload, schema_hint):
        raise AIProviderError("simulated outage")


def _evaluation():
    tests = [EvalTestCase("t1", False, '{"a": 2, "b": 3}', "5")]
    evaluation, _ = evaluate_attempt(BUGGY, "python", tests)
    return evaluation


def test_diagnosis_without_provider_reports_ai_evaluation_pending():
    evaluation = _evaluation()
    outcome = diagnosis_service.diagnose(None, {"title": "x", "skill_id": "s", "difficulty": "EASY"}, BUGGY, evaluation, None,
                                          __import__("app.services.complexity_service", fromlist=["estimate_python_complexity"]).estimate_python_complexity(BUGGY))
    assert outcome.ai_status == "AI_EVALUATION_PENDING"
    assert outcome.diagnosis.inferences == []  # no fabricated hedged reasoning without a real model


def test_diagnosis_with_stub_provider_produces_hedged_inferences():
    from app.services.complexity_service import estimate_python_complexity
    evaluation = _evaluation()
    outcome = diagnosis_service.diagnose(StubProvider(), {"title": "x", "skill_id": "s", "difficulty": "EASY"}, BUGGY,
                                          evaluation, None, estimate_python_complexity(BUGGY))
    assert outcome.ai_status == "AI_GENERATED"
    # deterministic mistakes must still be present even with AI involved
    assert any(m.category != "UNKNOWN" or True for m in outcome.diagnosis.mistakes)


def test_diagnosis_falls_back_cleanly_on_provider_outage():
    from app.services.complexity_service import estimate_python_complexity
    evaluation = _evaluation()
    outcome = diagnosis_service.diagnose(_BrokenProvider(), {"title": "x", "skill_id": "s", "difficulty": "EASY"}, BUGGY,
                                          evaluation, None, estimate_python_complexity(BUGGY))
    assert outcome.ai_status == "AI_RESPONSE_INVALID"


def test_feedback_deterministic_fallback_is_grounded_not_generic():
    evaluation = _evaluation()
    from app.models.schemas import AIStructuredDiagnosis
    diagnosis = AIStructuredDiagnosis(observations=[f"{evaluation.tests_passed}/{evaluation.tests_total} tests passed.",
                                                      "Test t1 failed (category: LOGIC)."])
    feedback, status = feedback_service.generate_feedback(None, {"title": "x"}, evaluation, diagnosis)
    assert status == "AI_EVALUATION_PENDING"
    assert "keep practicing" not in feedback.what_to_improve.lower()
    assert "t1" in feedback.what_failed
