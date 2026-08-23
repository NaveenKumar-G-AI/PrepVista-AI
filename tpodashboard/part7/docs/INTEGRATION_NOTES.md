# PART 7 — INTEGRATION NOTES

## 1. Replacing the stub tables

`src/db/schema/stubs.ts` stands in for Institution, Season, UserAccount,
Student, Skill, Application, InterviewResult, and Offer. Part 7's own tables
reference these by a plain `text` column (`studentId`, `skillId`, etc.),
**never** a Drizzle `.references()` foreign key into the stub tables. That
was deliberate: it means deleting `stubs.ts` and pointing those columns at
your real tables doesn't require touching any Part-7-owned table definition
— only the id *values* flowing through the service functions need to be
real ids from your Part 1/4/5/6 tables instead of the stub tables' ids.

Two exceptions worth knowing about before you integrate:

- `readinessService.getDepartmentReadiness` and `overviewService.getInstitutionOverview`
  both query the stub `student` table directly (for the department/season
  filter) rather than going through a clean interface. When you remove the
  stub, these two functions need their `db.select().from(student)...` calls
  repointed at wherever your real student list actually lives — everything
  else in those files is stub-agnostic.
- The seed script and test factories (`tests/helpers/factories.ts`) only
  work against the stub tables. Once removed, replace them with equivalent
  factories against your real tables, or just delete the seed script.

## 2. Event bus transport

`src/lib/eventBus.ts` publishes to a durable `student_success_event` row and
notifies in-process subscribers. That's the whole "transport." The actual
**contract** — 19 event type names and their payload shapes, matching spec
§63 — is what should survive integration; swap `eventBus.publish()`'s
internals for whatever your real event system (queue, existing pub/sub,
etc.) is, keeping the same call sites in the services.

## 3. Performance follow-ups (deliberately deferred — see spec §68–69)

Everything here is correct at demo/small-institution scale and was left
simple on purpose rather than prematurely optimized against data that
doesn't exist yet. At real scale (thousands of students), do these first:

- **`readinessService.latestMeasurementPerSkill`** fetches every measurement
  for a student and reduces "latest per skill" in JS. Fine per-student;
  replace with a `DISTINCT ON (skill_id) ... ORDER BY skill_id, measured_at DESC`
  query if this ever runs across many students in a loop (e.g. a bulk
  recalculation job).
- **`overviewService.getInstitutionOverview` and `readinessService.getDepartmentReadiness`**
  loop `getLatestSnapshot` once per student. This is N+1 by construction.
  Replace with a single query joining each student to their most recent
  `readiness_snapshot` row (e.g. `DISTINCT ON (student_id)`), once
  institutions have more than a few hundred students.
- **`interventionService.getInterventionWorkbench`** similarly does one
  extra query per assignment for the student row, the readiness snapshot,
  and the skill gaps. Same fix: batch-fetch and join in memory instead of
  looping.
- Readiness recalculation is currently synchronous (called directly from
  wherever a caller decides "something changed"). Spec §69 describes the
  right shape for production: assessment completed → event → queued
  recalculation → snapshot → dashboard update. The event is already
  published (`ASSESSMENT_RESULT_RECORDED`); nothing currently subscribes to
  it to trigger `calculateReadiness` automatically. Wiring that up is a
  small, deliberate omission — see Truth Table — since "who triggers
  recalculation and when" is a product decision (immediately? nightly
  batch? on-demand when a TPO opens the student's profile?) that depends on
  real usage patterns this sandbox doesn't have.

## 4. Taxonomy needs seeding

`taxonomy_term` starts empty. Training/assessment categories and
intervention types resolve through it rather than an enum (spec §10/§19/§36
— explicitly "do not hard-code the taxonomy permanently"). An institution
needs at least a few rows (`domain: TRAINING_CATEGORY`, etc.) seeded before
TPOs can create programs — `src/db/seed.ts` shows the shape.

## 5. Auth

`attachActor` (`src/api/middleware/auth.ts`) is a header lookup against
`user_account`, explicitly marked DEMO AUTH ONLY. Replace it with real
session/JWT middleware. The contract it needs to fulfill is exactly one
thing: populate `req.actor` matching the `Actor` type in
`src/lib/permissions.ts`. Every route and service downstream depends only on
that shape, not on how it was resolved — `requireCapability`/`requireRole`
and all the row-level visibility checks keep working unchanged.

## 6. What a request looks like end-to-end (verified, not hypothetical)

This was actually run against a live server in this session:

```
POST /api/tpo/training/programs           (create program)
POST /api/tpo/training/programs/:id/sessions
POST /api/tpo/training/attendance
POST /api/student/assessments/:versionId/start
POST /api/student/assessments/attempts/:id/submit   -> writes skill_measurement
                                                      -> readiness recalculated
GET  /api/student/readiness                -> reflects the new evidence
GET  /api/tpo/interventions/workbench      -> shows the student if still gapped
GET  /api/management/overview              -> aggregate counts move
```

Cross-role authorization was verified both directions: a student token
hitting a TPO-only route gets 403, and a TPO token hitting the student-only
`/api/student/*` routes also gets 403 (wrong role, not just wrong capability).
