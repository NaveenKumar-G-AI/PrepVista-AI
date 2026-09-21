# CodeForge AI — Adaptive Challenge Engine (Feature 25)

Standalone, integration-ready implementation of the selection engine described
in the Feature 25 spec: *"Given everything CodeForge has reliably learned
about this student, what is the most valuable next challenge to present
right now?"*

## Important context — read this first

The spec's own first instruction is **"inspect the existing repository"**
before building anything, and to reuse existing challenge/skill/role/user
infrastructure rather than duplicating it. No CodeForge repository was
available in the environment this was built in — only the spec document
itself. So this was **not** built by inspecting real code, and it does
**not** duplicate a real schema, because there was no real schema to look at.

What this is instead: the actual decision-making core — evidence
aggregation, hard constraints, multidimensional difficulty adaptation,
uncertainty-driven skill prioritization, scoring, and the selection
pipeline — built for real, unit- and scenario-tested against a fixture
that mirrors the spec's own "golden scenario," with a clearly marked
integration boundary (`src/integration/ports.ts`) for the four things a
real integration needs to supply: the challenge catalog, the student skill
model, curriculum/override config, and an audit log. Swap the in-memory
adapters for real ones backed by your existing services and this runs
against real data without changing the engine itself.

See `STATUS_REPORT.md` for a line-by-line honest accounting of what's
implemented, partially implemented, or blocked by the lack of a real repo.

## Layout

```
src/
  types.ts                    All domain types (skill state, challenge metadata, audit records, ...)
  config/selectionWeights.ts  Versioned, configurable objective weights + intent-based bias
  evidence/aggregateEvidence.ts  Evidence aggregation with overfit-to-one-success/failure guards
  engine/
    filters.ts                 Hard constraints, prerequisites, availability, repetition
    pathIntent.ts               Skill prioritization -> PathIntent (DIAGNOSTIC/REMEDIATION/...)
    difficultyAdaptation.ts     Multidimensional, selective difficulty targeting
    scoring.ts                  Per-candidate soft-preference scoring
    selector.ts                 Orchestrates the full pipeline, produces NextBestChallenge + audit
    adaptivePath.ts              Evidence-driven FOUNDATION -> ... -> ROLE_ASSESSMENT stage tracking
  explain/explain.ts           Deterministic, mode-aware student/instructor explanations
  integration/
    ports.ts                   The integration boundary — implement these against the real repo
    inMemoryAdapters.ts        DEMO/TEST ONLY implementations of those ports
  api/
    handlers.ts                 Framework-agnostic handlers for the 7 operations in the spec
    exampleExpressRouter.ts     Illustrative wiring only — not built/tested, not a real dependency
  frontend/NextChallengeCard.tsx  The "next challenge" recommendation card from the spec's UI mock
  db/migrations/0001_adaptive_challenge_engine.sql  New tables only — see file header
tests/                         22 tests, including an end-to-end "golden scenario" fixture
```

## Running it

```bash
npm install
npm test        # builds with tsc, then runs the full test suite
```

Expected output: `22 passed, 0 failed, 22 total`. This has actually been
run in the environment this was built in — see STATUS_REPORT.md.

There is no server/HTTP entry point to "run the app," because there is no
real HTTP framework, auth system, or database wired in yet — see
"Integrating with the real repository" below.

## Design highlights (mapping back to the spec)

- **Overfit guards** (`evidence/aggregateEvidence.ts`): a single
  uncorroborated success/failure can only move a skill's score by a capped
  amount; MASTERED requires diversified, confident evidence, not one hard
  problem solved once. Directly tested in `tests/overfitProtection.test.ts`.
- **Multidimensional, selective difficulty** (`engine/difficultyAdaptation.ts`):
  difficulty is an 8-dimension vector (algorithm, implementation, reasoning,
  state, debugging, constraints, edgeCases, transfer). Remediation isolates
  and reduces only the diagnosed bottleneck dimension — everything else
  holds at the student's comfort zone — rather than dropping to an easier
  problem across the board.
- **Uncertainty vs. confirmed weakness** (`engine/pathIntent.ts`): a skill
  the student has never attempted (`UNKNOWN`) is treated as low priority —
  it hasn't reached this student's path yet — while a skill with sparse,
  inconsistent evidence (`UNCERTAIN`) gets a strong diagnostic pull. These
  are easy to conflate and the spec calls them out as distinct states.
- **Hard constraints before soft ranking** (`engine/filters.ts`):
  prerequisites, status, language, role, curriculum, and repetition are
  applied as filters before any scoring happens, not as scoring penalties —
  so they can never be "outbid" by a high score elsewhere.
- **Human override always wins** (`engine/selector.ts`): an active
  instructor override short-circuits the entire pipeline before the
  candidate pool is even fetched.
- **Everything is auditable** (`SelectionAuditRecord`): every selection
  persists the full candidate set, every filter stage's in/out counts, the
  top-5 scored candidates with their full component breakdown, and the
  weights/selector/student-model versions that produced the decision.
- **Assessment integrity** (`explain/explain.ts`): the same audit record
  produces a detailed explanation in PRACTICE mode and a restricted,
  generic one in ASSESSMENT/INTERVIEW mode — the underlying decision
  process doesn't change, only what's disclosed.

## Integrating with the real repository

1. Implement the four ports in `src/integration/ports.ts` against your
   actual challenge catalog, skill/mastery system, curriculum config, and
   Supabase-backed audit tables. Do not create new tables for
   challenges/skills/users — the migration in `src/db/migrations` only
   adds tables Feature 25 itself owns.
2. Resolve every `ASSUMPTION:` comment in
   `src/db/migrations/0001_adaptive_challenge_engine.sql` against your
   real table/column names, then run the migration.
3. Replace `src/api/exampleExpressRouter.ts` with real wiring into
   whatever HTTP layer and auth middleware this repository already uses —
   it's illustrative only.
4. Fill in `.env.example` -> `.env` and copy `NextChallengeCard.tsx` into
   your component tree, reconciling its Tailwind token names with your
   actual design system.
5. Re-run `npm test`, then write integration tests against your real
   database before this touches real students.
