# Feature 41 — Adaptive Career Strategy Engine (backend)

A mountable Express module implementing the P0 scope of the Feature 41
Next-Gen spec. Written to be dropped into ACEAPT's existing API, not run as
a second service — see "Integrating for real" below.

## Running it standalone (for review/demo purposes)

```bash
npm install
cp ../.env.example ../.env   # everything blank is fine — see below
npm run typecheck            # tsc --noEmit
npm test                     # vitest — 20 tests, all deterministic-engine logic
npm run seed:qa              # runs the exact QA scenario from spec section 99
npm run dev                  # boots on :4000 with the in-memory store
```

With a blank `.env`, the server boots against the in-memory store
(`FEATURE41_STORE=memory`) with the LLM narrative layer disabled
(`ANTHROPIC_API_KEY` blank → deterministic-only explanations). Every route
works in this mode; nothing throws or silently no-ops. Try:

```bash
curl -H "x-student-id: demo-1" http://localhost:4000/api/feature41/command-center/demo-1
```

(You'll get the "empty" state back — `demo-1` has no seeded data. The seed
script (`npm run seed:qa`) shows the full pipeline against a realistic
profile instead of hitting the API.)

## What's real vs. what's a placeholder

**Real, working, tested:**
- Every engine in `src/engines/` — bottleneck detection, next-best-move
  scoring, strategy health, momentum, constraints, drift, contradiction,
  experiment lifecycle. All deterministic, all unit-tested
  (`tests/*.test.ts`), all run against the spec's own QA scenario end-to-end.
- The AI output contract, prompt, and safety-check net in `src/ai/pipeline.ts`.
- `src/repositories/inMemoryRepository.ts` — a full, working default store.
- `src/repositories/pgRepository.ts` — real parameterized SQL against the
  migration schema. Type-checks; **has not been run against a live
  Postgres instance** in this build (none was available). Verify it before
  relying on it.
- All routes in `src/routes/`.

**Placeholders you must replace before this touches real students:**
- `src/middleware/index.ts`'s `devAuth` — reads a plain `x-student-id`
  header. Replace with ACEAPT's real session/JWT verification.
- `src/repositories/inMemoryContextSourceRepository`'s role as the *source*
  of student/goal/evidence/etc. data — in reality this data already exists
  in ACEAPT (owned by Features 34-40 and core student records). Implement
  `ContextSourceRepository` (see `src/repositories/types.ts`) against your
  real data instead of the in-memory seed.
- The rate limiter in `src/middleware/index.ts` is in-process/single-instance
  only — swap for a shared store (Redis etc.) behind a load balancer.

## Integrating for real

1. Implement `ContextSourceRepository` against ACEAPT's real
   student/goal/skill/evidence/opportunity/application/decision/outcome/
   constraint data (read-only from this module's perspective).
2. Run `db/migrations/001_feature41_schema.sql` against your real database
   (after adjusting the commented `student(id)`/`goal(id)` FK lines to your
   actual table names), set `DATABASE_URL` and `FEATURE41_STORE=postgres`.
3. Replace `devAuth` with your real auth middleware.
4. Mount the route factories (`strategyRoutes`, `decisionsAndActionsRoutes`,
   `experimentsAndFeedbackRoutes` — see `src/app.ts`) onto ACEAPT's existing
   Express app instead of standing up a second server.
5. Set `ANTHROPIC_API_KEY` if you want LLM-generated narrative explanations;
   leave it blank to keep the deterministic-only explanations (they're
   real, not degraded — see `narrativeServices.ts`'s `deterministicFallback`).
6. Wire `src/events/eventBus.ts`'s `publish()` into your real event
   infrastructure if you have one.

## Known limitations (see `docs/COMPLETION_REPORT.md` for the full list)

- Effort-hour estimates per move kind (`DEFAULT_EFFORT_HOURS` in
  `guardEngines.ts`) and the value-tier thresholds in `nextBestMoveEngine.ts`
  are reasonable first-pass constants, not calibrated against real usage —
  expect to retune both once real data exists.
- Cross-feature integration (34-40) is interface-only: `ContextSourceRepository`
  defines the shape Feature 41 needs; there was no real Feature 34-40
  implementation available in this environment to integrate against.
- No LLM call in this build was made against a live API key (none provided);
  the AI pipeline's contract/prompt/safety-check code type-checks and the
  deterministic fallback path was fully exercised, but the live-model path
  wasn't.
