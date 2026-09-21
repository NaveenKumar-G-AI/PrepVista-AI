# CodeForge AI — Technical Growth Tracking

Standalone reference implementation. Built without your live repository
attached to this conversation — no codebase was uploaded alongside the
build prompt, so nothing here was integrated against your actual existing
systems (Correctness Analysis, Complexity Analysis, Debugging Coach,
Reasoning Verification, Code Review, role model, adaptive engine). Where
this module needs one of those, it defines a typed contract and a
reference implementation against a best-guess shape — see the big comment
at the top of `src/lib/growth/evidence/adapters.ts` for exactly what to
edit to wire in the real ones.

Read this file before wiring anything in — the "What's genuinely verified"
section says plainly what was and wasn't actually run, not just written.

## Layout

```
src/lib/growth/
  types.ts            domain model (evidence, states, confidence, snapshots, milestones, insights)
  config.ts            every threshold, in one versioned place — no magic numbers elsewhere
  utils.ts              windowing / grouping / stats helpers
  evidence/
    normalize.ts         validation -> normalization -> GrowthEvidence pipeline
    adapters.ts           <-- START HERE to integrate real upstream systems
  engine/
    stateDetection.ts    the state machine (IMPROVING/REGRESSING/STAGNATING/...) + false-positive guards
    confidence.ts         evidence count/diversity/recency/consistency -> HIGH/MEDIUM/LOW/INSUFFICIENT
    transfer.ts, retention.ts, independence.ts
    milestones.ts         deterministic milestone detection, dedup by stable key
    insights.ts            deterministic, template-filled claims (never LLM-invented)
    snapshot.ts            assembles one immutable, versioned student snapshot
  persistence/
    repository.ts          the interface everything above depends on
    postgresRepository.ts   the one real implementation (Postgres/Supabase)
  authorization.ts        pure, unit-tested access-control decisions
  service.ts                get_growth_* operations, wired to the repository

src/server/                Express reference API (see "Why Express" below)
src/components/growth/     React dashboard (presentation-only, takes data as props)
supabase/migrations/       schema + RLS, ready to run against a real Supabase project
scripts/                    local-only Postgres bootstrap + the real RLS adversarial test script
tests/                      52 real, passing unit/integration tests
demo/                       Vite harness that renders the dashboard from real engine output
```

### Why Express, not Next.js API routes

The build prompt's own architecture section mentions Supabase/PostgreSQL/RLS
but not a specific frontend framework. Rather than guess a framework
convention this build has never seen and produce routes that only *look*
plausible, this uses a plain Express router (`src/server/routes/growth.ts`)
that's actually runnable and was actually run (see below). If your real
CodeForge backend is Next.js API routes, tRPC, Fastify, etc., the
`GrowthService` / `GrowthRepository` / `authorization.ts` layer underneath
is framework-agnostic — only `src/server/*` needs a rewrite to match, and
it's a thin wrapper (auth extraction + calling into `service.ts`).

## What's genuinely verified (and what isn't)

Everything below was actually executed in the build sandbox this turn, not
just written and assumed correct.

- **`tsc --noEmit` across the entire project** (engine, persistence, server,
  React components, tests): clean, zero errors.
- **`vite build` of the dashboard component**, importing the *real* engine
  functions (not hand-typed fake props) to construct its demo data:
  succeeds, produces a working bundle. A rendered screenshot wasn't
  possible in this sandbox — no functional headless browser was available
  to install — but the build succeeding means the component, its
  TypeScript, and its JSX are all genuinely sound.
- **52 unit/integration tests, `npm test`, all passing** — every scenario
  the build prompt's own "TESTING REQUIREMENTS" section lists by name:
  improvement, single success ≠ mastery, single failure ≠ regression,
  repeated diverse success raising confidence, transfer, retention,
  assistance/independence, stagnation, recovery (including the
  RECOVERING-vs-plain-IMPROVING distinction the prompt's own spec implies),
  baseline windows, missing data, role-scoping, reproducibility, and
  versioning. Plus a golden-scenario fixture test matching the prompt's own
  example almost exactly (one deliberate, explained deviation — see the
  comment at the top of `tests/engine/goldenScenario.test.ts`: the prompt's
  shorthand "Debugging: IMPROVING" is superseded by its own
  false-positive-control and recovery-detection rules, which this
  implementation followed over the shorthand).
- **RLS was tested against a real local Postgres 16 instance**, not just
  written and reviewed — schema applied unmodified from
  `supabase/migrations/`, then `scripts/verify-rls.sql` ran genuine
  adversarial queries as different simulated sessions:
  - student A reading student B's row by explicit `student_id` filter → **0
    rows**, even though the row exists
  - student A attempting a direct `INSERT`/`UPDATE` against `growth_evidence`
    → **permission denied** (no policy grants it)
  - even `service_role` (which bypasses RLS) attempting `UPDATE`/`DELETE` on
    a historical row → **rejected by the append-only trigger**
  - an instructor enrolled with student A but not B → sees A's data, **0
    rows** for B
  - This validates the RLS *logic* faithfully — it uses `auth.uid()` and the
    same policies your real migration will run — but it's local Postgres
    with a hand-built `auth.uid()` shim (see
    `scripts/local-postgres-bootstrap.sql`, local-dev-only, not part of
    what you'd deploy), not a live Supabase project with real JWT-issued
    sessions. Re-running `scripts/verify-rls.sql`'s queries (or equivalent)
    against your actual Supabase project before launch is still worthwhile.
- **The full HTTP API was actually started and hit with curl** against that
  same real local Postgres — genuinely exercising auth middleware → the
  authorization layer → the repository → RLS-enforced Postgres → the
  engine → back out over real HTTP, including adversarial cases:
  no-auth → 401; student A requesting student B's data → 403; unenrolled
  instructor → 403; enrolled instructor → 200 (with `context` stripped from
  the response, confirming the instructor-redaction code path actually
  ran, not just student's own full row); evidence drill-down while
  `mode=assessment` → 403; internal ingestion without the service key →
  401; ingestion with the key → 201 and a real row in Postgres; recompute →
  a real snapshot computed from real evidence and persisted; reading it
  back → the same snapshot, confirming persistence (not just an in-memory
  echo).
- **What was written but not executed against a live server**: the actual
  Supabase project wiring (no project was provided — `DATABASE_URL` /
  `DATABASE_SERVICE_URL` are blank in `.env.example` as requested), the
  `auth.ts` dev shim is explicitly not production auth (see the comment at
  its top — replace with real Supabase JWT verification before deploying),
  and the adapters in `evidence/adapters.ts` are typed against a
  best-guess shape for your other systems' output, not your real types.
- **Not implemented in this pass, and why**: background job infrastructure,
  a real caching layer, observability/correlation-id plumbing, cohort-level
  instructor analytics UI, and LLM-assisted insight phrasing. Each is
  either genuinely dependent on infrastructure this build never had access
  to (your queue, your cache, your logging stack), or was cut to keep what
  *is* here real and tested rather than padding the file count with
  unverified stubs. The insight/claim text is already natural-sounding
  without an LLM in the loop (see `engine/insights.ts`); if you want to
  restyle it further, keep the structured `GrowthInsight` object as the
  source of truth and only let an LLM rephrase `claim` — never let it
  invent evidence, confidence, or state.

## Running it yourself

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL / DATABASE_SERVICE_URL / INTERNAL_SERVICE_KEY
npm run typecheck
npm test
npm run start:server     # requires a real (or local) Postgres — see below
npm run build:frontend   # builds demo/ with vite, proves the component compiles
```

To reproduce the local RLS verification against your own Postgres:

```bash
psql -d your_db -f scripts/local-postgres-bootstrap.sql   # LOCAL/TEST ONLY — real Supabase already has auth.uid()
psql -d your_db -f supabase/migrations/20260820000000_growth_tracking.sql
psql -d your_db -f scripts/verify-rls.sql
```

Against a real Supabase project, skip `local-postgres-bootstrap.sql`
entirely and just run the migration — `auth.uid()`, `auth.users`, and the
`authenticated`/`service_role` roles already exist there.

## Integration checklist

1. `src/lib/growth/evidence/adapters.ts` — replace the placeholder
   interfaces with your real Correctness/Complexity/Debugging/Reasoning/
   Review output types; adjust the field mappings.
2. Wire your existing systems to call `normalizeEvidence()` +
   `repo.insertEvidence()` (or POST to an internal ingestion path shaped
   like `src/server/index.ts`'s `/internal/growth/ingest`) whenever they
   produce a result.
3. Call `growthService.recomputeGrowth(studentId, ...)` after evidence
   lands — a webhook, a queue consumer, whatever your existing background
   infrastructure looks like. It's the only mutating operation the service
   exposes.
4. Replace `src/server/auth.ts` with real Supabase JWT verification.
5. Replace `resolveRoleProfile()` in `src/server/index.ts` with a call into
   your real role-selection/role-skill-model system.
6. Run the migration against your Supabase project; rename
   `course_enrollments` in the migration if your roster table is named
   differently.
7. Mount `createGrowthRouter(...)` (or port its logic to your framework)
   under your existing auth middleware.
8. Drop `GrowthDashboard` into your existing page/design system — it's
   presentation-only, taking a snapshot/insights/milestones as props (see
   `useGrowthDashboard.ts` for a reference fetch hook), so it doesn't
   fight your existing data-fetching conventions.
