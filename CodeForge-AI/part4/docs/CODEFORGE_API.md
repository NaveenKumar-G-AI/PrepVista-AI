# API

Base URL (local dev): `http://127.0.0.1:8000` (or whatever port you run
`uvicorn app.main:app` on).

All endpoints except `/health` require `Authorization: Bearer <token>`.
For local testing without a real auth system,
`app.auth.issue_dev_token(student_id)` mints one.

## `GET /health`
Liveness check. `{"status": "ok"}`.

## `POST /dev/token`
**Dev-only.** Mints a signed token for any `subject_id`/`role` with no
password or identity check — this sandbox has no real login system. A
real deployment deletes this route entirely; see `app/auth.py` and
`app/main.py` for the loud warnings on why. Request:
`{"subject_id": "stu_demo_1", "role": "student"}` → `{"token": "...", ...}`.
`role` is `"student"` or `"staff"` — see the Phase 29 reports below for
what `"staff"` unlocks.

## `GET /challenges`
Lists all challenges (id, title, skill, difficulty, language) — no
starter code, no tests, hidden or public. Ordered easiest-first by an
explicit difficulty rank (not alphabetically — `"ADVANCED"` sorting
before `"EASY"` was a real bug caught by the frontend driver; see
`CODEFORGE_FINAL_REPORT.md`).

## `GET /challenges/{challenge_id}?challenge_version=1`
Returns challenge metadata and **public tests only**. Never returns
hidden tests or expected solutions.

## `POST /attempts`
Submits a real attempt. **Deterministic execution and evaluation run
synchronously** (Phase 35's "immediate" half) and are in the response
right away. **Diagnosis, evidence, skill update, explanation evaluation,
and feedback run as a background task** (Phase 35's "background" half) —
against a real ASGI server the HTTP response is sent to the client
*before* that work starts, so this call returns fast even if an AI
provider is configured and slow. Poll `GET /attempts/{attempt_id}` and
check `analysis_status` until it's no longer `"PENDING"`.

Rate limited to 10 submissions per 60 seconds per student → `429` beyond that.

Request body (`SubmitAttemptRequest`):
```json
{
  "challenge_id": "most-frequent-element",
  "challenge_version": 1,
  "language": "python",
  "source_code": "...",
  "explanation_text": null,
  "hint_count": 0,
  "hint_level": 0,
  "client_request_id": "unique-per-submission-string",
  "feedback_level": "STANDARD"
}
```
`client_request_id` is required and enforces idempotency: resubmitting the
same value returns the full assembled result of the original attempt
(Phase 42) — by that point analysis has already completed, so unlike the
first response, a repeat call gets the complete picture immediately.
`feedback_level` is one of `QUICK|STANDARD|DETAILED|DEEP` (Phase 25).

**Immediate response shape** (analysis still pending):
```json
{
  "attempt_id": "...", "attempt_number": 1,
  "execution_status": "COMPLETED", "evaluation_status": "EVALUATED",
  "analysis_status": "PENDING",
  "evaluation": { "status": "FAILED", "tests_total": 5, "tests_passed": 4, "outcomes": [...] },
  "message": "... poll GET /attempts/{attempt_id} for the full result."
}
```
If execution infrastructure fails (`SYSTEM_ERROR`), the response is short
and explicit that the student was not scored — `analysis_status` is
`NOT_APPLICABLE` and no background task is ever scheduled.

## `GET /attempts/{attempt_id}`
Owner-only. Returns the full assembled result: `analysis_status`,
`evaluation` (with per-test `outcomes`, hidden values redacted),
`code_analysis`, `complexity_analysis` (including `ai_status`/`ai_reasoning`),
`diagnosis`, `explanation_evaluation`, `potential_misconceptions`,
`evidence_recorded`, `skill_state`, `prerequisite_weaknesses`, `feedback`,
`retry_comparison`, `next_challenge_handoff`, `next_challenge_suggestion`.
Fields that depend on the background stage are `null` until
`analysis_status` reaches `"COMPLETE"` (or `"FAILED"`).

## `GET /students/{student_id}/skills`
Owner-only. Returns all `skill_assessments` rows for the student.

## `GET /students/{student_id}/report/{attempt_id}`
Owner-only. The Phase 28 student-facing report, assembled from stored
data (never regenerated), including `analysis_status`.

## `GET /reports/cohort/skill-distribution?skill_id=...`
**Staff-only** (Phase 29). Per-skill count of students at each level —
`[{"skill_id": ..., "level": ..., "student_count": ...}, ...]`. No
student identities in the response at all.

## `GET /reports/cohort/common-mistakes?skill_id=...&limit=10`
**Staff-only.** Most frequent mistake categories cohort-wide, with
occurrence and distinct-student counts. Category labels only — never the
per-attempt `evidence_text`, never which students triggered them.

## `GET /reports/cohort/completion`
**Staff-only.** Per-challenge attempted/passed student counts.

## `GET /reports/cohort/improvement`
**Staff-only.** Per-challenge count of students with multiple attempts
and how many of them improved between their first and most recent
attempt. A single cohort-wide number, not a per-student trajectory.

All four reporting endpoints require a token minted with `role: "staff"`
(`403` otherwise) — see `POST /dev/token` above and
`app/services/reporting_service.py`'s docstring for why every query in
that module groups by something other than `student_id`.

## Not implemented as public endpoints
- A dedicated `/attempts/{id}/status` lightweight-poll endpoint — `GET
  /attempts/{id}` already includes `analysis_status`, so a separate
  endpoint wasn't added, but a real deployment might want a cheaper
  status-only route for tight polling loops.
