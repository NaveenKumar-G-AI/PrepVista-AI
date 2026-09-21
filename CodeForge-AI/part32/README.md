# CodeForge AI — Role Skill Gap Analysis

A deterministic, evidence-backed Role Skill Gap Intelligence Engine: given a
student, a target role, the role's skill requirements, and verified skill
evidence, it produces a full **Role Skill Gap Profile** — current vs. target
state, gap classification, severity, priority, confidence, trend, dependency
analysis, root-gap detection, and closure tracking — per the architecture in
the source spec.

## Read this first: about this build

The spec this was built from is written to be run **inside an existing
CodeForge AI repository** — it repeatedly says "inspect the existing
repository," "reuse the existing Role-Based Skill Model," "integrate with
the existing Skill Signal Engine / Mastery System / Role Readiness Engine /
Next Best Action Engine," etc.

**No CodeForge repository was available in this environment** — only the
spec document itself was provided, with no uploaded codebase. So instead of
guessing at a real schema, real auth system, and real internal APIs that
don't exist here, this was built as a **standalone, integration-ready
module**: a real, tested deterministic engine, a real persistence layer, a
real API, and a real dashboard, all behind clean interfaces (`src/ports/`)
for every system the spec assumes already exists. Point those interfaces at
your real services and the domain/application layers never need to change.

Two assumptions had to be made without a real repo to read conventions from
(documented, not hidden):
- **Stack**: Node.js + TypeScript + Express + PostgreSQL + React. If
  CodeForge uses something else, the domain layer (`src/domain/`) is plain
  TypeScript with zero framework dependencies and ports cleanly to another
  backend language; the calculation *logic* is the part worth keeping.
- **Mastery scale**: a 4-level ordinal (Emerging / Developing / Competent /
  Strong), taken directly from the spec's own example. Swap
  `src/domain/types.ts`'s `MasteryLevel` for your real Mastery Level
  System's representation — the engine only assumes it's ordinal and
  comparable, see `classification.ts` / `evidence.ts`.

All secrets/config are blank placeholders in `.env.example`, per instruction
— fill those in yourself, nothing here has a real credential in it.

## What's real vs. what's a stub

Being direct about this matters more than a checklist saying everything is
done (see Phase 76 in the spec: no fake implementation, no placeholders
masquerading as production, and completion is judged on actual verification,
not generated code alone). Here's the honest breakdown:

| Layer | Status |
|---|---|
| **Deterministic gap engine** (`src/domain/*`) | **Real, fully unit-tested.** 26 tests, including all 5 golden scenarios (Case A–E) from the spec, plus 12+ edge cases (single evidence record, inconsistent evidence, upstream-service-empty defensive handling, meets-target-but-not-closeable, reopening, multi-role shared skill, difficulty coverage). Framework-free — no DB, no HTTP, no AI involved. |
| **Persistence** (`db/migrations/*.sql`, `src/adapters/postgresGapRepository.ts`) | **Real.** Migrations were executed against an actual local PostgreSQL 16 instance in this sandbox (not just reviewed). Tenant isolation (RLS) was verified by seeding rows for two different organizations and confirming a session scoped to org A gets *zero* rows from org B, and gets zero rows with no org set at all (fails closed). The adapter itself round-trips a snapshot through real Postgres in `tests/integration.test.ts`. |
| **Application layer** (`src/application/*`) | **Real**, exercised end-to-end in tests: full role analysis, snapshot + history persistence, cache short-circuiting, AI-failure fallback, and event-driven incremental recalculation (only the affected role gets recalculated, not the whole system). |
| **API** (`src/api/*`) | **Real** Express routes, Zod-validated, exercised with `supertest` (401 with no auth, 403 cross-student, 200 for the student themselves and for staff roles). All endpoints are `GET` — there is nowhere for a client to submit a gap score, severity, or closure state (Phase 51 is satisfied structurally, not just by convention). |
| **Auth** (`src/api/middleware.ts`) | **Explicitly a contract placeholder, not real authentication.** It defines the `req.auth` shape the rest of the system expects and demonstrates the self/staff/org authorization check, but reads credentials from a debug header. **Replace this before any real traffic touches it.** |
| **AI explanation layer** (`src/adapters/aiExplanation.ts`) | Real adapter shape (calls a configurable gateway URL, times out, throws if unconfigured); `GapAnalysisService` already treats any failure as non-fatal and falls back to the deterministic explanation, and that fallback path itself is unit-tested. No actual AI Gateway existed to point it at, so the network call itself is unverified against your real gateway. |
| **Role Model / Skill State / Evidence / Cache / Event Bus** (`src/adapters/memory.ts`) | **In-memory dev/test fixtures only** (Phase 76 explicitly allows this for tests/local dev). These are what let the rest of the system be exercised at all without your real Skill Signal Engine, Mastery System, etc. — see "Wiring in your real systems" below for what each needs to become. |
| **Next Best Action / Role Readiness / Technical Mastery Report integration** | Ports + no-op adapters that record what they were called with. The *contract* (what data crosses the boundary, Phase 43–45) is real and tested; the actual engines don't exist here to integrate against. |
| **Dashboard** (`frontend/*.tsx`) | **Real component source**, type-checked against React types and syntax-verified with esbuild. Plain CSS (not Tailwind) since the target frontend stack is unknown. |
| **Visual preview** (`preview/preview.html`) | Real, self-contained HTML/CSS/JS with mock data — executed in a simulated DOM (jsdom) in this sandbox to confirm it renders without runtime errors and that tab-switching / card-expansion actually work, not just that the markup looks right. Open it directly in a browser. |
| **Cohort intelligence, full security/penetration testing, full CI regression against CodeForge's real suite** | **Not built.** These phases (46–48, 64, 71) need real multi-org student data and a real existing test suite to mean anything — there's nothing here to regression-test against or aggregate over. The data model and RLS pattern already in place will support cohort queries; that's as far as this environment can honestly take it. |

## Verified, for real, in this sandbox

- `npm test` → **35/35 tests passing** (`tests/gapEngine.test.ts`,
  `tests/domainUnits.test.ts`, `tests/integration.test.ts`).
- `npx tsc --noEmit` → clean across `src/`, `tests/`, and (separately)
  `frontend/` with React types installed.
- All three migrations executed against real PostgreSQL 16; RLS
  cross-tenant isolation confirmed by direct SQL session testing, not just
  read from the `CREATE POLICY` statement.
- `preview/preview.html` executed in jsdom: renders the expected coverage
  chips / critical gaps / unassessed list, and tab switching + card
  expansion were clicked programmatically and produced the expected DOM
  changes.

The Postgres-backed test (`PostgresGapRepositoryAdapter (real database)` in
`tests/integration.test.ts`) needs a reachable database — set
`TEST_DATABASE_URL`, or set `SKIP_DB_TESTS=1` to skip it in environments
without one (e.g., CI without a Postgres service configured).

## Architecture

```
Role Requirements (RoleModelPort)
        +
Verified Current State (SkillStatePort — your Mastery System)
        +
Raw Evidence (EvidencePort — challenges, hidden tests, debugging, ...)
        ↓
   src/domain/gapEngine.ts   (pure, deterministic, framework-free)
        ↓
Gap status → magnitude → confidence → severity → priority →
dependency/root-gap analysis → closure state → structured explanation
        ↓
GapAnalysisService (src/application) — persists, records history,
best-effort AI phrasing, best-effort push to downstream engines
        ↓
API (src/api) → Dashboard (frontend)
```

The AI Gateway is called **after** the deterministic result exists, only to
phrase it, and only best-effort — see `explanation.ts` (deterministic) vs.
`aiExplanation.ts` (optional phrasing layer) and the try/catch around it in
`gapAnalysisService.ts`.

### Why a three-pass calculation for a role

`computeRoleGapProfile` in `gapEngine.ts` classifies every skill twice: once
without dependency information (to know which skills currently have *any*
gap, without circularity), then again with real dependency/root-gap
annotations, which is what can turn a `BELOW_TARGET` skill into
`DEPENDENCY_BLOCKED` and feed into severity/priority. See the comment block
at the top of that function.

### Why consistency looks at a recent window, not full history

A student who moved from weak to strong performance shows high variance
across their *entire* history even though they're stable right now — that's
an improving trend, not inconsistency. `statistics.ts` computes consistency
over the most recent `minSampleForConsistencyCheck` evidence points, while
trend compares the full first-half/second-half arc. This distinction is
what makes Golden Case D (improving skill) behave correctly instead of
misclassifying recent stable strong performance as "inconsistent" just
because the full history contains a big jump.

## Running it

```bash
cp .env.example .env        # fill in your real DATABASE_URL, AI Gateway, etc.
npm install
npm test                    # 35 tests, framework-free domain layer + integration
npm run typecheck
npm run dev                 # starts the API on :3000 (Postgres repo + in-memory
                             # fixtures for everything else - see server.ts)

# Apply migrations to your Postgres instance:
psql "$DATABASE_URL" -f db/migrations/001_role_skill_gap_snapshots.sql
psql "$DATABASE_URL" -f db/migrations/002_role_skill_gap_evidence.sql
psql "$DATABASE_URL" -f db/migrations/003_role_skill_gap_history.sql
```

Open `preview/preview.html` directly in a browser for a look at the
dashboard with mock data — no server required.

## Wiring in your real systems

Each of these is a single class implementing an interface in
`src/ports/index.ts`, swapped in at `src/api/server.ts` (the one place
adapters get chosen):

1. **`RoleModelPort`** → your canonical Role-Based Skill Model. Must return
   requirements (importance/weight/target mastery/evidence requirements)
   and the dependency edge list for a role.
2. **`SkillStatePort`** → your Mastery Level System / Skill Signal Engine.
   Must return the authoritative current mastery per skill — the gap engine
   never derives this itself.
3. **`EvidencePort`** → challenge results, hidden tests, debugging,
   reasoning/understanding checks. Used only for confidence/consistency/
   trend/diversity, never to re-derive mastery.
4. **`CachePort` / `EventBusPort`** → your Redis/queue infrastructure.
   `RecalculationService` already subscribes to a `skill.mastery.updated`
   event and recalculates only the affected roles — publish that event from
   wherever mastery actually changes today.
5. **`NextBestActionPort` / `RoleReadinessPort` /
   `TechnicalMasteryReportPort`** → implement `submitGapContext` against
   your real engines. `GapAnalysisService` already calls these best-effort
   after every recalculation.
6. **Auth** → replace `src/api/middleware.ts`'s `authContext` with real
   session/JWT verification. Keep the `req.auth` shape and the
   self/staff-in-org authorization check in `requireStudentAccess`.
7. **AI Gateway** → set `AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY`, or
   replace `AIGatewayExplanationAdapter` if your gateway's request/response
   shape differs.

## Directory structure

```
src/domain/       deterministic engine - pure functions, no I/O
src/ports/        interfaces for every external CodeForge system
src/adapters/      memory.ts (dev/test fixtures) + real Postgres/AI adapters
src/application/   GapAnalysisService, RecalculationService (orchestration)
src/api/           Express routes, validation, auth contract placeholder
db/migrations/     tenant-isolated Postgres schema (RLS)
frontend/          dashboard components (plain CSS, no framework assumed)
preview/           standalone HTML demo with mock data
tests/             26 domain tests + 9 integration tests (35 total)
```

## Config & versioning

Every tunable threshold (partial-vs-below-target cutoff, evidence minimums,
consistency/volatility thresholds, confidence and priority weights) lives in
`src/domain/config.ts` with a comment explaining what it controls — nothing
in the calculation logic is a bare magic number. `GAP_ALGORITHM_VERSION` and
each role's `roleModelVersion` are stamped on every persisted snapshot, so
changing the algorithm later never makes historical results uninterpretable.
