# CodeForge AI — Execution Result Analysis

## Why this is a standalone package, not a patch to your repo

No CodeForge AI repository was present in the build environment this was
created in — there was nothing to inspect, extend, or reuse. Rather than
fabricate an "integration" against architecture that doesn't exist here,
this is a complete, tested, standalone implementation of the capability,
built against the stack your spec implies throughout (Supabase, Postgres,
RLS, a queue/worker execution engine). Drop it into your actual repo and
wire the four integration points listed below.

**Before you wire it in:** if your repo already has equivalent
verdict/result/test-outcome types, tables, or an RLS setup, don't run the
migration or duplicate the types — point this module's `NormalizedExecutionResult`
consumers at your existing types instead. This package tries hard not to
invent a second vocabulary, but it can't know what already exists in a repo
it never saw.

## What's actually implemented and tested here (all 54 tests pass, `npm test`)

- **Typed raw evidence model** (`src/types/raw.ts`) + strict Zod schema
  (`src/schemas/rawEvidence.schema.ts`) — malformed executor payloads are
  rejected safely, never thrown as uncaught exceptions.
- **Normalization boundary** (`src/normalization/normalize.ts`) — raw →
  `NormalizedExecutionResult`, with internal-consistency checks beyond
  schema shape (e.g. "memory violation flagged but no memory measurement
  provided" is rejected).
- **Deterministic verdict classification** (`src/classification/classifyVerdict.ts`)
  — every branch is evidence-grounded; infra/evaluator failures always take
  priority and can never be reclassified as a student verdict; unrecognized
  or missing evidence falls to `SYSTEM_ERROR`, never a guessed student
  failure.
- **Resource violation analysis** (`src/classification/analyzeResources.ts`)
  — pure pass-through of explicit violation flags; never infers a violation
  from "usage is close to the limit."
- **Evidence bundle assembly** (`src/evidence/buildEvidence.ts`).
- **Idempotent, out-of-order-safe lifecycle event guard** (`src/state/eventGuard.ts`)
  — rejects stale/duplicate/backwards transitions; a finalized evaluation
  can never be reopened by a late event.
- **Finalization** (`src/finalize/finalizeResult.ts`) — refuses to finalize
  incomplete evaluations or re-finalize an already-finalized evaluation;
  produces a deterministic content hash bound to the exact version binding.
- **Role-based redaction/DTO layer** (`src/redaction/toDto.ts`) — the only
  sanctioned path from internal evidence to anything a client can see;
  hidden test identity/inputs/outputs are structurally absent from the
  student DTO, verified by leakage tests that serialize the DTO and assert
  hidden identifiers never appear in the string.
- **Repository interface + in-memory reference implementation**
  (`src/persistence/repository.ts`) — IDOR-safe (authorization derived
  server-side from `AuthContext`, never from client-supplied IDs),
  idempotent insert (duplicate finalization is rejected), concurrent-write
  race tested.
- **SQL migration + RLS policies** (`src/persistence/migrations/`,
  `src/persistence/rls_policies.sql`) — real Postgres/Supabase SQL,
  additive-only, with a DB-level trigger that rejects UPDATEs to
  `execution_results` so immutability holds even if application code has a
  bug.
- **API handlers** (`src/api/`) — `getExecutionResultHandler` (read, DTO-only)
  and `ingestEvaluationEvent` (the full pipeline: event guard → normalize →
  finalize → persist, idempotent under duplicate/out-of-order delivery,
  never crashes on malformed input).
- **Frontend result card** (`src/frontend/ResultCard.tsx`) — matches the
  Accepted/Wrong-Answer mockups in the spec, fed only by the DTO, truthful
  lifecycle states (no fake progress percentages).
- **54 automated tests** across normalization, classification (incl. every
  student-vs-platform-failure branch), finalization/immutability,
  idempotency/out-of-order events, IDOR + duplicate-write concurrency, DTO
  hidden-test leakage, and 7 end-to-end scenarios (accepted, wrong answer,
  compilation error, judge error, malformed payload, incomplete evaluation,
  duplicate completion event).

## What is NOT implemented / could not be tested here (be honest about this)

- **No live integration.** There is no real execution engine, Supabase
  project, or auth system in this environment to integrate against. The
  `SupabaseExecutionResultRepository` in `src/persistence/repository.ts` is
  a documented scaffold, not a working adapter — it throws clear "wire me
  up" errors if called.
- **RLS policies are unverified against a live database.** The SQL is
  correct Postgres/Supabase syntax and encodes the access rules described
  in the spec, but "prove student A cannot read student B's data" was only
  proven at the repository-interface level (in-memory, 54 passing tests),
  not against an actual Postgres instance with these policies applied. Run
  `supabase test db` or equivalent against your real project before
  trusting it in production.
- **No load testing.** There's no deployed service to load-test.
- **No real execution engine, checker, or sandbox** — this module
  deliberately does not execute code; it only analyzes evidence that some
  other system already produced, per the "AI BOUNDARY" / "ARCHITECTURAL
  PRINCIPLE" sections of the spec.
- **Realtime event redaction** — the redaction layer (`toDto.ts`) is
  designed to be the single choke point for both REST and realtime
  payloads, but there's no realtime infrastructure here to wire it into or
  test against.
- **Scoring strategy is generic, not invented.** `ScoringResult`/`buildScoring`
  only aggregates whatever strategy (`PASS_COUNT` or `WEIGHTED_GROUPS`) and
  group weights the raw evidence already declares — it does not implement
  a new scoring algorithm, per the spec's explicit instruction not to.

## Integration points you need to complete in your real repo

1. **Point the normalizer at your real execution engine's output shape.**
   If your executor's payload doesn't match `RawExecutionEvidence`
   (`src/types/raw.ts`), either adapt your executor's output to this shape
   at the boundary, or edit the Zod schema + normalizer to match your
   actual payload — don't change the *normalized* shape casually, since
   classification/redaction/tests all depend on it.
2. **Wire `SupabaseExecutionResultRepository`** to a real
   `@supabase/supabase-js` client using the service-role key for writes and
   a user-JWT-scoped client for reads (so RLS is the enforced boundary on
   the read path, per the code comments in that file).
3. **Apply the migration and RLS policies** — but only after checking
   whether your repo already has equivalent tables (`submissions`,
   `user_roles`, `cohort_memberships` are assumed to already exist; adjust
   the foreign keys if your schema names differ).
4. **Call `getExecutionResultHandler`/`ingestEvaluationEvent` from your real
   HTTP/queue layer**, passing `AuthContext` from your existing auth
   middleware (never from request body/query params — that's the IDOR
   protection).

## Run it

```bash
npm install
npm run typecheck
npm test
```
