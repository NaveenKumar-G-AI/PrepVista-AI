# PART 7 — TRUTH TABLE

Classification per the spec's own §95.AF categories. **IMPLEMENTED** means
real logic, backed by a real table, exercised by a passing test against a
real Postgres instance — not "the function exists." **DEV/TEST ONLY** means
it only exists to make the demo/seed/test suite runnable, and must not be
mistaken for the real thing when integrating.

## IMPLEMENTED (real logic, real schema, tested against real Postgres)

| Area | Where | Notes |
|---|---|---|
| Training program CRUD + status state machine | `trainingService.ts` | Validated transitions, audited |
| Cohorts (static + department + readiness-segment rules) | `trainingService.ts` | Dynamic rule resolution against real data |
| Sessions, enrollment, duplicate-enrollment prevention | `trainingService.ts` | DB-level unique constraint + service guard |
| Attendance recording + at-risk detection | `trainingService.ts` | Excused sessions don't count against %; gated on ≥2 sessions held |
| Bulk assignment preview (by department/cohort breakdown) | `trainingService.previewSelection` | Matches spec §49's exact shape |
| Assessment versioning (draft→published→retired) | `assessmentService.ts` | Old attempts stay pinned to their version |
| MCQ/multi-select auto-grading | `assessmentService.ts` | Exact-match; no partial credit for multi-select (documented simplification) |
| Manual-grading hold (no fabricated interim score) | `assessmentService.ts` | Result withheld until a human score arrives |
| Quality flags (suspiciously-fast, impossible score) | `assessmentService.ts` | "Needs review" language, never an accusation |
| Skill measurement with evidence source | `skillMeasurement` table | Every score traces to an assessment attempt (or other evidence type) |
| Readiness calculation (categories, overall, risk, momentum) | `readinessService.ts` | Missing data → `null`/`UNKNOWN`, never 0 |
| Readiness change / trend (7-day, 30-day) | `readinessService.ts` | Computed only from persisted, immutable snapshots |
| Skill gap detection | `skillGapService.ts` | Only for categories with actual evidence |
| Deterministic intervention recommendation | `recommendationService.ts` | Rule-based, not LLM-based, per spec §18 |
| Intervention assignment with evidence-backed reason | `interventionService.buildAssignmentReason` | Real numbers pulled from the student's own data |
| Duplicate-active-assignment prevention | `interventionService.ts` | |
| Overdue detection | `interventionService.detectOverdueAssignments` | Represents the scheduled job spec §51 wants — needs a real scheduler in production |
| TPO intervention workbench | `interventionService.getInterventionWorkbench` | |
| Training effectiveness (pre/post readiness, sample-size gated) | `effectivenessService.ts` | "Observed", never "caused" |
| Intervention effectiveness (improved/unchanged/declined) | `effectivenessService.ts` | Same sample-size gate |
| Institution-wide overview (Ready/Almost Ready/etc.) | `overviewService.ts` | No-data students are their own bucket |
| Student action plan | `actionPlanService.ts` | Progress bar only shown when explicitly linked to a real enrollment |
| AI-safe read-only tool contracts | `ai-tools/index.ts` | All names from spec §60 present; wraps services only, no DB access |
| Deterministic insight objects | `ai-tools/index.ts getInsights` | READINESS_DECLINE, TRAINING_NON_COMPLETION |
| Event contract (19 event types) | `lib/eventBus.ts` | In-process + durable row; **transport is a placeholder** (see Integration Notes) |
| Audit logging | `lib/audit.ts` | Actor/timestamp/old/new/reason |
| RBAC capability matrix + row-level student visibility | `lib/permissions.ts` | Faculty excluded from placement-outcome visibility per spec §48 |
| Multi-tenant scoping | throughout | `institutionId` always taken from the authenticated actor, never from the request body |

## PARTIALLY IMPLEMENTED

| Area | What's real | What's missing |
|---|---|---|
| Assessment question types | MCQ/MULTI_SELECT auto-graded; CODING/TEXT/RATING/PRACTICAL/CUSTOM route to manual grading | No rubric/partial-credit model for manually-graded questions beyond a single numeric score |
| Cohort rule types | STATIC, DEPARTMENT, READINESS_SEGMENT work end-to-end | SKILL_GAP is aliased to READINESS_SEGMENT's resolver rather than having distinct logic; CUSTOM behaves like STATIC |
| Demo auth | Real RBAC + row-level checks once `req.actor` is set | `attachActor` itself is a header lookup, not real session/JWT auth (spec §67 requires real backend authorization — this satisfies the authorization half, not the authentication half) |
| Training calendar (spec §46) | Sessions have `scheduledAt` and can be listed/queried | No dedicated calendar view/ICS export/aggregation endpoint |

## DEV/TEST ONLY — never read by application logic beyond making the demo runnable

- `src/db/schema/stubs.ts` (Institution, Season, UserAccount, Student, Skill,
  Application, InterviewResult, Offer) — stand-ins for Parts 1/4/5/6.
- `src/db/seed.ts` — a handful of clearly-fake demo rows, run only by hand.
- `tests/helpers/factories.ts` — test data builders, imported only by
  `seed.ts` and the test suite.

## NOT IMPLEMENTED

- **Three role-specific dashboards** (TPO Command Centre, Student premium
  experience, Management view) as actual UI. The API returns everything
  they'd need (see route files), but no frontend was built — see the
  conversation for why (no design system/framework was specified, and a
  believable UI for three personas is its own large effort).
- **Real authentication** (session/JWT) — see PARTIALLY IMPLEMENTED above.
- **Communication/notification delivery** — spec §86 explicitly scopes this
  out of Part 7 anyway; events are published, nothing consumes them to
  actually notify anyone.
- **Scheduled jobs** — `detectOverdueAssignments` is a callable function, not
  a cron/queue job. Needs a real scheduler when integrated.
- **Accessibility, responsive UX, "premium polish"** (spec §71–73) — not
  applicable; no UI was built in this pass.
- **The final 16-pass self-upgrade loop, three red-team sessions, and the
  35-section immersive engineering report** (spec §92–95) exactly as
  structured — this document set (README + this file + Integration Notes +
  Hostile Review) covers the same ground at a scope proportionate to what
  was actually built, rather than padding out headings for sections with
  nothing behind them.
- **Part 8/9/10/12 integration** beyond exposing the functions those parts
  would call (`ai-tools/index.ts`, the `effectivenessService`/`readinessService`
  exports) — there's nothing on the other end to integrate with yet.
