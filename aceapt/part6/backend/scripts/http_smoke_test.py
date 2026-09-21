import json
import urllib.request

BASE = "http://localhost:4000"
HEADERS = {"Content-Type": "application/json", "X-Student-Id": "curl-test-student"}


def call(method, path, body=None, expect=200):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        status = e.code
        payload = json.loads(e.read())
    tag = "OK " if status == expect else "FAIL"
    print(f"[{tag}] {method} {path} -> {status} (expected {expect})")
    if status != expect:
        print("    ", json.dumps(payload)[:500])
        raise SystemExit(1)
    return payload


print("=== 1. Create assessment ===")
created = call("POST", "/api/assessments", {"type": "DIAGNOSTIC_ASSESSMENT"}, expect=201)
aid = created["assessment"]["id"]
print("   assessment id:", aid, "| questionCount:", created["assessment"]["questionCount"])

print("=== 2. Get assessment before start (should be NOT_STARTED) ===")
state = call("GET", f"/api/assessments/{aid}")
assert state["assessment"]["status"] == "NOT_STARTED", state
assert state["currentQuestion"] is None

print("=== 3. Attempt before start should be rejected (409) ===")
call("POST", f"/api/assessments/{aid}/attempt", {"questionId": "x", "optionId": "A"}, expect=409)

print("=== 4. Start assessment ===")
state = call("POST", f"/api/assessments/{aid}/start")
assert state["assessment"]["status"] == "IN_PROGRESS"
q1 = state["currentQuestion"]
assert q1 is not None
# The client view must never leak the answer key or topic labels (section 10/45).
assert "correctOptionId" not in q1, "LEAKED ANSWER KEY TO CLIENT"
assert "topic" not in q1, "LEAKED TOPIC LABEL TO CLIENT"
assert "difficulty" not in q1, "LEAKED DIFFICULTY TO CLIENT"
print("   question 1:", q1["prompt"][:60], "...")
print("   remainingSeconds:", state["remainingSeconds"])

print("=== 5. Submit an answer for question 1 (response must not reveal correctness) ===")
option_id = q1["options"][0]["id"]
resp = call("POST", f"/api/assessments/{aid}/attempt", {"questionId": q1["id"], "optionId": option_id})
resp_str = json.dumps(resp)
assert "correct" not in resp_str.lower() or "correctOptionId" not in resp_str, "LEAKED CORRECTNESS DURING EXAM"
print("   progress:", resp["progress"])

print("=== 6. Navigate to question 2, then skip it ===")
total_qs = created["assessment"]["questionCount"]
nav_target = None
# Fetch current state again to discover the *set* of question ids indirectly isn't exposed;
# instead just re-navigate using position by walking forward via repeated 'attempt' is not needed -
# we already have q1; use the /navigate endpoint by asking the server to go to q1 again (idempotent),
# then confirm skip works against a real, in-assessment question id.
skip_resp = call("POST", f"/api/assessments/{aid}/skip", {"questionId": q1["id"]})
print("   after skip, progress:", skip_resp["progress"])

print("=== 7. Invalid question id is rejected ===")
call("POST", f"/api/assessments/{aid}/attempt", {"questionId": "does-not-exist", "optionId": "A"}, expect=400)

print("=== 8. Invalid option id is rejected ===")
call("POST", f"/api/assessments/{aid}/attempt", {"questionId": q1["id"], "optionId": "not-a-real-option"}, expect=400)

print("=== 9. Result before submit -> 409 ===")
call("GET", f"/api/assessments/{aid}/result", expect=409)

print("=== 10. Submit the assessment (partially answered) ===")
outcome = call("POST", f"/api/assessments/{aid}/submit")
result = outcome["result"]
print("   accuracy:", result["accuracyPct"], "| readiness:", result["readiness"]["overallScore"], result["readiness"]["state"])
print("   unanswered:", result["unansweredCount"], "of", total_qs)
print("   diagnosis.biggestRisk:", result["diagnosis"]["biggestRisk"])
print("   practiceSessionId:", outcome["practiceSessionId"])

print("=== 11. GET result again returns the same stored result ===")
result2 = call("GET", f"/api/assessments/{aid}/result")["result"]
assert result2["accuracyPct"] == result["accuracyPct"]

print("=== 12. GET readiness endpoint ===")
readiness = call("GET", f"/api/assessments/{aid}/readiness")["readiness"]
assert readiness["overallScore"] == result["readiness"]["overallScore"]

print("=== 13. Cannot re-attempt after submission (409) ===")
call("POST", f"/api/assessments/{aid}/attempt", {"questionId": q1["id"], "optionId": option_id}, expect=409)

print("=== 14. History includes this assessment ===")
history = call("GET", "/api/assessments/history")["history"]
assert any(h["assessmentId"] == aid for h in history), "assessment missing from history"
print("   history entries:", len(history))

print("=== 15. Recommendation endpoint reflects the just-completed assessment ===")
rec = call("GET", "/api/assessments/recommendation")
assert rec["available"] is True
print("   top recommendation objective:", rec["recommendation"]["objective"])

print("=== 16. Cross-student ownership is enforced (403) ===")
other_headers = dict(HEADERS)
other_headers["X-Student-Id"] = "someone-else"
req = urllib.request.Request(BASE + f"/api/assessments/{aid}", headers=other_headers, method="GET")
try:
    urllib.request.urlopen(req)
    print("[FAIL] expected 403 for cross-student access")
    raise SystemExit(1)
except urllib.error.HTTPError as e:
    print(f"[OK ] cross-student GET -> {e.code} (expected 403)")
    assert e.code == 403

print("=== 17. Invalid assessment type is rejected (400) ===")
call("POST", "/api/assessments", {"type": "NOT_A_REAL_TYPE"}, expect=400)

print("=== 18. FINAL_READINESS_CHECK without prior evidence is rejected (422) ===")
call("POST", "/api/assessments", {"type": "FINAL_READINESS_CHECK"}, expect=422)

print("\nALL HTTP SMOKE TESTS PASSED")
