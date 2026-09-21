# ACEAPT Feature 28 — PROOF — Truth Table

~4,690 lines across 46 files (backend TypeScript + SQL, frontend TypeScript/TSX).
46 backend tests + 15 frontend SSR render-branch checks, all executed for real in this
session (not summarized from memory): real Postgres 16 stood up in-sandbox, real RLS
verified against it, a real 5-way concurrent race, a real live HTTP smoke test against
the running Fastify server, and the full Section 55 demo scenario run end-to-end
against that same real database.

**No ACEAPT/PrepVista repository was reachable in this build session** — consistent
with every prior part of this project. Everything below that PROOF depends on but
does not own (Forecast, Adapt, the capability model, novelty classification, auth) is
built as a documented port with a demo/dev implementation, not a real integration.

## Real — built and genuinely tested against real infrastructure

| Area | What's real |
|---|---|
| Evidence model | `evidenceAggregation.ts` — recency decay, independence decay on repeated (capability, difficulty, novelty) combinations, time-pressure scoring, quality-weighted aggregation. 7 unit tests. |
| Verification engine | `verificationEngine.ts` — deterministic, reproducible, configurable thresholds (no hardcoded magic numbers), the 5-state model, confidence kept separate from readiness, an explicit AND-gate so one failing factor blocks VERIFIED even at a high composite score. 7 unit tests, including the AND-gate and a Critical-Risk gate driven by real simulation signals. |
| Targeted verification | `targetedVerificationSelector.ts` — uncertainty-driven (Section 7), all 4 simulation modes reachable (QUICK/STANDARD/FULL/FINAL), minimum-sufficient-evidence short-circuit (Section 20), fatigue awareness (Section 21). 8 unit tests. |
| Simulation analysis | `simulationAnalysis.ts` — time-segment accuracy, late-test degradation detection, recovery-after-difficulty pattern, question-strategy signals. Purely behavioral; no psychological or mental-health inference anywhere in this file. 5 unit tests. |
| Failure signatures | `failureSignature.ts` — maps failing factors to named categories, forwards a structured payload to Adapt without duplicating intervention logic. 6 unit tests. |
| Database | Postgres 16, real. 7 tables (5 per-student + 2 stand-ins), RLS **enabled and FORCED** on every per-student table, verified for real (`db.rls.test.ts`, 7 tests) — including that `proof_app` has **zero direct table grants** and is rejected with a permission error when it tries to query a table directly, and that a cross-student primary-key collision is blocked by RLS even when forced deliberately. |
| SECURITY DEFINER functions | 15 functions, all owned by a dedicated `proof_owner` role that is **not** a superuser and does **not** have BYPASSRLS — verified by a test that queries `pg_roles` directly, not asserted. |
| Idempotent completion | `fn_complete_session` uses `SELECT ... FOR UPDATE`; `ProofService.completeVerification` wraps the *entire* completion (evidence + result + snapshot) in one transaction, not just the status flip. Verified with a real 5-way concurrent race against live Postgres (`db.concurrency.test.ts`): exactly one caller processes the session, the other four see the same saved result, and the database shows exactly one result row and one snapshot row. |
| API | Fastify, 7 routes (Section 46 plus `/proof/response` and `/proof/health`), per-request auth as defense-in-depth on top of RLS. Verified with a live HTTP smoke test against the actually-running server (health check, 401 without auth, a real `/proof/start` call producing a real plan). |
| AI adapter | `groqExplanationAdapter.ts` — a real HTTP call shape against Groq's endpoint, gated by `PROOF_GROQ_API_KEY` (left blank, per instruction), with a deterministic fallback that runs whenever the key is absent or the call fails. Used **only** to restate an already-decided result in friendlier language — never to compute status, score, or confidence. `SimulatedExplanationAdapter` is the contract-faithful stand-in tests use instead. |
| Demo scenario | `db/seed.ts` walks the exact Section 55 script against real Postgres: forecast → gap identified (timed novel transfer) → EMERGING_EVIDENCE with a named blocker → forwarded to Adapt → sustained practice improvement → re-verification → **VERIFIED**, high confidence. Not scripted to succeed — the thresholds are untouched; the improvement phase reflects a realistic volume of sustained practice. |
| Frontend | 8 React/TypeScript components + 1 hook + a typed API client, ~1,450 lines. A bespoke signature visual (`EvidenceStackVisual` — measured bars crossing a threshold tick per dimension, not a generic chart) instead of a stock chart-library widget. 15 SSR render-branch checks actually executed via `react-dom/server`, covering every status branch (never-attempted / verified / conditionally-verified / aging) and every screen. |

## Ports — real contracts, demo/dev implementations, not real integrations

No reachable repo meant Features 26/27 and the capability model could not actually be
called. Each is a TypeScript interface in `src/domain/ports.ts` plus a demo
implementation in `src/adapters/demoAdapters.ts` — swap the implementation, not the
call sites, when the real service exists.

| Port | Stands in for | Demo implementation |
|---|---|---|
| `ForecastServiceAdapter` | Feature 27 (Forecast) | `DemoForecastAdapter` — an in-memory fixture map |
| `AdaptInterventionAdapter` | Feature 26 (Adapt) | `DemoAdaptAdapter` — records what it received, doesn't act on it |
| `CapabilityServiceAdapter` | Mastery/Retention/Transfer capability model | `DemoCapabilityAdapter` — an in-memory fixture map |
| `NoveltyClassifierAdapter` | Transfer's novelty classification (Section 10) | `HeuristicNoveltyAdapter` — a documented naive heuristic (first sighting of a topic is NOVEL, repeats are RELATED/FAMILIAR). **Not** real novelty modeling. |
| `AuthAdapter` | The existing PrepVista/ACEAPT auth layer | `DevAuthAdapter` — trusts a raw `Authorization: Dev <studentId>:<role>` header. **Not** real JWT verification. |

## Not implemented in this delivery

- **TPO/institutional aggregate dashboard** (Sections 38–39) — explicitly a P1 item in
  the source spec's own prioritization; the student-facing P0 journey was built
  completely and tested rather than splitting effort. The schema and repository layer
  don't block adding this later.
- **Real question generation/selection and its validation** (Section 45) — the
  simulation profile specifies topic, difficulty, and novelty targets; actually
  producing or selecting question content is assumed to belong to an existing ACEAPT
  question system, which wasn't reachable.
- **Real JWT / production auth** — see `DevAuthAdapter` above.
- **Real Supabase-style `auth.uid()` RLS** — approximated with a session-local
  `app.current_student_id` setting that the SECURITY DEFINER functions set themselves
  from a trusted parameter. `app_current_student_id()` in `001_init.sql` is the one
  place to swap this for `auth.uid()` in a real Supabase deployment.
- **Question return/navigation tracking** — `QuestionStrategySignals.returnRate` is
  always `0`; the simplified `SessionResponse` log doesn't capture navigation events,
  only answers.
- **Scheduled readiness-aging recheck job** (Section 37) — `computeAgingState` is real
  and used live in `getStatus`, but nothing runs it proactively in the background.
- **Advanced fatigue modeling** (Section 21) — the fatigue check is a lightweight
  recent-session-count / minutes-since-last-session heuristic, not a full model.

## Real bugs found and fixed while building this (not hidden)

1. **`fn_complete_session` returned an unparsed composite literal.** `RETURNS TABLE
   (session verification_sessions, already_completed boolean)` nests a composite type
   inside a table return; unlike a bare `RETURNS verification_sessions`, that nested
   column is not auto-expanded by `SELECT *`, so `node-postgres` handed back a raw
   Postgres composite-literal string instead of named fields. Fixed by flattening the
   return columns.
2. **That flattening then collided the OUT parameters with real column names.** Once
   the returned columns were named `id`, `student_id`, etc. (to match the table 1:1),
   PL/pgSQL put them in scope as variables for the whole function body, making the
   internal `WHERE id = ...` ambiguous with the table's own `id` column — the same bug
   *class* already hit once before on this project (a `RETURNS TABLE` column collision
   in a different SECURITY DEFINER function), here in a different shape. Fixed by
   table-qualifying every reference inside the function.
3. **Migrations ran as a superuser, silently defeating `FORCE ROW LEVEL SECURITY`.**
   Postgres superusers bypass RLS regardless of FORCE; since the SECURITY DEFINER
   functions were owned by whichever role ran the migration, running migrations as
   `postgres` meant every policy in `001_init.sql` was a no-op with no error or
   warning. Caught by checking `pg_roles` directly rather than assuming, before
   writing the RLS tests — fixed by introducing a dedicated `proof_owner` role
   (`NOLOGIN`, not a superuser, no `BYPASSRLS`) that owns every table and function.
4. **Evidence fetched from the capability model was never actually saved.**
   `startVerification` aggregated fresh practice evidence to decide *which*
   verification to run, but never persisted it — so `completeVerification` and
   `recalculate` could never see it. Found by running the Section 55 demo scenario
   end-to-end and noticing a large, deliberate improvement in practice performance
   produced no change in the final score. Fixed by persisting fresh evidence as part
   of ingesting it, in one place both callers now share.
5. **Evidence ids weren't scoped per student.** `ev_${attemptId}` relies on the
   upstream capability model's attempt ids being globally unique. Repeated demo runs
   (same fixed attempt ids, a new random student each time) collided on the primary
   key, and RLS correctly refused to let the new student's session silently overwrite
   what looked like another student's row — the right behavior, but it exposed that
   isolation depended on an assumption about a system this feature doesn't own. Fixed
   by scoping ids to `${studentId}_${attemptId}`; a test now deliberately forces a
   collision to confirm RLS still blocks it as defense-in-depth regardless.
6. **A completion race could still double-process after the idempotency fix.** The
   `SELECT ... FOR UPDATE` lock inside `fn_complete_session` only serialized the status
   flip. A concurrent duplicate call could unblock from the lock right after the
   winner flipped the status but *before* the winner had saved a result, see nothing
   yet, and reprocess — recreating the exact bug the idempotency check was supposed to
   prevent. Caught only by an actual 5-way race against real Postgres, not by the
   in-memory test (which has no true concurrency inside a single-threaded event
   loop). Fixed by wrapping the whole completion — evidence, evaluation, result,
   snapshot — in one database transaction, so the lock covers all of it.
7. **A logic gap in mode selection.** `selectVerificationPlan` never actually produced
   `FULL_SIMULATION` — the branch for it didn't exist, so a student with uncertainty
   spread across several factors at once would always get a narrow `QUICK_VERIFICATION`
   instead of the broader check the situation called for. Caught by `tsc`, since the
   unreachable branch made a downstream variable's type impossible to narrow
   correctly.
8. **`startedAt` was both repository-generated and marked required input** — a type
   inconsistency `tsc` caught immediately: repositories set it (like `createdAt`), so
   it was removed from what a caller has to supply.

## Integration seams (where to plug in the real systems)

- `src/domain/ports.ts` — five interfaces; implement each against the real Feature 26,
  Feature 27, capability model, novelty classifier, and auth system.
- `src/adapters/demoAdapters.ts` + `GroqExplanationAdapter` — swap for real
  implementations of the ports above; nothing else changes.
- `src/db/migrations/001_init.sql` — drop the `students` / `verification_targets`
  stand-in tables and point the foreign keys at the real PrepVista schema.
- `frontend/src/components/DefaultSimulationRunner.tsx` — pass the host app's real
  question-taking UI via the `SimulationRunner` prop on `ProofDashboard` instead of
  using this placeholder.
- `app_current_student_id()` in `001_init.sql` — swap for `auth.uid()` in a real
  Supabase deployment.
