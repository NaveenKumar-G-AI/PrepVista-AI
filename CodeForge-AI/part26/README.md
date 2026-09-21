# CodeForge AI — Skill Signal Intelligence Engine

Turns raw evidence (challenge results, complexity/quality/reasoning/debugging
analysis, reviews, assessments) into confidence-aware skill signals: not "the
student solved this problem" but "here's what we can actually claim about
this student's ability, how sure we are, and why."

This is a standalone reference implementation, delivered the same way as the
Technical Diagnostic, Engineering Simulator, and Submission System were:
complete, runnable, independently verified — meant to be dropped into the
real CodeForge codebase and wired to its actual evidence sources (the
Submission System's verdicts, the Engineering Simulator's debugging/review
phases, etc.), which this build does not have access to. See `REPORT.md` for
exactly what was built and verified vs. what's a clean extension point.

## What it does

```
Raw evidence (upstream systems)
  -> normalize (validate + convert to a common 0-1 representation)
  -> map to skill(s)
  -> aggregate (recency-weighted, diversity-aware, contradiction-checked)
  -> confidence (separate from signal strength — see req #21)
  -> freshness / state / trend / transfer / retention
  -> persist (Postgres, RLS + SECURITY DEFINER writes only)
  -> explanation (deterministic, evidence-grounded)
```

Every skill a student has evidence for gets its own signal — never a single
score. See `src/domain/models.ts` for the full shape.

## Layout

```
src/domain/         canonical types (evidence, signal, state, trend, ...)
src/policy/         versioned thresholds/weights — nothing hardcoded in logic
src/engine/         normalize, aggregate, confidence, freshness, state,
                     trend, transfer/retention, explanation, pipeline
src/db/              repository interface + InMemoryRepository (tests) +
                     PgRepository (Postgres/Supabase)
src/db/migrations/  001_init.sql (schema), 002_rls.sql (RLS + write functions)
src/api/             Fastify routes + auth placeholder
frontend/            2 React components (student skill profile, skill detail)
tests/               40 unit tests, 13 integration tests (real Postgres)
scripts/             migration runner
```

## Running it

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL_SERVICE, DATABASE_URL_MIGRATOR

npm run migrate         # applies src/db/migrations/*.sql in order
npm run typecheck
npm test                # unit tests (in-memory) + integration tests (real DB)
npm run dev:api          # starts the API on :3000
```

Integration tests need a real Postgres reachable at `DATABASE_URL_SERVICE`
(they exercise real RLS policies and real concurrent writes — that's the
point). Unit tests need nothing; they run against `InMemoryRepository`.

## Integrating with the real CodeForge codebase

1. **Evidence sources.** Point the Submission System's verdicts, the
   Engineering Simulator's phase results, and the Diagnostic's task results
   at `ingestEvidence()` (`src/engine/pipeline.ts`) via `POST /evidence`,
   shaped as `RawEvidenceInput` (`src/domain/models.ts`). Each upstream
   system decides its own `sourceType`/`skillIds`/`contextGroup` — this
   engine doesn't reach into those systems, per the architectural boundary in
   the build prompt (§3).
2. **Auth.** `parseAuthHeader()` in `src/api/server.ts` is a placeholder.
   Replace it with real JWT verification. Nothing else changes — every route
   only ever reads `request.auth`.
3. **Skill catalog.** `SKILL_CATALOG` / `SKILL_PREREQUISITES` in
   `src/policy/policy.ts` has 6 seed skills. Extend the `skills` /
   `skill_prerequisites` tables (and the map) rather than hardcoding new
   skills into engine logic — that's the whole point of req #7/#54.
4. **Supabase.** See `.env.example` — the schema already speaks
   Supabase's RLS dialect (`request.jwt.claims`); `service_role` already
   bypasses RLS the same way `app_service` does here.
5. **Role framework / adaptive engine.** This build exposes signals
   (`GET /students/:id/profile`, `/signals/:skillId`, `/skills/graph`) for an
   adaptive engine or role-readiness system to consume — it does not
   reimplement either, since those are existing CodeForge systems this
   session doesn't have code for (req #3/#31).

## A real design choice worth knowing about

Transfer-tagged evidence (`TRANSFER_RESULT`, or anything with a
`contextGroup` containing "transfer") feeds *both* the skill's core signal
*and* its separate `transferConfidence`. A failed transfer attempt pulls the
overall signal down a little, not just the transfer metric. That's
deliberate — a failed transfer attempt is still evidence about the skill —
but it's a judgment call, not the only defensible one; if you want transfer
evidence excluded from the core signal entirely, that's a small change in
`engine/aggregate.ts`.
