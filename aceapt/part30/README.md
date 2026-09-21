# ACEAPT Feature 30 — PATH

**Intelligent Target-to-Readiness Execution Engine.**

> From your current capability to your target readiness — one intelligent path that continuously adapts to you.

This is a standalone reference implementation of PATH, built the same way prior
ACEAPT/CodeForge features in this series were: a real, runnable, tested
backend and frontend, built to be read, integrated, and extended into the
live ACEAPT codebase — not a mockup. Every claim below ("N tests pass",
"validated against a live Postgres instance", "RLS blocks cross-tenant
reads") was checked by actually running the code, not asserted.

```
path-feature/
├── backend/     Express + TypeScript + PostgreSQL (RLS), the PATH engine and API
└── frontend/    React + Vite + TypeScript + Tailwind, the PATH dashboard UI
```

---

## 1. What PATH does

PATH sits after ALIGN (Feature 29) in the ACEAPT loop:

- **ALIGN** answers *"what should I target?"*
- **PATH** answers *"how do I intelligently get from where I am now to
  verified readiness for that target?"*

It runs the loop described in the build spec, Section 3, on every
recalculation:

```
target → target requirements → current state → capability gaps →
priority analysis → path generation → next best action → student action →
new evidence → path re-evaluation → path update → milestone verification →
proof → readiness update → next milestone
```

Concretely, for a student targeting **Data Analyst**, PATH will:

- generate target-specific **stages** and evidence-gated **milestones**
  (never "done" because a video was opened — Section 7);
- identify the **current bottleneck** with the evidence behind it, e.g.
  *"conceptual accuracy is strong at 85, but timed application is 45
  against a requirement of 75"*;
- recommend the single **next best action**, and explain **why**;
- diagnose **failures** (conceptual / application / transfer / speed /
  consistency / retention / insufficient evidence) instead of saying "try
  again";
- recompute automatically as evidence changes, and explain **why the path
  changed**;
- detect **risks** (stalling, inconsistent performance, low evidence,
  critical gaps, time pressure, repeated failure, low retention, transfer
  failure) and switch **path mode** (Fast Track / Standard / Deep Mastery /
  Recovery / Reassessment) accordingly;
- compare targets when a student switches ("72% of your existing
  preparation carries over" — calculated, never guessed);
- project a readiness window honestly ("approximately 6–8 weeks",
  confidence: low) and never a guaranteed date.

## 2. Architecture

### Reuse boundary (Section 6)

PATH does not re-implement ALIGN, ADAPT, FORECAST, or PROOF. This reference
build ships **mock clients** for all four (`backend/src/integrations/`) so
PATH is exercisable end to end on its own. Each one is a thin, clearly
documented stand-in — replace its implementation with a real call to the
corresponding service and nothing else in PATH needs to change:

| Client | Stands in for | Real integration point |
|---|---|---|
| `alignClient.ts` | ALIGN's fit/target-requirement output | `ALIGN_SERVICE_URL` |
| `adaptClient.ts` | ADAPT's practice-session generation | `ADAPT_SERVICE_URL` |
| `forecastClient.ts` | FORECAST's readiness-window projection | `FORECAST_SERVICE_URL` |
| `proofClient.ts` | PROOF's milestone verification | `PROOF_SERVICE_URL` |

Similarly, `backend/src/db/migrations/0001_reused_domain.sql` is a light
stand-in for tables that already exist in the real ACEAPT product (students,
capabilities, targets, evidence). It's the one migration file that should be
**deleted**, not merged, when this lands in the live schema — everything
from `0002_path_core.sql` onward is what's actually new in Feature 30.

### Backend (`backend/`)

- **Express + TypeScript**, PostgreSQL via `pg`, migrations as plain SQL
  files (`npm run migrate`).
- **Row Level Security** for tenant isolation: every tenant-scoped table
  carries `tenant_id` (or inherits isolation through a JOIN — see
  `0003_rls.sql`), enforced via `SET LOCAL app.current_tenant_id` inside a
  per-request transaction (`db/pool.ts:withTenant`). The app connects as a
  dedicated non-superuser `path_app` role — RLS is not enforced against a
  superuser connection regardless of policy, which is exactly the kind of
  mistake `withAdmin` vs `withTenant` being two distinct pools is meant to
  prevent structurally, not just by convention.
- **Engine layer** (`src/engine/`): pure, DB-free functions — gap analysis,
  bottleneck detection, readiness calculation, milestone evidence
  evaluation, next-best-action, failure diagnosis, risk detection, path-mode
  selection, path generation, target comparison, projection formatting —
  orchestrated by `engine/orchestrator.ts:recalculatePath`, the single
  function every state-changing entry point funnels through.
- **AI is an explanation layer only** (Section 55-56): `ai/explanationAdapter.ts`
  calls the real Anthropic API to phrase already-computed facts more
  naturally, with a deterministic-template fallback that is used verbatim
  when `ANTHROPIC_API_KEY` is blank. The LLM is structurally incapable of
  inventing a number — it receives already-final facts and is instructed to
  only rephrase them.
- **Event-driven architecture** (Section 47): `events/eventBus.ts` is an
  in-process queue (enqueue → background drain loop) for the upstream event
  types (`AssessmentCompleted`, `AdaptationCompleted`, `ForecastUpdated`,
  `ProofCompleted`) that would realistically arrive as webhooks from other
  ACEAPT systems, exposed via `POST /api/path/events/upstream`. Direct,
  student-initiated actions in PATH's own UI (completing an action, proving
  a milestone, changing target) recalculate synchronously in the same
  request instead, because that path wants an immediately fresh dashboard
  in the response, not eventual consistency.

### Frontend (`frontend/`)

React + Vite + TypeScript + Tailwind. Visual direction (see
`frontend/tailwind.config.js` for the token values): a **readiness
navigation system**, not a course dashboard — the one bold element is the
route line itself (`MilestoneRoute.tsx`), everything else stays restrained
(instrument-style numeric readouts, quiet risk strip, no gradients, no
gamification). Typography pairs **Instrument Serif** (display) with **IBM
Plex Sans/Mono** (body/data) — literal instrument-panel character without
leaning on a stock geometric-sans-on-dark template.

Responsive design (Section 51) is a distinct mobile hierarchy, not a shrunk
desktop layout: the route renders vertically on mobile, and the weekly
review / history panels are desktop-only in favor of the Today panel.

## 3. Running it

### Backend

```bash
cd backend
cp .env.example .env      # fill in ANTHROPIC_API_KEY etc. yourself; safe to leave blank
npm install
npm run migrate           # creates the path_app role + schema + RLS policies
npm run seed               # one tenant, three students, three targets, real evidence
npm run dev                 # http://localhost:4030
```

`npm run seed` is idempotent-ish for the reference data but **does not**
reset existing paths — for a clean run (e.g. before `npm test`), reset the
database first:

```bash
psql -U postgres -c "DROP DATABASE IF EXISTS aceapt_path_dev;"
psql -U postgres -c "DROP ROLE IF EXISTS path_app;"
psql -U postgres -c "CREATE DATABASE aceapt_path_dev;"
npm run migrate && npm run seed
```

Seeded demo identities (dev-only header-based auth — see
`src/middleware/auth.ts` — replace with real ACEAPT session auth on
integration):

| Student | Target | Story |
|---|---|---|
| Ananya Rao | Data Analyst | Close to ready; bottleneck is timed Python application (Section 50's own worked example) |
| Rahul Verma | Software Developer | Earlier stage; DSA is a critical, well-evidenced gap with a recent run of failures → lands in Recovery mode |
| Priya Nair | *(none)* | No target selected yet — Section 52's empty state |

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, talks to the backend on :4030
```

The identity switcher in the header swaps between the three seeded
students — no login system, matching the backend's dev-auth stand-in.

### Tests

```bash
cd backend && npm test    # 69 tests: unit (pure engine logic) + integration (real HTTP + real Postgres + real RLS)
cd frontend && npm test   # 3 tests: real render against the real running backend (requires it to be up and freshly seeded)
```

## 4. API reference

All routes are under `/api/path`, authenticated via dev-only
`x-tenant-id` / `x-student-id` headers.

| Method & path | Purpose |
|---|---|
| `GET /current?targetId=` | Full dashboard (Section 46, 50) |
| `GET /milestones?targetId=` | Stages + milestones only |
| `GET /today?targetId=` | Today's focused view (Section 22) |
| `GET /risks?targetId=` | Active risks |
| `GET /history?targetId=` | Snapshots + change events (Section 25) |
| `GET /weekly-review?targetId=` | Section 24 |
| `POST /target` | Select/switch target — `{targetId, slot, deadlineDays}` |
| `POST /recalculate` | Manual recalculation |
| `POST /actions/:id/complete` | Record evidence, close the core loop — `{result}` |
| `POST /actions/:id/skip` | Section 32/34 — blocked with the spec's exact copy if the milestone is critical |
| `POST /milestones/:id/prove` | Section 35 — calls the PROOF mock, verifies only if evidence actually clears the bar |
| `POST /events/upstream` | Section 47 — simulates an ALIGN/ADAPT/FORECAST/PROOF webhook |

## 5. Bugs found and fixed

Consistent with how prior features in this series were built, every claim
here was verified by actually running the server against a live Postgres
instance and a real browser-less DOM render, not just written and assumed
correct. In order found:

1. **Unhandled async rejections crashed the whole process.** Express 4
   doesn't forward a rejected promise from an `async` route handler to error
   middleware — it becomes an unhandled rejection, which modern Node
   terminates the process on by default. Every route now goes through
   `middleware/asyncHandler.ts`, plus a process-level `unhandledRejection`/
   `uncaughtException` safety net in `server.ts`.
2. **RLS silently does nothing against a superuser connection.** Fixed by
   creating a dedicated non-superuser `path_app` role with `FORCE ROW LEVEL
   SECURITY`, and splitting `pool.ts` into `pool` (app runtime, `path_app`)
   vs `adminPool` (migrations/seeding only) so the mistake is structurally
   harder to make, not just documented. Verified live: cross-tenant reads
   return zero rows, cross-tenant writes are rejected by the `WITH CHECK`
   policy, and no tenant context at all returns zero rows (fails closed).
3. **Concurrent queries on one pooled connection.** Several places used
   `Promise.all([...])` with multiple calls sharing one tenant-scoped `pg`
   client — invalid, since a single connection can only run one query at a
   time (Node logs a deprecation warning today; a future `pg` version
   rejects it outright). Fixed by sequencing every such call.
4. **A speed-dimension bottleneck could never actually close.** The
   evidence-rollup model only moved the `speed`/`transfer` dimensions for
   specific evidence *types* (`PERFORMANCE`/`TRANSFER`), but the
   next-best-action engine could recommend a `PRACTICE` action for a
   speed-dimension bottleneck — and `PRACTICE` evidence was structurally
   incapable of moving speed. Fixed by gating on whether the evidence
   itself carries the needed data (timing fields; novel-context flag)
   instead of on which action type produced it.
5. **Recovery mode's action downgrade created a dead loop.** Recovery mode
   downgraded a `PRACTICE` action to `REFLECT` when the bottleneck was
   severe — but `REFLECT` records no evidence, so the bottleneck it was
   meant to fix could never close, readiness stayed flat, and flat
   readiness kept re-triggering Recovery. Found by actually driving the
   loop for 12 rounds and watching the bottleneck never move. Fixed by only
   downgrading `TRANSFER` (novel-context pressure) in Recovery, never
   `PRACTICE`.
6. **STALLING could fire from a burst of API calls with no real elapsed
   time.** Proving several already-satisfied milestones back to back
   produced several recalculations within seconds, all with unchanged
   readiness — which read as "stalled" even though no meaningful practice
   window had passed. Fixed with a minimum 12-hour window requirement
   before the trend is judged.
7. **Completing a PROVE action through the generic endpoint silently
   no-op'd.** `POST /actions/:id/complete` correctly skips evidence
   recording for `PROVE` actions (there's no result to record), but that
   meant the milestone stayed unverified and the identical suggestion would
   just come back. Fixed by rejecting with `400` and a pointer to
   `POST /milestones/:id/prove`.
8. **Zero evidence meant zero guidance.** With no evidence anywhere, the
   bottleneck engine correctly returns `null` (never fabricate one — Section
   53) — but next-best-action also returned `null`, leaving the student
   with literally nothing to do, contradicting Section 53's own prescribed
   "Recommended: Complete a targeted assessment." Fixed by adding a
   baseline-assessment fallback for the highest-weight unevidenced gap,
   distinct from "genuinely nothing left to do."
9. **Failure-diagnosis priority ambiguity.** A student with a merely
   mediocre (not solidly established) prior score, followed by one bad
   attempt, was being diagnosed as `RETENTION_ISSUE` ("forgetting
   something they had") rather than `CONCEPTUAL_WEAKNESS`. Fixed by
   requiring the prior score to be genuinely established (≥65) before a
   drop reads as retention loss.
10. **`tsc` build would break the moment tests existed alongside `src/`.**
    `rootDir: "src"` with `tests/**/*.ts` in `include` is a `tsc` error
    (TS6059) the moment `npm run build` actually runs. Split into
    `tsconfig.json` (typechecks `src` + `tests`) and `tsconfig.build.json`
    (compiles `src` only, extended from the base).
11. **Frontend: a one-render identity race.** Switching the demo-student
    identity re-renders `App` with the new identity immediately, but the
    dashboard hook's state (owned by a separate `useEffect`) hasn't caught
    up yet — for one render, a child component received the *new* identity
    paired with the *previous* student's dashboard data, and its own
    data-fetching effect fired a request for a path that didn't exist for
    that combination. Fixed by gating which view renders on the dashboard
    state being confirmed to belong to the current identity, not just on
    its status.

## 6. Deliberately out of scope for this reference build

Per the spec's own framing of these as "eventually" / "long-term" (Sections
30, 39-40), and to keep this reference build honest about what's real:

- **Full capability graph** (Section 30) — the spec explicitly says not to
  build this for MVP. Target comparison (`engine/targetSwitch.ts`) computes
  real shared/unique capability sets and a real transferable-readiness
  percentage between any two targets, which is the practical need Sections
  28-29 describe; the general graph-traversal version is future work the
  current design doesn't block.
- **TPO/cohort dashboards and trainer intervention views** (Sections 39-40)
  — explicitly framed as "eventually" in the spec. Not built here; the
  per-student engine this reference implements is what an aggregation layer
  would read from.
- **Real ADAPT/ALIGN/FORECAST/PROOF services** — mocked, as described above.
