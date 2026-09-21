# API Reference

Base path: `/api/v1`. Every route except `/health` requires
`Authorization: Bearer <token>` (see `npm run mint-token` for local
dev). `organizationId` is always read from the token, never from the
request — no endpoint accepts it as a parameter.

Roles: `ORG_ADMIN`, `DEPARTMENT_ADMIN`, `TPO`, `TRAINER`, `STUDENT`.
`STUDENT` is rejected by every route below (section 5) — students get
their own individual intelligence through a different, existing
feature, not this one.

| Method & path | Roles | Purpose |
|---|---|---|
| `GET /health` | none | Liveness check |
| `POST /cohorts` | Admin | Create a cohort (section 6-7) |
| `GET /cohorts` | Admin, TPO, Trainer | List cohorts, optional `?kind=` filter |
| `GET /cohorts/:id` | Admin, TPO, Trainer | Get one cohort |
| `POST /cohorts/:id/members` | Admin | Add a student to a cohort |
| `DELETE /cohorts/:id/members/:studentId` | Admin | Remove a student (soft delete) |
| `POST /cohorts/:id/recompute` | Admin | Manually trigger aggregation (normally event-driven — section 35) |
| `GET /cohorts/:id/overview` | Admin, TPO, Trainer | The executive overview — strengths, gaps, role gap, training priorities, coverage, growth (section 81). Cached 60s per cohort. |
| `GET /cohorts/:id/skills` | Admin, TPO, Trainer | Latest skill distribution + coverage per skill |
| `GET /cohorts/:id/skills/:skillId/trend` | Admin, TPO, Trainer | Historical series for one skill |
| `GET /cohorts/:id/roles` | Admin, TPO, Trainer | Latest role readiness distribution + required-skill gaps |
| `GET /cohorts/:id/training-priorities` | Admin, TPO, Trainer | Ranked training priorities with rationale |
| `POST /cohorts/compare` | Admin, TPO, Trainer | Compare two cohorts; returns `comparable:false` + reasons if guardrails fail (section 39) |
| `POST /cohorts/:id/snapshots` | Admin | Capture a labeled historical snapshot |
| `GET /cohorts/:id/snapshots` | Admin, TPO, Trainer | List historical snapshots |
| `GET /cohorts/:id/report?format=json\|csv` | Admin, TPO, Trainer | Export a full cohort report |
| `GET /dashboards/tpo?cohortId=` | TPO, Admin | TPO-prioritized composition (section 44) |
| `GET /dashboards/trainer?cohortId=` | Trainer, Admin | Trainer-prioritized composition (section 43) |
| `GET /dashboards/admin` | Admin | Institution-wide overview across all cohorts (section 45) |
| `POST /events` | Admin | Ingest an upstream event (assessment/interview/skill-evidence) — idempotent on `sourceEventId` (sections 35, 76) |

## Error shape

```json
{ "error": { "code": "NOT_FOUND", "message": "Cohort not found.", "details": null } }
```

`code` is one of `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
`INTERNAL_ERROR` (500).

## Example: the executive overview response

This is what `GET /cohorts/:id/overview` returns (matches the spec's
own section 81 example) — restricted for a too-small cohort on the
left, normal on the right:

```json
// cohort below the privacy threshold
{
  "cohort": { "id": "...", "name": "Tiny Cohort", "kind": "CUSTOM" },
  "freshness": { "state": "INSUFFICIENT_DATA", "lastUpdated": null },
  "strongestAreas": [], "priorityGaps": [], "highestImpactRoleGap": null,
  "trainingPriorities": [], "evidenceCoverageSummary": {}, "observedGrowth": [],
  "restricted": { "reason": "Cohort has fewer than 10 students; aggregate view is withheld to protect individual privacy." }
}
```

```json
// cohort with sufficient evidence
{
  "cohort": { "id": "...", "name": "CSE 2026", "kind": "DEPARTMENT" },
  "freshness": { "state": "UPDATED_RECENTLY", "lastUpdated": "2026-08-22T10:00:00.000Z" },
  "strongestAreas": ["Python", "Data Structures"],
  "priorityGaps": ["SQL"],
  "highestImpactRoleGap": "Backend Developer",
  "trainingPriorities": ["SQL", "System Design"],
  "evidenceCoverageSummary": { "Python": "HIGH", "SQL": "INSUFFICIENT", "Data Structures": "HIGH" },
  "observedGrowth": ["Data Structures improving", "Python relatively stable"],
  "narrative": "The cohort shows strong signal in Python and Data Structures... (or null if AI_PROVIDER=none)"
}
```
