import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from complexity_engine.resolver import analyze
from complexity_engine.persistence.store import Store

QUADRATIC = "def f(n):\n    c=0\n    for i in range(n):\n        for j in range(n):\n            c+=1\n    return c\n"
LINEARITHMIC = "def f(arr):\n    return sorted(arr)\n"
LINEAR = "def f(arr):\n    t=0\n    for x in arr:\n        t+=x\n    return t\n"


def _store():
    return Store(":memory:")


def test_save_and_retrieve():
    store = _store()
    report = analyze(QUADRATIC, language="python")
    saved = store.save_assessment(report, submission_id="sub-1", user_id="user-1", problem_id="prob-1")
    assert saved.was_cached is False
    fetched = store.get_assessment(saved.id)
    assert fetched["time_complexity"] == "O(n^2)"
    assert fetched["submission_id"] == "sub-1"


def test_idempotent_on_identical_submission():
    store = _store()
    report = analyze(QUADRATIC, language="python")
    first = store.save_assessment(report, submission_id="sub-1", user_id="user-1", problem_id="prob-1")
    second = store.save_assessment(report, submission_id="sub-1", user_id="user-1", problem_id="prob-1")
    assert first.id == second.id
    assert second.was_cached is True
    rows = store.conn.execute("SELECT COUNT(*) c FROM complexity_assessments").fetchone()["c"]
    assert rows == 1  # no duplicate record for the same immutable submission


def test_findings_are_persisted():
    store = _store()
    report = analyze(QUADRATIC, language="python")
    saved = store.save_assessment(report, submission_id="sub-1", user_id="user-1")
    findings = store.get_findings(saved.id)
    assert len(findings) == len(report.findings)
    assert len(findings) > 0


def test_history_and_regression_detection():
    store = _store()

    r1 = analyze(QUADRATIC, language="python")  # O(n^2) first attempt
    store.save_assessment(r1, submission_id="sub-1", user_id="user-1", problem_id="prob-1")

    r2 = analyze(LINEARITHMIC, language="python")  # O(n log n) second attempt — improvement
    store.save_assessment(r2, submission_id="sub-2", user_id="user-1", problem_id="prob-1")

    history = store.get_history("user-1", "prob-1")
    assert len(history) == 2
    assert history[0]["attempt_number"] == 1
    assert history[1]["attempt_number"] == 2

    assert store.detect_regression("user-1", "prob-1") == "improvement"


def test_regression_detected_when_complexity_worsens():
    store = _store()
    r1 = analyze(LINEAR, language="python")
    store.save_assessment(r1, submission_id="sub-1", user_id="user-1", problem_id="prob-1")
    r2 = analyze(QUADRATIC, language="python")
    store.save_assessment(r2, submission_id="sub-2", user_id="user-1", problem_id="prob-1")
    assert store.detect_regression("user-1", "prob-1") == "regression"


def test_no_regression_signal_with_single_attempt():
    store = _store()
    r1 = analyze(QUADRATIC, language="python")
    store.save_assessment(r1, submission_id="sub-1", user_id="user-1", problem_id="prob-1")
    assert store.detect_regression("user-1", "prob-1") is None


def test_different_users_histories_are_independent():
    store = _store()
    r1 = analyze(QUADRATIC, language="python")
    store.save_assessment(r1, submission_id="sub-1", user_id="user-A", problem_id="prob-1")
    r2 = analyze(LINEAR, language="python")
    store.save_assessment(r2, submission_id="sub-2", user_id="user-B", problem_id="prob-1")
    assert len(store.get_history("user-A", "prob-1")) == 1
    assert len(store.get_history("user-B", "prob-1")) == 1
