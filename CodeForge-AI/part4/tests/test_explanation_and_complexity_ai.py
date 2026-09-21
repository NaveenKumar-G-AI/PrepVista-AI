from app.services.ai.stub_provider import StubProvider
from app.services.complexity_service import estimate_python_complexity, refine_with_ai
from app.services.explanation_service import evaluate_explanation

RECURSIVE_FIB = """
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
"""

ITERATIVE_SUM = """
def total(arr):
    s = 0
    for x in arr:
        s += x
    return s
"""


def test_explanation_not_provided_is_not_applicable_no_ai_call_needed():
    outcome = evaluate_explanation(StubProvider(), {"title": "x"}, "print(1)", None)
    assert outcome.provided is False
    assert outcome.ai_status == "NOT_APPLICABLE"
    assert outcome.evaluation is None


def test_explanation_provided_without_provider_is_pending_not_fabricated():
    outcome = evaluate_explanation(None, {"title": "x"}, "print(1)", "I used a loop because it's simple.")
    assert outcome.provided is True
    assert outcome.ai_status == "AI_EVALUATION_PENDING"
    assert outcome.evaluation is None


def test_explanation_provided_with_provider_is_evaluated():
    # StubProvider doesn't implement explanation-shaped output, so this
    # exercises the AI_RESPONSE_INVALID path — proving a malformed/
    # mismatched response is caught, not silently accepted.
    outcome = evaluate_explanation(StubProvider(), {"title": "x"}, "print(1)", "Because loops are simple.")
    assert outcome.provided is True
    assert outcome.ai_status in ("AI_GENERATED", "AI_RESPONSE_INVALID")


def test_complexity_refinement_not_attempted_for_simple_iterative_code():
    estimate = estimate_python_complexity(ITERATIVE_SUM)
    refined, ai_status, _reasoning = refine_with_ai(StubProvider(), estimate, ITERATIVE_SUM, {"title": "x"})
    assert ai_status == "NOT_ATTEMPTED"  # static estimate was already fine, no AI needed
    assert refined.time_complexity == estimate.time_complexity


def test_complexity_refinement_attempted_for_recursive_code_without_provider_is_pending():
    estimate = estimate_python_complexity(RECURSIVE_FIB)
    assert "recursi" in estimate.reasoning.lower()  # static analysis correctly flags its own uncertainty
    refined, ai_status, _reasoning = refine_with_ai(None, estimate, RECURSIVE_FIB, {"title": "x"})
    assert ai_status == "AI_EVALUATION_PENDING"
    assert refined.time_basis == "ESTIMATED"  # unchanged, still honest about being an estimate


def test_complexity_never_states_a_confident_wrong_number_for_pure_recursion():
    """Regression test: a purely-recursive function (no loops at all) used
    to get 'O(1)' — the loop-nesting heuristic's answer for zero loops —
    presented as if it were a real estimate, even though the function is
    doing real recursive work. That's a specific, confident-looking number
    the system already knows is very likely wrong, which is worse than
    saying nothing. It must not state a time_complexity value here."""
    estimate = estimate_python_complexity(RECURSIVE_FIB)
    assert estimate.time_complexity is None
    assert "no loops were found" in estimate.reasoning.lower()


def test_complexity_refinement_never_promotes_to_observed_even_with_ai():
    estimate = estimate_python_complexity(RECURSIVE_FIB)

    class _ConfidentStub(StubProvider):
        def complete_json(self, system_prompt, user_payload, schema_hint):
            return {"time_complexity": "O(2^n)", "space_complexity": "O(n)",
                    "reasoning": "Each call branches into two further calls down to depth n.", "confident": True}

    refined, ai_status, reasoning = refine_with_ai(_ConfidentStub(), estimate, RECURSIVE_FIB, {"title": "x"})
    assert ai_status == "AI_GENERATED"
    assert refined.time_complexity == "O(2^n)"
    assert refined.time_basis == "ESTIMATED"  # never OBSERVED, no matter how confident the AI is
    assert reasoning is not None
