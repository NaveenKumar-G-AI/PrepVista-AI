import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from complexity_engine.api.server import app, get_store
from complexity_engine.api.auth import AuthenticatedUser, get_current_user
from complexity_engine.persistence.store import Store

QUADRATIC = "def f(n):\n    c=0\n    for i in range(n):\n        for j in range(n):\n            c+=1\n    return c\n"


@pytest.fixture()
def client():
    test_store = Store(":memory:")
    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-1", claims={})
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health():
    with TestClient(app) as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


def test_analyze_end_to_end(client):
    r = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1", "problem_id": "prob-1"})
    assert r.status_code == 200
    body = r.json()
    assert body["report"]["time_complexity"]["notation"] == "O(n^2)"
    assert body["was_cached"] is False
    assert body["assessment_id"]


def test_analyze_is_idempotent_over_http(client):
    r1 = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1"})
    r2 = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1"})
    assert r1.json()["assessment_id"] == r2.json()["assessment_id"]
    assert r2.json()["was_cached"] is True


def test_regression_detected_over_http(client):
    linear = "def f(arr):\n    t=0\n    for x in arr:\n        t+=x\n    return t\n"
    r1 = client.post("/analyze", json={"source": linear, "submission_id": "sub-1", "problem_id": "prob-1"})
    r2 = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-2", "problem_id": "prob-1"})
    assert r1.json()["regression"] is None  # first attempt, nothing to compare
    assert r2.json()["regression"] == "regression"


def test_unsupported_language_returns_422(client):
    r = client.post("/analyze", json={"source": "int main(){}", "language": "cpp", "submission_id": "sub-1"})
    assert r.status_code == 422


def test_syntax_error_returns_422(client):
    r = client.post("/analyze", json={"source": "def f(:\n  pass", "submission_id": "sub-1"})
    assert r.status_code == 422


def test_can_read_back_own_report(client):
    posted = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1"}).json()
    got = client.get(f"/reports/{posted['assessment_id']}")
    assert got.status_code == 200
    assert got.json()["time_complexity"]["notation"] == "O(n^2)"


def test_cannot_read_another_users_report():
    test_store = Store(":memory:")
    app.dependency_overrides[get_store] = lambda: test_store

    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-A", claims={})
    client_a = TestClient(app)
    posted = client_a.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1"}).json()

    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-B", claims={})
    client_b = TestClient(app)
    resp = client_b.get(f"/reports/{posted['assessment_id']}")

    app.dependency_overrides.clear()
    assert resp.status_code == 404  # not found, not forbidden — existence isn't confirmed either


def test_history_endpoint(client):
    client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1", "problem_id": "prob-1"})
    r = client.get("/history/prob-1")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_ai_explanation_absence_does_not_break_analyze(client):
    # No GROQ_API_KEY/GEMINI_API_KEY configured in this environment —
    # requesting an explanation must degrade gracefully, not fail the call.
    for var in ("GROQ_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(var, None)
    r = client.post("/analyze", json={"source": QUADRATIC, "submission_id": "sub-1", "include_ai_explanation": True})
    assert r.status_code == 200
    assert r.json()["report"]["ai_explanation"] is None
    assert r.json()["report"]["time_complexity"]["notation"] == "O(n^2)"
