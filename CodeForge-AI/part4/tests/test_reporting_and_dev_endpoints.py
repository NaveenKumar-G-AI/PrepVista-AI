from fastapi.testclient import TestClient

from app.auth import issue_dev_token
from app.main import app
from app.rate_limit import reset_rate_limits_for_tests

client = TestClient(app)


def setup_function(_fn):
    reset_rate_limits_for_tests()


def _submit(student_id: str, challenge_id: str, source: str, client_request_id: str, headers=None):
    headers = headers or {"Authorization": f"Bearer {issue_dev_token(student_id)}"}
    return client.post("/attempts", headers=headers, json={
        "challenge_id": challenge_id, "challenge_version": 1, "language": "python",
        "source_code": source, "hint_count": 0, "hint_level": 0, "client_request_id": client_request_id,
    })


def test_dev_token_issues_a_usable_token_for_the_requested_role():
    resp = client.post("/dev/token", json={"subject_id": "stu_token_test", "role": "student"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    # A minted student token should work for a student-only action.
    skills = client.get("/students/stu_token_test/skills", headers=headers)
    assert skills.status_code == 200


def test_dev_token_role_is_signed_and_cannot_be_tampered_with():
    resp = client.post("/dev/token", json={"subject_id": "stu_tamper_test", "role": "student"})
    token = resp.json()["token"]
    # Flip the role field in the token string directly (simulating a client
    # trying to self-escalate) without re-signing — must fail closed.
    parts = token.split(":")
    parts[1] = "staff"
    forged = ":".join(parts)
    resp2 = client.get("/reports/cohort/completion", headers={"Authorization": f"Bearer {forged}"})
    assert resp2.status_code == 401  # signature no longer matches -> rejected, not silently trusted


def test_list_challenges_returns_seed_data_without_hidden_tests():
    resp = client.get("/challenges")
    assert resp.status_code == 200
    body = resp.json()
    ids = {c["challenge_id"] for c in body["challenges"]}
    assert {"sum-two-numbers", "most-frequent-element", "binary-search"}.issubset(ids)
    # The list view is intentionally slim (id/title/skill/difficulty) —
    # starter code and test cases are only ever returned by the per-challenge
    # detail endpoint, which itself never returns hidden tests.
    for c in body["challenges"]:
        assert "starter_code" not in c
        assert "public_tests" not in c


def test_list_challenges_orders_easiest_first_not_alphabetically():
    """Regression test: a plain alphabetical ORDER BY difficulty puts
    'ADVANCED' before 'EASY' (A < E) — caught by an actual frontend-driver
    run that showed the hardest seed challenge loading as the default
    instead of the easiest one."""
    resp = client.get("/challenges")
    difficulties = [c["difficulty"] for c in resp.json()["challenges"]]
    rank = {"EASY": 0, "INTERMEDIATE": 1, "ADVANCED": 2}
    ranks = [rank[d] for d in difficulties]
    assert ranks == sorted(ranks)
    assert difficulties[0] == "EASY"


def test_staff_only_reports_reject_student_tokens():
    student_headers = {"Authorization": f"Bearer {issue_dev_token('stu_not_staff', role='student')}"}
    for path in (
        "/reports/cohort/skill-distribution",
        "/reports/cohort/common-mistakes",
        "/reports/cohort/completion",
        "/reports/cohort/improvement",
    ):
        resp = client.get(path, headers=student_headers)
        assert resp.status_code == 403, path


def test_staff_reports_return_aggregate_data_with_no_student_identity_fields():
    staff_headers = {"Authorization": f"Bearer {issue_dev_token('staff_1', role='staff')}"}

    # Generate some real evidence for the reports to aggregate over.
    _submit("stu_report_a", "sum-two-numbers",
            "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
            "report-gen-1")
    _submit("stu_report_b", "sum-two-numbers",
            "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']-d['b']))\n",  # wrong op -> fails
            "report-gen-2")

    dist = client.get("/reports/cohort/skill-distribution", headers=staff_headers)
    assert dist.status_code == 200
    for row in dist.json()["distribution"]:
        assert "student_id" not in row  # aggregate only, no identity

    mistakes = client.get("/reports/cohort/common-mistakes", headers=staff_headers)
    assert mistakes.status_code == 200
    for row in mistakes.json()["mistakes"]:
        assert "student_id" not in row
        assert "evidence_text" not in row  # never expose the raw evidence string in aggregate view

    completion = client.get("/reports/cohort/completion", headers=staff_headers)
    assert completion.status_code == 200
    assert any(row["challenge_id"] == "sum-two-numbers" for row in completion.json()["completion"])

    improvement = client.get("/reports/cohort/improvement", headers=staff_headers)
    assert improvement.status_code == 200  # shape covered even if empty for these single-attempt submissions
