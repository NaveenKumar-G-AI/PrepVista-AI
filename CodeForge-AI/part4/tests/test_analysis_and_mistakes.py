from app.services.complexity_service import estimate_python_complexity
from app.services.evaluation_service import EvalTestCase, evaluate_attempt
from app.services.mistake_service import classify_from_evaluation
from app.services.static_analysis_service import analyze_python, get_loop_nesting_depth

NESTED_LOOPS = """
def f(arr):
    total = 0
    for i in arr:
        for j in arr:
            total += i * j
    return total
"""

FREQUENCY_BUG = """
import sys, json
d = json.loads(sys.stdin.read())
counts = {}
for item in d['items']:
    counts[item] = 1  # BUG: overwrites instead of incrementing
best = max(counts, key=lambda k: counts[k])
print(json.dumps(best))
"""


def test_static_analysis_returns_none_on_unparseable_code():
    assert analyze_python("def f(:\n") is None


def test_static_analysis_detects_nesting_and_loops():
    analysis = analyze_python(NESTED_LOOPS)
    assert analysis is not None
    assert analysis.function_count == 1
    assert "uses_loops" in analysis.patterns
    assert get_loop_nesting_depth(NESTED_LOOPS) == 2


def test_complexity_estimate_is_labeled_not_certain():
    estimate = estimate_python_complexity(NESTED_LOOPS)
    assert estimate.time_complexity == "O(n^2)"
    assert estimate.time_basis in ("INFERRED", "ESTIMATED")  # never claims OBSERVED from static analysis alone


def test_mistake_classification_maps_boundary_failure():
    tests = [EvalTestCase("t1", False, "{}", "x")]
    evaluation, _ = evaluate_attempt(
        "import sys, json\nd=json.loads(sys.stdin.read())\nprint(d['missing_key'])\n", "python", tests
    )
    mistakes = classify_from_evaluation(evaluation)
    assert len(mistakes) == 1
    assert mistakes[0].category in ("BOUNDARY_ERROR", "INPUT_HANDLING")


def test_frequency_counting_bug_is_caught_by_real_execution_not_assumed():
    """Mirrors the Phase 43 demo scenario: state-overwrite bug in a
    frequency counter. This must be caught by REAL execution against a
    duplicate-heavy test case, not asserted a priori."""
    tests = [EvalTestCase("dup", True, '{"items": [5, 5, 5, 1, 1, 1, 2]}', "1")]
    evaluation, _ = evaluate_attempt(FREQUENCY_BUG, "python", tests)
    assert evaluation.status == "FAILED"
    assert evaluation.outcomes[0].passed is False
