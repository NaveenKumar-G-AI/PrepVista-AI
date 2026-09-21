# API Reference

Base URL: `http://localhost:3000` (or `$PORT`). All routes except `/health` and `/api/auth/demo-login` require `Authorization: Bearer <token>`.

## Auth

### `POST /api/auth/demo-login`
Body: `{ "studentId": "student_demo_1" }`. Returns `{ token, studentId, displayName }`. Demo-only — see `CODEFORGE_SECURITY.md`.

## Attempts (the closed loop entrypoint)

### `POST /api/attempts`
Body: `{ challengeId, language: "javascript"|"python", code, clientAttemptId?, assistanceUsed?: "NONE"|"HINT"|"SOLUTION_VIEWED", recommendationId? }`

Runs the full pipeline: real sandboxed execution → deterministic evaluation → diagnosis → evidence → skill state recompute. Returns:
```json
{
  "attemptId": "...",
  "idempotentReplay": false,
  "evaluation": { "testsTotal": 4, "testsPassed": 3, "passed": false, "results": [ /* hidden cases redacted */ ] },
  "diagnosis": { "mistakeCategory": "BOUNDARY_CONDITION", "languageIssue": false, "details": "..." },
  "updatedSkillStates": [ { "skillId": "...", "masteryScore": 55, "masteryState": "DEVELOPING", ... } ]
}
```
`studentId` always comes from the token — a body-supplied `studentId` is ignored (see `CODEFORGE_SECURITY.md`).

## Dashboard

### `GET /api/dashboard`
Returns the grouped mastery view (Phase 45): `strongSkills`, `developingSkills`, `needsPractice`, `improvingSkills`, `unknownSkills` (each an array, never a single percentage), plus `recommendation` (auto-generated if none pending) and `recentProgress`.

## Recommendations

### `GET /api/recommendations/next?language=javascript&force=true`
Returns the current pending recommendation, or generates one. `force=true` always generates fresh rather than reusing a pending one. Response includes `evidenceSnapshot` — full traceability (Phase 44), not just the final pick.

### `POST /api/recommendations/:id/accept`
Marks a recommendation accepted. `404` if the id doesn't belong to the authenticated student.

### `GET /api/recommendations/history`
Full recommendation history for the authenticated student, most recent first.

## Practice (Phase 36 — manual practice modes)

### `GET /api/practice/options?mode=CHOOSE_SKILL|WEAK_AREA|RANDOM_PRACTICE|INTERVIEW_MODE|RECOMMENDED&skillId=...&language=...`
Returns a list of eligible challenges for the chosen mode. Every mode still produces real evidence through `/api/attempts` when a returned challenge is submitted — manual practice is not a side channel that bypasses the adaptive engine.

## Challenges

### `GET /api/challenges/:id`
Challenge detail: prompt, difficulty, supported languages, and **non-hidden** sample test inputs only (never `expected` values — see `CODEFORGE_SECURITY.md`).

## History

### `GET /api/history/:skillId`
The real, persisted evidence timeline for one skill (Phase 47), scoped to the authenticated student only.

## Errors

Validation failures return `400` with a Zod `flatten()` error shape. Auth failures return `401`. Ownership violations return `404` (not `403`, to avoid confirming a resource's existence to a non-owner). A genuine content-coverage gap (no eligible challenge exists for the computed target) returns `422` with a clear message rather than a fabricated recommendation. Unhandled errors return a bare `500` — stack traces are never sent to the client.
