from app.services import execution_service
from app.services.evaluation_service import EvalTestCase, evaluate_attempt

GOOD_SUM = "import sys, json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n"
BAD_SYNTAX = "def broken(:\n    pass\n"
INFINITE_LOOP = "while True:\n    pass\n"
RUNTIME_CRASH = "import sys, json\nd=json.loads(sys.stdin.read())\nprint(1/0)\n"


def test_compile_check_catches_syntax_error():
    ok, err = execution_service.compile_check_python(BAD_SYNTAX)
    assert ok is False
    assert "line" in err


def test_real_execution_runs_actual_process():
    run = execution_service.run_python("print('hello')", "")
    assert run.status == "COMPLETED"
    assert run.stdout.strip() == "hello"


def test_timeout_is_enforced_on_infinite_loop():
    run = execution_service.run_python(INFINITE_LOOP, "")
    assert run.status == "TIMEOUT"


def test_runtime_error_is_captured_not_swallowed():
    run = execution_service.run_python(RUNTIME_CRASH, "{}")
    assert run.status == "RUNTIME_ERROR"
    assert run.exit_code != 0


def test_deterministic_evaluation_all_pass():
    tests = [
        EvalTestCase("t1", False, '{"a": 2, "b": 3}', "5"),
        EvalTestCase("t2", True, '{"a": -1, "b": 1}', "0"),
    ]
    evaluation, _ = evaluate_attempt(GOOD_SUM, "python", tests)
    assert evaluation.status == "PASSED"
    assert evaluation.tests_passed == 2
    assert evaluation.tests_failed == 0


def test_deterministic_evaluation_partial_fail_has_no_ai_involved():
    buggy = "import sys, json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']-d['b']))\n"  # wrong op
    tests = [EvalTestCase("t1", False, '{"a": 2, "b": 3}', "5")]
    evaluation, _ = evaluate_attempt(buggy, "python", tests)
    assert evaluation.status == "FAILED"
    assert evaluation.outcomes[0].failure_category == "LOGIC"


def test_compilation_error_short_circuits_remaining_tests_without_fabricating_pass():
    tests = [EvalTestCase("t1", False, "{}", "x"), EvalTestCase("t2", False, "{}", "y")]
    evaluation, _ = evaluate_attempt(BAD_SYNTAX, "python", tests)
    assert evaluation.status == "FAILED"
    assert evaluation.tests_passed == 0
    assert all(o.failure_category == "COMPILATION" for o in evaluation.outcomes)


def test_unsupported_language_fails_closed_as_system_error():
    evaluation, _ = evaluate_attempt("print(1)", "cobol", [EvalTestCase("t1", False, "{}", "1")])
    assert evaluation.status == "SYSTEM_ERROR"
