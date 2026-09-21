from fastapi.testclient import TestClient

from app.auth import issue_dev_token
from app.main import app
from app.rate_limit import reset_rate_limits_for_tests

client = TestClient(app)

BUGGY_FREQ_COUNTER = """\
import sys, json
d = json.loads(sys.stdin.read())
counts = {}
for item in d['items']:
    counts[item] = 1  # BUG: overwrites instead of incrementing
best = min((k for k in counts), key=lambda k: (-counts[k], k))
print(json.dumps(best))
"""

FIXED_FREQ_COUNTER = """\
import sys, json
d = json.loads(sys.stdin.read())
counts = {}
for item in d['items']:
    counts[item] = counts.get(item, 0) + 1
best = min((k for k in counts), key=lambda k: (-counts[k], k))
print(json.dumps(best))
"""


def _auth_header(student_id: str) -> dict:
    return {"Authorization": f"Bearer {issue_dev_token(student_id)}"}


def setup_function(_fn):
    # Rate limiting is process-global state; isolate each test.
    reset_rate_limits_for_tests()


def test_full_pipeline_attempt1_fails_attempt2_passes_and_evidence_of_improvement_is_recorded():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)

    # Attempt 1: buggy state-overwrite bug (same bug class described in the Phase 43 demo).
    # POST returns fast with deterministic results only; TestClient runs the
    # scheduled background task to completion before control returns here,
    # so the very next GET already reflects the finished analysis — a real
    # deployment's client would poll until analysis_status == "COMPLETE".
    resp1 = client.post("/attempts", headers=headers, json={
        "challenge_id": "most-frequent-element",
        "challenge_version": 1,
        "language": "python",
        "source_code": BUGGY_FREQ_COUNTER,
        "hint_count": 0,
        "hint_level": 0,
        "client_request_id": "test-req-1",
    })
    assert resp1.status_code == 200, resp1.text
    immediate1 = resp1.json()
    assert immediate1["evaluation_status"] == "EVALUATED"
    assert immediate1["evaluation"]["status"] == "FAILED"
    assert immediate1["analysis_status"] == "PENDING"
    hidden_in_immediate = [o for o in immediate1["evaluation"]["outcomes"] if o["is_hidden"]]
    assert hidden_in_immediate, "seed data should include hidden tests"
    assert all(o["expected_result"] is None and o["actual_result"] is None for o in hidden_in_immediate)

    full1 = client.get(f"/attempts/{immediate1['attempt_id']}", headers=headers).json()
    assert full1["analysis_status"] == "COMPLETE"
    assert full1["diagnosis"]["ai_status"] == "AI_EVALUATION_PENDING"  # no API key configured in this sandbox
    assert full1["feedback"]["ai_status"] == "AI_EVALUATION_PENDING"
    assert full1["skill_state"]["skill_id"] == "hash_maps"
    hidden_in_full = [o for o in full1["evaluation"]["outcomes"] if o["is_hidden"]]
    assert all(o["expected_result"] is None and o["actual_result"] is None for o in hidden_in_full)

    # Attempt 2: fixed code.
    resp2 = client.post("/attempts", headers=headers, json={
        "challenge_id": "most-frequent-element",
        "challenge_version": 1,
        "language": "python",
        "source_code": FIXED_FREQ_COUNTER,
        "hint_count": 0,
        "hint_level": 0,
        "client_request_id": "test-req-2",
    })
    assert resp2.status_code == 200, resp2.text
    immediate2 = resp2.json()
    assert immediate2["evaluation"]["status"] == "PASSED"
    assert immediate2["attempt_number"] == 2

    full2 = client.get(f"/attempts/{immediate2['attempt_id']}", headers=headers).json()
    assert full2["retry_comparison"]["improved"] is True
    assert full2["next_challenge_suggestion"] is not None  # only offered on a pass


def test_idempotent_double_submit_does_not_create_two_attempts():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    payload = {
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
        "hint_count": 0, "hint_level": 0, "client_request_id": "idempotency-check-1",
    }
    r1 = client.post("/attempts", headers=headers, json=payload)
    r2 = client.post("/attempts", headers=headers, json=payload)
    assert r1.json()["attempt_id"] == r2.json()["attempt_id"]
    # Second call hit the idempotency branch, which returns the FULL
    # assembled response (not just the immediate one) — analysis is
    # already complete because the first call's background task ran.
    assert r2.json()["analysis_status"] == "COMPLETE"


def test_student_cannot_access_another_students_attempt():
    student_a = "stu_demo_1"
    student_b = "stu_intruder"
    headers_a = _auth_header(student_a)
    headers_b = _auth_header(student_b)

    resp = client.post("/attempts", headers=headers_a, json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
        "hint_count": 0, "hint_level": 0, "client_request_id": "ownership-check-1",
    })
    attempt_id = resp.json()["attempt_id"]

    forbidden = client.get(f"/attempts/{attempt_id}", headers=headers_b)
    assert forbidden.status_code == 403

    ok = client.get(f"/attempts/{attempt_id}", headers=headers_a)
    assert ok.status_code == 200


def test_unauthenticated_request_is_rejected():
    resp = client.post("/attempts", json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "print(1)", "hint_count": 0, "hint_level": 0, "client_request_id": "no-auth-1",
    })
    assert resp.status_code in (401, 422)  # 422 if header missing entirely per FastAPI validation


def test_malicious_infinite_loop_submission_times_out_and_is_not_a_system_crash():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    resp = client.post("/attempts", headers=headers, json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "while True:\n    pass\n",
        "hint_count": 0, "hint_level": 0, "client_request_id": "malicious-loop-1",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["evaluation"]["status"] == "FAILED"
    assert all(o["status"] == "TIMEOUT" for o in body["evaluation"]["outcomes"])
    # Background analysis still runs and completes even on a fully-failing attempt.
    full = client.get(f"/attempts/{body['attempt_id']}", headers=headers).json()
    assert full["analysis_status"] == "COMPLETE"


def test_student_report_endpoint_reflects_real_stored_evidence():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    resp = client.post("/attempts", headers=headers, json={
        "challenge_id": "binary-search", "challenge_version": 1, "language": "python",
        "source_code": (
            "import sys, json\nd = json.loads(sys.stdin.read())\narr, target = d['arr'], d['target']\n"
            "lo, hi = 0, len(arr) - 1\nresult = -1\n"
            "while lo <= hi:\n    mid = (lo + hi) // 2\n"
            "    if arr[mid] == target:\n        result = mid\n        break\n"
            "    elif arr[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\n"
            "print(json.dumps(result))\n"
        ),
        "hint_count": 0, "hint_level": 0, "client_request_id": "binsearch-1",
    })
    attempt_id = resp.json()["attempt_id"]
    report = client.get(f"/students/{student_id}/report/{attempt_id}", headers=headers)
    assert report.status_code == 200
    body = report.json()
    assert body["title"] == "CODING ATTEMPT REVIEW"
    assert "tests passed" in body["result"]
    assert body["analysis_status"] == "COMPLETE"


def test_oversized_submission_is_rejected_before_execution():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    resp = client.post("/attempts", headers=headers, json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "x = 1\n" * 20_000,  # well past the 50,000 char limit
        "hint_count": 0, "hint_level": 0, "client_request_id": "oversized-1",
    })
    assert resp.status_code == 422


def test_rate_limit_blocks_excessive_submissions():
    student_id = "stu_rate_limit_test"
    headers = _auth_header(student_id)
    last_status = None
    for i in range(12):
        resp = client.post("/attempts", headers=headers, json={
            "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
            "source_code": "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
            "hint_count": 0, "hint_level": 0, "client_request_id": f"rate-limit-{i}",
        })
        last_status = resp.status_code
    assert last_status == 429


def test_explanation_provided_produces_explanation_evaluation_row():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    resp = client.post("/attempts", headers=headers, json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
        "explanation_text": "I just added the two numbers together since that's what the problem asked.",
        "hint_count": 0, "hint_level": 0, "client_request_id": "explanation-check-1",
    })
    full = client.get(f"/attempts/{resp.json()['attempt_id']}", headers=headers).json()
    assert full["explanation_evaluation"] is not None
    assert bool(full["explanation_evaluation"]["provided"]) is True
    # No AI provider configured in this sandbox -> pending, not fabricated.
    assert full["explanation_evaluation"]["ai_status"] == "AI_EVALUATION_PENDING"


def test_no_explanation_provided_is_not_applicable_not_pending():
    student_id = "stu_demo_1"
    headers = _auth_header(student_id)
    resp = client.post("/attempts", headers=headers, json={
        "challenge_id": "sum-two-numbers", "challenge_version": 1, "language": "python",
        "source_code": "import sys,json\nd=json.loads(sys.stdin.read())\nprint(json.dumps(d['a']+d['b']))\n",
        "hint_count": 0, "hint_level": 0, "client_request_id": "no-explanation-1",
    })
    full = client.get(f"/attempts/{resp.json()['attempt_id']}", headers=headers).json()
    assert full["explanation_evaluation"]["ai_status"] == "NOT_APPLICABLE"
    assert bool(full["explanation_evaluation"]["provided"]) is False
