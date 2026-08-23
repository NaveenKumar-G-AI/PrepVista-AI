# Part 10 — Integration Guide

## What this repo is

A standalone, runnable reference implementation of the reporting spine
described in the Part 10 brief: Evidence Vault, Metric Definitions,
Report Snapshots, and the executive/department/company reporting layer
on top of them. It was built without access to a real Parts 1-9
codebase, so five tables (`students`, `applications`, `interviews`,
`offers`, `joining`) stand in for those modules. Everything else —
every service, every calculation, every test — depends only on the
*interfaces* in front of those tables, not the tables themselves. That
seam is the entire integration story.

## The one thing to actually do: swap five repositories

Open `src/repositories/sourceRepositories.ts`. It exports five
interfaces:

```
StudentRepository
ApplicationRepository
InterviewRepository
OfferRepository
JoiningRepository
```

Implement each against your real students / applications / interviews /
offers / joining tables (or by calling your existing Parts 1-9
services). Then, in `src/container.ts`, replace the five
`Sqlite*Repository` constructions with your real ones:

```ts
// before
const students = new SqliteStudentRepository(db);
// after
const students = new RealStudentRepository(yourDbOrServiceClient);
```

Nothing in `src/services/*` needs to change. `MetricService`,
`ReportingService`, `DataQualityService`, and `ReportGenerationService`
were written and tested entirely against the interfaces, never the
SQLite implementation.

Once that's done:
- Delete `migrations/001_source_of_truth_stubs.sql` — those five tables
  were only ever a stand-in.
- Delete `src/seed.ts` and `scripts/apiSmokeTest.ts`, or keep them
  pointed at a disposable dev database for local testing.

## Swapping the database engine

`src/db.ts` is the only file that knows about SQLite specifically. To
run Part 10's own tables (`evidence`, `metric_definitions`,
`report_definitions`, `report_snapshots`, `management_review_comments`,
`decision_log`, `management_targets`) on Postgres instead:

1. Replace `better-sqlite3` with `pg` in `db.ts`, keeping the same
   `openDatabase` / `runMigrations` function signatures.
2. The migration SQL in `migrations/002-004` is close to
   Postgres-compatible already (`TEXT`, `REAL`, `INTEGER`-as-boolean).
   Swap `INTEGER` boolean columns to real `BOOLEAN`, and generate ids
   with `gen_random_uuid()` or keep generating them in application code
   as this repo does (`randomUUID()` from `node:crypto`) — either works,
   since ids are always written by the application layer here, never
   relied on as a DB default.
3. Every repository in `src/repositories/*` uses parameterized queries
   through a single `db` handle passed into its constructor — swapping
   the driver is mechanical, not a rewrite.

## Wiring into real auth

`src/api/routes.ts`'s `requireRole` reads an `x-prepvista-role` header.
Replace it with whatever middleware Parts 1-9 already uses to resolve
the authenticated user's role, and set `req.prepvistaRole` the same way.
Every route already declares which roles it accepts — only the
*resolution* of the role needs to change, not the authorization checks
themselves.

## Merge layout

If merging into a monorepo that follows the ownership convention from
the Part 10 brief, this repo maps as:

```
src/repositories/evidenceRepository.ts          -> services/evidence/**
src/repositories/metricDefinitionRepository.ts  -> services/metrics/**
src/repositories/reportDefinitionRepository.ts  -> services/metrics/**
src/repositories/reportSnapshotRepository.ts    -> services/reporting/**
src/repositories/managementTargetRepository.ts  -> services/reporting/**
src/services/*                                  -> services/reporting/**, services/evidence/**, services/metrics/**
src/api/*                                       -> api/reports/**, api/management/**
tests/*                                         -> tests/reports/**, tests/evidence/**
migrations/002-004*.sql                         -> migrations/**
migrations/001_source_of_truth_stubs.sql        -> DELETE (do not merge)
```

`src/repositories/sourceRepositories.ts` doesn't move anywhere — it gets
*replaced* by adapters living wherever your real students/applications/
offers/joining modules already are, per "swap five repositories" above.

## Seeding real metric/report definitions

Before any report can be generated for a real institution, it needs its
own `metric_definitions` and `report_definitions` rows — the system
deliberately throws a clear error (`No active metric_definition found
for "..."`) rather than silently computing with an assumed formula. See
`seedMetricDefinitions` / `seedReportDefinitions` in `src/seed.ts` for
the shape to replicate per real institution (these are per-institution
rows, not global — multi-tenant from the start).

## Suggested next slices (in priority order)

1. Real auth (blocks production use entirely — see `PART10_HOSTILE_REVIEW.md` C1).
2. Audit log (`H2`) — pairs naturally with wiring up the `REPORT_*` /
   `EVIDENCE_*` event contract from section 55, which this pass didn't
   implement as an event bus, only as documented intent.
3. Student-facing "My Placement Journey" report (`M3`) — the data model
   already supports it; it's a new `ReportGenerationService` method plus
   a route, following the exact same pattern as the executive report.
4. PDF/XLSX rendering (`H3`) — `ReportGenerationService`'s output is
   already a plain JSON tree; point a renderer at it.
