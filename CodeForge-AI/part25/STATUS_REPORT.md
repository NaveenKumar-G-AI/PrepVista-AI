# Feature 25 — Adaptive Challenge Engine: Status Report

Format follows what the spec itself asked for. Nothing below is marked
IMPLEMENTED unless it was actually built and actually verified by running
it in this environment.

## Headline status

| Area | Status |
|---|---|
| Repository inspection | **BLOCKED** — no repository was present in this environment, only the spec document |
| Core selection engine (evidence, filters, difficulty, scoring, pipeline) | **IMPLEMENTED** — built and unit/scenario tested, 22/22 passing |
| Integration with real challenge catalog / skill model / auth | **NOT IMPLEMENTED** — ports defined, backed only by in-memory test adapters |
| Database migration | **PARTIALLY IMPLEMENTED** — SQL written for the tables Feature 25 owns; not applied to any database (none available); FKs reference assumed table names that need confirming |
| API layer | **PARTIALLY IMPLEMENTED** — framework-agnostic handlers implemented and exercised via tests; no real HTTP server, auth middleware, or route wiring |
| Frontend | **PARTIALLY IMPLEMENTED** — one component built, matching the spec's UI mock; not type-checked against a real React/Tailwind toolchain |
| Generated-challenge-variant pipeline | **NOT IMPLEMENTED** — schema table only; no generation/validation code, since this needs a real AI provider key and a real challenge catalog to validate against |
| Security posture | **PARTIALLY IMPLEMENTED** — server-authoritative handler design, RLS policy stubs; no live endpoint to actually attack-test |
| Observability | **PARTIALLY IMPLEMENTED** — the audit-record schema captures what the spec's Observability section asks for; no metrics backend wired |
| Tests | **IMPLEMENTED** — 22 tests, all passing, run in this environment (see "Verification" below) |

---

## Architecture discovered

**BLOCKED.** No CodeForge repository, database schema, existing challenge
model, role system, or mastery system was available to inspect. This
report does not claim otherwise anywhere below.

## Architecture implemented

A standalone TypeScript package implementing the full selection pipeline
described in the spec: candidate pool → hard constraints → prerequisites →
availability → repetition → skill-priority diagnosis → difficulty
targeting → weighted scoring → ranked selection → audited output. See
`README.md` for the file-by-file mapping back to spec sections.

## Files created

```
package.json, tsconfig.json, .env.example, README.md, STATUS_REPORT.md
src/types.ts
src/config/selectionWeights.ts
src/evidence/aggregateEvidence.ts
src/engine/filters.ts
src/engine/pathIntent.ts
src/engine/difficultyAdaptation.ts
src/engine/scoring.ts
src/engine/selector.ts
src/engine/adaptivePath.ts
src/explain/explain.ts
src/integration/ports.ts
src/integration/inMemoryAdapters.ts
src/api/handlers.ts
src/api/exampleExpressRouter.ts   (illustrative only, excluded from build)
src/frontend/NextChallengeCard.tsx (excluded from build — no React toolchain here)
src/db/migrations/0001_adaptive_challenge_engine.sql
tests/harness.ts
tests/weightsSum.test.ts
tests/overfitProtection.test.ts
tests/uncertainty.test.ts
tests/retention.test.ts
tests/hardConstraints.test.ts
tests/repetition.test.ts
tests/difficultyAdaptation.test.ts
tests/curriculumAndOverride.test.ts
tests/goldenScenario.test.ts
tests/runAll.ts
```

## Files modified

None — there was no existing repository to modify.

## Database changes

One migration file written (`src/db/migrations/0001_adaptive_challenge_engine.sql`),
adding only the tables Feature 25 owns per the spec's architectural
boundary: `challenge_selection_events`, `adaptive_paths`,
`adaptive_path_events`, `challenge_variants`, `challenge_health`,
`adaptive_constraints`, `selection_weight_versions`. It deliberately does
**not** create challenges/users/skills/mastery/submissions/curriculum
tables. Every foreign key is written against an assumed table/column name,
marked `ASSUMPTION:` in the file, because the real names are unknown.
**Not applied to any database** — none is available in this environment.

## APIs

All seven operations from the spec's API list are implemented as
framework-agnostic functions in `src/api/handlers.ts`:
`get_next_challenge`, `get_selection_explanation`, `get_adaptive_path`,
`record_selection`, `record_challenge_outcome`, `get_skill_targets`,
`get_challenge_recommendations`. Each is server-authoritative: outcomes
and prior selections are looked up server-side via the ports, never
trusted from the caller. `src/api/exampleExpressRouter.ts` shows one way
to wire these into HTTP routes, but is explicitly illustrative — it is
excluded from the build and has no real auth behind it.

## Frontend changes

One component, `src/frontend/NextChallengeCard.tsx`, implementing the
spec's "RECOMMENDATION UI" mock (difficulty badge, estimated time, primary
skill, "why this challenge," start button). It uses semantic
Tailwind/shadcn-style tokens (`bg-card`, `text-muted-foreground`, etc.) as
a placeholder for "the existing CodeForge design system," since that
system isn't available to match against. Not compiled or type-checked —
there's no React/Tailwind toolchain in this environment — so treat it as
a strong draft, not a verified build artifact.

## Selection engine

**IMPLEMENTED and verified.** This is the part of the spec that's real
software regardless of which repository it eventually lives in, so it's
where the effort went:

- Evidence aggregation with recency weighting, a historical anchor, and
  explicit overfit-to-one-success / overfit-to-one-failure guards.
- Eight-dimension difficulty model with selective, bottleneck-isolating
  adaptation (remediation reduces only the diagnosed weak dimension;
  transfer raises only the transfer dimension; progression only commits
  fully after a second corroborating success).
- Skill prioritization that distinguishes "never attempted" (low priority)
  from "attempted but inconsistent" (high diagnostic priority) from
  "confidently weak" (remediation) from "mastered but stale"
  (reinforcement) from "mastered and fresh" (transfer).
- A hard-constraint → prerequisite → availability → repetition filter
  pipeline applied before any scoring, plus a 13-term configurable,
  versioned scoring function.
- An instructor-override short-circuit that bypasses ranking entirely.
- A full audit record (candidate set, per-stage counts, top-5 scored
  candidates with component breakdowns, versions) for every decision.

## Skill integration

**PARTIALLY IMPLEMENTED.** `StudentSkillModelPort` defines the contract;
`InMemoryStudentSkillModel` is a test-only stand-in. The engine does not
compute skill scores from raw submissions — it consumes a `StudentModel`
that a real integration would populate from the actual Skill/Mastery
system, per the spec's boundary ("Feature 25 must not silently create its
own competing source of truth"). The evidence-aggregation utilities in
`src/evidence/` exist so this package is runnable standalone; a real
integration should prefer the existing system's own skill scores where
those already exist, and only fall back to this package's aggregation for
skills the existing system doesn't yet cover.

## Challenge integration

**PARTIALLY IMPLEMENTED**, same pattern: `ChallengeCatalogPort` is the
contract, `InMemoryChallengeCatalog` is the test stand-in. No real
challenge catalog was available to integrate against.

## Generated-variant system

**NOT IMPLEMENTED.** The `challenge_variants` table and its validation
status enum exist in the migration (matching the spec's Generate → Schema
Validation → ... → Publish/Reject pipeline), but no code generates,
validates, or publishes a variant. This needs a real AI provider key (left
blank per your instruction) and a real challenge catalog to validate
generated output against — building it against nothing would just be
unverifiable scaffolding.

## Security

**PARTIALLY IMPLEMENTED.** What's real: every API handler re-derives
state from ports rather than trusting client input (e.g.
`record_challenge_outcome` looks up the last selection server-side rather
than accepting one from the caller); the RLS migration grants no
insert/update/delete to the `authenticated` role on any Feature-25-owned
table, so writes can only happen through a service-role server path; role
checks gate student-vs-student access in every handler. What's not real:
none of this has been tested against a live endpoint, a real JWT, or an
actual attempted bypass — there is no server running.

## RLS

Policies written in the migration (see "Database changes"), assuming an
existing `public.is_instructor()` helper — flagged as an assumption to
verify. **Not applied or tested against a real Postgres/Supabase
instance.**

## Observability

The `SelectionAuditRecord` schema captures candidate counts per stage,
selection reason, selected challenge, confidence, and versions — the data
the spec's Observability section asks for. No metrics backend, dashboards,
or correlation-ID propagation across a real request lifecycle are wired
up, because there's no real request lifecycle here yet.

## Tests

**IMPLEMENTED. 22/22 passing**, actually run via `npm test` in this
environment (not merely written). Coverage includes: overfit-to-one-success
and overfit-to-one-failure guards, uncertainty-based diagnostic
prioritization, stale-mastery reinforcement, hard-constraint filtering
(status, language, role), prerequisite gating with a diagnostic exemption,
repetition policy (blocked by default, allowed with an explicit reason),
selective/bottleneck-isolating difficulty adaptation, transfer-dimension
targeting, curriculum-tag filtering, instructor-override supersession, and
an end-to-end "golden scenario" fixture matching the spec's own worked
example (including two students with different profiles provably
receiving different next challenges from the same pool).

Two real bugs were caught and fixed by actually running this suite rather
than just writing code that looked plausible:
1. A skill with **zero** evidence was initially treated as *more* urgent
   than a skill with confirmed, evidenced weakness (both look
   "low-confidence" at a glance, but they aren't the same thing) —
   fixed in `engine/pathIntent.ts`.
2. Restricting scoring to only candidates tagged with the single
   top-priority skill made a second student's genuinely-best-fit
   challenge unreachable when the top-priority skill had no strong match
   in that round's pool — fixed by scoring the full candidate pool and
   letting per-candidate terms do the differentiation, in
   `engine/selector.ts` and `engine/scoring.ts`.

## Security tests

**NOT RUN.** No live endpoint exists to attempt prerequisite bypass,
client-side skill manipulation, or fake-completion injection against. The
handler-level design intended to resist these is described under
"Security" above but is unverified beyond that.

## Concurrency tests

**NOT RUN.** No live database exists to test concurrent
completion/skill-update/next-request races against, or to validate the
idempotency approach mentioned in the spec's "Concurrency" section
against real transactions.

## End-to-end tests

**IMPLEMENTED**, but against in-memory ports, not a real system:
`tests/goldenScenario.test.ts` runs the spec's own worked scenario
end-to-end through the real selector code — round 1 correctly picks the
state-focused variation over an unrelated or overly-advanced candidate;
round 2, after a recorded success, correctly shifts to the transfer
challenge; and a separate case confirms two differently-profiled students
provably diverge on the same candidate pool.

## Environment variables

See `.env.example`. All left blank as requested. Nothing in the tested
engine code reads any of them — they're only consumed once real adapters
replace the in-memory ones.

## Run commands

```bash
cd adaptive-challenge-engine
npm install
npm test
```

## Known limitations

- No real repository was inspected, per the "Important context" note in
  README.md — everything here is standalone-but-integration-ready, not
  integrated.
- Skill-state math (recency half-life, overfit caps, confidence weighting)
  encodes reasonable, tested defaults, but the actual thresholds should be
  validated against real student data before trusting them at face value —
  the spec itself asks for this ("do not use arbitrary time decay without
  validating its educational effect").
- The frontend component is unverified against a real build.
- No generated-variant pipeline, no live AI provider calls, no metrics
  backend, no penetration or concurrency testing — all listed above as
  NOT IMPLEMENTED / NOT RUN rather than glossed over.
