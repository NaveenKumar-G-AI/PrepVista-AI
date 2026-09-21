# API

Base URL: `http://localhost:4000` (via `npm run dev`). All routes except
`/health` and `/auth/dev-login` require `Authorization: Bearer <token>`.

## Auth

### `POST /auth/dev-login`
Dev-only stand-in for a real identity provider — see `docs/SECURITY.md`.
```json
{ "studentId": "...", "role": "STUDENT" }   // role defaults to STUDENT
```
→ `{ "token": "..." }`

## Student target profile

### `GET /students/me/target`
Returns the caller's active target, or 404 if none is set yet.

### `POST /students/me/target`
Creates or replaces the active target. The first call for a student also
generates their initial roadmap (201). Subsequent calls recalculate with the
correct trigger (`ROLE_CHANGED` / `GOAL_CHANGED` / `DEADLINE_CHANGED` /
`TIME_CHANGED` / `MANUAL`, inferred from what actually changed).
```json
{
  "targetRoleId": "role_software_engineer",
  "goal": "PLACEMENT_PREPARATION",
  "targetState": "INTERVIEW_READY",
  "targetDate": "2026-11-15",
  "dailyMinutes": 60,
  "preferredLanguage": "Python",
  "focusAreas": []
}
```

## Roadmap

| Route | Description |
|---|---|
| `GET /roadmap` | Current active roadmap version (404 if none generated yet) |
| `POST /roadmap/generate` | Idempotent — returns the existing roadmap if one exists, else generates v1 |
| `GET /roadmap/versions` | Version history summary (trigger, reason, readiness, at-risk, timestamp) |
| `GET /roadmap/skills/:skillId` | Skill detail view — mastery, confidence, trend, prerequisites, roadmap position, recent evidence |
| `GET /roadmap/explain/:roadmapSkillId` | "Why this, why now" — grounded in the real priority breakdown and gap status; ownership-checked |
| `GET /roadmap/daily-plan?date=YYYY-MM-DD` | Today's (or a given date's) plan |
| `GET /roadmap/weekly-plan?weekStart=YYYY-MM-DD` | This week's objective + required evidence |
| `GET /roadmap/events` | Full audit log for the caller's roadmap |

## Evidence

### `POST /evidence`
Stands in for "the existing CodeForge evaluation system produced a result."
Records one immutable evidence row, updates the derived mastery state, and
triggers a recalculation *attempt* — a new roadmap version is only created
if the recalculation is materially different (Phase 21).
```json
{
  "skillId": "skill_queues",
  "source": "CHALLENGE_ATTEMPT",
  "outcome": "FAIL",
  "independent": true,
  "difficulty": "medium",
  "language": "python",
  "failureCategory": "LOGIC",
  "timeTakenSeconds": 420
}
```
→ `{ masteryState, roadmapChanged: boolean, roadmapVersion }`

## Management (TPO/cohort — aggregate only)

### `GET /management/cohort/:cohortId/summary`
Requires a token with `role: "TPO_ADMIN"` (obtained via `/auth/dev-login`
with `"role":"TPO_ADMIN"` in this dev build). Returns **aggregate
percentages only** — no per-student breakdown, no recruiter/hiring
functionality, matching the brief's explicit boundary (Phase 42/44).

## Error shape

```json
{ "error": "ERROR_CODE", "message": "human-readable detail" }
```
`404` not found · `409` conflict (e.g. no active target yet) · `422`
validation error (with `zod`'s flattened field errors) · `403` forbidden ·
`401` missing/invalid token.
