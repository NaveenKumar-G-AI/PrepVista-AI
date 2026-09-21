# ACEAPT Feature 55 — Question Difficulty Calibration Engine

Standalone reference implementation, built and tested the same way as the
other ACEAPT/CodeForge/PrepVista reference builds: real Postgres, real RLS
verified live, real tests, real bugs found by actually running the code
(list below) rather than just written and assumed correct.

Turns a static `Easy / Medium / Hard` label into evidence-backed difficulty
intelligence — separating **item difficulty** from **student difficulty**,
never letting one student's failure become a question's label, and never
treating an unvalidated or low-quality question's performance as real
signal.

```
FEATURE 53 (quality) → FEATURE 54 (validity) → FEATURE 55 (this)
                                                       ↓
                                      FEATURE 43 / 49 / 50 / 51 / 52
                                                       ↓
                                          MASTERY + READINESS
```

## What's actually implemented

**P0 (§206) — done and tested:**
initial difficulty (structural + optional AI, never treated as truth),
provenance tracking, per-question-version calibration, calibration
eligibility (invalid/quality-blocked/test-account/incomplete/impossible-timing
exclusion), facility + Wilson-interval uncertainty, sample-size gating,
PROVISIONAL → CALIBRATED lifecycle, full audit history, label-mismatch
detection, anomaly detection (too easy/hard, high variance, weak
discrimination, unexpected timing), expected-time statistics with IQR
outlier trimming, all 8 sibling-feature integration points, tenant-isolated
RLS persistence, async job handling, a cache layer, and 74 automated tests.

**P1 (§207) — partially built:** timed/untimed, novel/familiar, and
guided/independent conditioned snapshots are fully implemented (each gets
its own facility/time/status once it clears its own sample-size threshold).
Discrimination is a deliberately simple top-third-vs-bottom-third facility
gap ("discrimination-lite"), not a point-biserial correlation. Skill/cohort
conditioning, drift detection, and a calibration-center admin UI are built.
Curriculum-level content-gap analytics are not.

**P2 (§208) — architected for, not built,** exactly as the spec asks
(§109: *"do not force an IRT model into production without sufficient data
and assessment expertise"*): `difficulty_snapshots` stores enough
(`estimate`, `sample_size`, per-mode facility) that a future Rasch/IRT layer
could be added without a schema migration, but no IRT/Bayesian model exists
here.

## Quickstart

```bash
npm install
cp .env.example .env        # fill in a local Postgres connection + role passwords
npm run migrate              # applies migrations/*.sql (needs PGSUPERUSER)
# set the two runtime role passwords once (see .env.example comments):
psql -c "ALTER ROLE difficulty_app PASSWORD '...';"
psql -c "ALTER ROLE difficulty_student_app PASSWORD '...';"
npm run seed                  # optional: realistic demo data, see below
npm run dev                   # API on :4055
npm run worker                # optional: background calibration worker
npm test                      # 74 tests, needs the same Postgres
```

For local development only (**not** the real ACEAPT schema), also run the
reference stand-in schema before migrating:

```bash
psql -d your_db -f db/reference/000_assumed_existing_schema.sql
```

Delete that file when integrating into the real codebase — see
"Integrating into real ACEAPT" below.

### Frontend

```bash
cd web
npm install
cp .env.example .env   # optional — leave blank to preview with sample data
npm run dev             # :5173
```

## Environment variables

See `.env.example` (backend) and `web/.env.example` (frontend) — every
secret is blank. `ANTHROPIC_API_KEY` is optional: leave it blank and the
initial-difficulty AI assist silently falls back to a deterministic
structural-score template (tested against a real 401, see below), nothing
else depends on it.

## Project structure

```
migrations/                    Feature 55's OWN schema (run against real ACEAPT)
db/reference/                  stand-in for tables Feature 55 reads but doesn't own —
                                delete when integrating; local-dev-only
src/lib/stats.ts               Wilson intervals, robust percentiles, IQR trimming,
                                two-proportion z-test — pure, unit-tested in isolation
src/config/calibration.config.ts   every threshold in one place, none hardcoded inline
src/services/                  the engine — eligibility, estimator, snapshot
                                (atomic publish), anomaly, drift, cache, history,
                                review, initial-difficulty, expected-time
src/integrations/               typed ports + adapters for Features 43/45/49/50/51/52/53/54
src/ai/                        Anthropic-backed initial-difficulty assist + fallback
src/api/                       Express: auth/role middleware, controllers, routes
src/jobs/worker.ts              polling worker stand-in — swap for the real queue
src/scripts/                   migrate.ts, seed.ts, seed-drift-followup.ts
tests/                          65 unit/integration tests + RLS + API + AI-adapter tests
web/                            React/Vite admin + student components
```

## Integrating into real ACEAPT

1. Delete `db/reference/`. Run `migrations/*.sql` against the real database.
2. Point the SQL in `src/services/calibration-eligibility.service.ts` and
   `src/services/expected-time.service.ts` at the real `attempts` /
   `question_versions` table and column names if they differ from
   `db/reference/000_assumed_existing_schema.sql`'s stand-in shape.
3. Replace the body of each file in `src/integrations/feature*.adapter.ts`
   with a call into the real Feature 45/49/53/54 client — every caller in
   this codebase depends on the interfaces in `src/integrations/types.ts`,
   never on these classes, so each swap is a one-file change.
4. Point Features 43/50/51/52 at `src/integrations/outbound.ts`
   (`makeOutboundPorts`) instead of building their own client.
5. Replace `src/api/middleware/auth.ts` with ACEAPT's real session/JWT
   verification.
6. Replace `src/jobs/worker.ts` with ACEAPT's real queue (Celery/RabbitMQ/
   whatever it already uses) calling
   `DifficultyCalibrationService.calibrateQuestionVersion` — this file is a
   polling stand-in specifically because the spec (§98) says not to stand up
   duplicate queue infrastructure.

## Security model

Two Postgres roles, least privilege, both verified against a live instance
(not just written — see "Bugs found and fixed"):

- **`difficulty_app`** — full column access to the tables Feature 55 owns,
  row-scoped to tenant via `app.tenant_id` (set per-transaction with
  `set_config(..., true)`, a real bound parameter, not string-interpolated
  SQL). No `DELETE` grant anywhere — history/snapshots are append-and-supersede,
  never erased.
- **`difficulty_student_app`** — column-level `GRANT SELECT` on exactly six
  safe columns of `difficulty_snapshots`, plus a `security_invoker` view.
  Facility, sample size, confidence intervals: unreachable even if the
  application code has a bug, because Postgres — not this codebase — is the
  actual boundary.

Live-verified: cross-tenant reads return zero rows, cross-tenant writes are
rejected by the RLS `WITH CHECK`, an unset tenant fails closed (zero rows,
never "all rows"), and a student-role query against a raw evidence column
gets a real `permission denied for table` error.

## Testing

`npm test` runs 74 tests against a real local Postgres — no mocked database.
Covers: robust-statistics edge cases, the P0 estimator's category/status
rules (including "don't flip a label off 2-3 attempts," §216), anomaly and
drift detection logic, eligibility filtering (test accounts, incomplete
attempts, impossible timing, invalid/quality-blocked questions), atomic
snapshot publish and rollback-on-failure, all 7 RLS scenarios above as
automated tests, the AI adapter's fallback path (including a real 401 from
the live Anthropic API), and the Express API's auth/role/tenant boundaries
via supertest.

## Bugs found and fixed

All eight were found by actually running the code against live Postgres —
not caught by TypeScript, which was clean throughout.

1. **Migration/seed scripts couldn't connect** — `PGSUPERUSER_PASSWORD` was
   never read from `.env` in the initial pass; `pg` failed with `SASL:
   SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. Fixed by
   adding the two superuser env vars, distinct from the two runtime app-role
   passwords.
2. **`finishRun`**: `SET status = $1 ... CASE WHEN $1 = 'SUCCEEDED'`
   reused one parameter as both an enum-typed column value and a text
   comparison in the same statement — Postgres error 42P08,
   "inconsistent types deduced for parameter." Fixed by binding a separate
   boolean instead of re-deriving it from the enum string inside SQL.
3. **Same root cause, second location**: `insertAndActivate`'s
   `CASE WHEN $12 = 'CALIBRATED' THEN now() ...` had the identical bug.
   Fixed by computing `calibratedAt` in JS before binding it, rather than
   reusing the status parameter inside a CASE.
4. **`median_time_ms` etc. are `INT` columns**, but `median()`/`percentile()`
   use linear interpolation and can return e.g. `50840.25` — Postgres
   rejected the fractional value outright (`22P02`). Fixed by rounding at
   the point of insertion.
5. **Enum columns compared against bound parameters** (`type = $3` where
   `type` is `anomaly_type`, `mode = $4` where `mode` is `difficulty_mode`,
   etc.) failed with `operator does not exist: anomaly_type = text` in
   several places — anomaly upsert/auto-resolve, snapshot lookups, expected
   time, the student view, and the admin anomaly filter. Fixed by casting
   the enum column to `::text` at each comparison (found one instance via a
   live test failure, then grepped for and fixed the rest of the same
   shape).
6. **Conditioned-mode status was tautologically always `PROVISIONAL`**:
   `modeEst.facility.sampleSize >= computation.overall.facility.sampleSize`
   compares a subset's size to the total it's a subset of — that's never
   true by construction, so every TIMED/UNTIMED/NOVEL/GUIDED snapshot was
   stuck PROVISIONAL regardless of its own evidence. Caught by inspecting
   real seeded output, not by a passing-but-wrong test. Fixed by judging
   each conditioned mode against its own sample size, the same rule OVERALL
   uses.
7. **Cache freshness gated on `calibrated_at`**, which is only set once a
   snapshot reaches `CALIBRATED` — a low-sample `PROVISIONAL` question could
   never be "fresh," so every read re-ran the full pipeline. Caught by an
   automated test (`§193: a second run within the cache TTL is skipped`),
   which initially failed. Fixed by keying freshness off `created_at`
   (set unconditionally) instead.
8. **Cross-tenant data leak** — the most important one. Feature 55's own
   queries against `question_versions`/`attempts` (tables it reads but
   doesn't own) had no `tenant_id` filter, relying entirely on those
   tables' own RLS — which this reference implementation's stand-in schema
   doesn't have, and which Feature 55 shouldn't assume is airtight even in
   the real system. An automated cross-tenant API test surfaced this as a
   live `uq_active_snapshot` unique-constraint crash: tenant B could look up
   tenant A's `question_version_id`, and the pipeline would silently
   compute against tenant A's data. Fixed by adding explicit `tenant_id`
   checks (with a clear "not found for this tenant" failure, never a silent
   cross-tenant read) everywhere Feature 55 touches those tables:
   `calibrateQuestionVersion`'s content-hash lookup, the eligibility
   query's attempts read, `InitialDifficultyService`, and all three
   `SqlValidationGate`/`SqlQualityGate`/`SqlSkillGraphAdapter` adapters.

## Known limitations / deliberate scope decisions

- `INSUFFICIENT_DATA` is a snapshot **status**, not an anomaly row — it's
  computed directly in the Calibration Center's summary query rather than
  written to `difficulty_anomalies`, so a brand-new question doesn't flood
  the review queue.
- Discrimination is "discrimination-lite" (top-third vs. bottom-third
  facility gap off a caller-supplied ability proxy), not a point-biserial
  correlation or IRT-adjacent statistic — intentionally, per the spec's own
  instruction not to fake psychometric sophistication the data doesn't
  support yet.
- `DifficultyHistory`, `CalibrationEvidence`, and `DifficultyDistribution`
  (spec §212's component list) are folded into `QuestionDifficultyDetail`
  rather than shipped as separate components, since they're read together
  in practice — split them out if your admin UI needs them addressable
  independently.
- The worker (`src/jobs/worker.ts`) is a polling stand-in, explicitly meant
  to be deleted in favor of ACEAPT's real queue (§98).
