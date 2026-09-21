"""
Deterministic evaluation (Phase 5) + test failure analysis (Phase 6).

This is the authoritative source of truth for pass/fail. Nothing here is
overridable by an AI call — diagnosis/feedback consume this output, they
never produce or contradict it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from app.models.schemas import CaseOutcome, DeterministicEvaluation
from app.services import execution_service


@dataclass
class EvalTestCase:
    test_id: str
    is_hidden: bool
    input_data: str
    expected_output: str


def _classify_failure(run: execution_service.RunResult, expected: str | None, actual: str | None) -> str:
    """Maps observed execution facts to the fixed failure taxonomy.
    Falls back to UNKNOWN rather than guessing (Phase 6)."""
    if run.status == "COMPILATION_ERROR":
        return "COMPILATION"
    if run.status == "TIMEOUT":
        return "TIMEOUT"
    if run.status == "RUNTIME_ERROR":
        stderr = (run.stderr or "").lower()
        if "recursionerror" in stderr or "memoryerror" in stderr:
            return "MEMORY"
        if "indexerror" in stderr or "keyerror" in stderr:
            return "BOUNDARY"
        if "typeerror" in stderr or "valueerror" in stderr:
            return "INPUT_HANDLING"
        return "RUNTIME"
    if run.status == "COMPLETED" and expected is not None and actual is not None and expected != actual:
        # Heuristic (deterministic, not AI): distinguish edge-case vs general
        # logic failures using the test's declared shape, when we can.
        try:
            exp_val = json.loads(expected)
            act_val = json.loads(actual)
            both_sized = isinstance(exp_val, (list, str)) and isinstance(act_val, (list, str))
            if both_sized and (len(exp_val) == 0 or len(act_val) == 0):
                return "EDGE_CASE"
        except (json.JSONDecodeError, TypeError):
            pass
        return "LOGIC"
    return "UNKNOWN"


def evaluate_attempt(source_code: str, language: str, tests: list[EvalTestCase]) -> tuple[DeterministicEvaluation, execution_service.RunResult | None]:
    if language != "python":
        # Fail closed, honestly, rather than silently treating it as Python.
        empty = DeterministicEvaluation(
            status="SYSTEM_ERROR", tests_total=0, tests_passed=0, tests_failed=0, outcomes=[]
        )
        return empty, None

    outcomes: list[CaseOutcome] = []
    any_system_error = False
    max_runtime = 0.0
    last_run: execution_service.RunResult | None = None

    for tc in tests:
        run = execution_service.run_against_test(source_code, tc.input_data)
        last_run = run
        actual = run.stdout.strip() if run.status == "COMPLETED" else None
        expected = tc.expected_output.strip()
        passed = run.status == "COMPLETED" and actual == expected
        category = None if passed else _classify_failure(run, expected, actual)

        if run.status == "SYSTEM_ERROR":
            any_system_error = True

        max_runtime = max(max_runtime, run.runtime_ms)

        outcomes.append(CaseOutcome(
            test_id=tc.test_id,
            is_hidden=tc.is_hidden,
            passed=passed,
            status=run.status,
            runtime_ms=run.runtime_ms,
            memory_kb=run.memory_kb,
            expected_result=expected,
            actual_result=actual,
            failure_category=category,
        ))

        # A single compilation error means every remaining test is the same
        # outcome — no point burning execution budget re-running it.
        if run.status == "COMPILATION_ERROR":
            for remaining in tests[len(outcomes):]:
                outcomes.append(CaseOutcome(
                    test_id=remaining.test_id, is_hidden=remaining.is_hidden,
                    passed=False, status="COMPILATION_ERROR",
                    failure_category="COMPILATION",
                ))
            break

    tests_total = len(outcomes)
    tests_passed = sum(1 for o in outcomes if o.passed)
    tests_failed = tests_total - tests_passed

    if any_system_error:
        status = "SYSTEM_ERROR"
    elif tests_passed == tests_total and tests_total > 0:
        status = "PASSED"
    else:
        status = "FAILED"

    evaluation = DeterministicEvaluation(
        status=status,
        tests_total=tests_total,
        tests_passed=tests_passed,
        tests_failed=tests_failed,
        runtime_ms_max=max_runtime,
        outcomes=outcomes,
    )
    return evaluation, last_run
