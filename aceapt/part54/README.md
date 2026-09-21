# ACEAPT Feature 54 — Question Validation Engine

Objective, versioned, dependency-aware validation of question versions before
they're allowed to influence ACEAPT — schema, answer, solution, math, logic,
options, units, skill, difficulty, runtime, scoring, and assessment
compatibility, aggregated without ever collapsing to a single score.

Real TypeScript / Fastify / Postgres 16, matching the stack and security
pattern used across every other ACEAPT feature in this series (Feature 4,
Feature 28, Feature 42). See **TRUTH_TABLE.md** for the full, honest breakdown
of what's real vs. a documented port vs. not built this pass — read that
before assuming any specific integration exists.

## Quick start

```bash
npm install
cp .env.example .env        # fill in DB creds / GROQ_API_KEY yourself — left blank on purpose

# Stand up Postgres 16, then:
npm run db:migrate          # applies db/migrations/*.sql — creates qve_owner/qve_app, RLS, functions

npm test                    # unit tests only, no DB needed
npm run test:security       # live RLS/SECURITY DEFINER tests — needs Postgres
npm run test:integration    # end-to-end pipeline + live Postgres repo + live HTTP
npm run test:all            # everything

npm run dev                 # starts the Fastify server on :3054
```

## Why the assumptions below exist

Section 7 of the build spec opens with "FIRST ACTION — INSPECT THE REAL ACEAPT
CODEBASE." There was no reachable ACEAPT repository in this session — no
upload, no connector, no filesystem access to it — which is the same situation
recorded for every other feature in this series (see TRUTH_TABLE.md for the
precedent). Rather than pause and ask, per your standing instruction this was
built directly against the spec's own text, using the same conventions this
series has established elsewhere, with the gap made explicit rather than
papered over:

- **Stack**: TypeScript, Fastify, Postgres 16 — matches Feature 4/28/42 exactly.
- **Security pattern**: `qve_owner` (BYPASSRLS, owns everything) + `qve_app`
  (zero raw grants, SECURITY DEFINER-functions-only) + RLS FORCED — the same
  shape as `diag_owner`/`diag_app` and `proof_owner`/`proof_app`, chosen
  specifically because two earlier features in this series hit real RLS/GUC
  bugs with alternative approaches — this design avoids reintroducing either
  bug class.
- **AI adapter**: Groq behind a deterministic fallback, used only for semantic/
  clarity judgment and NEVER for the actual pass/fail decision on deterministic
  truth — matches the adapter role used everywhere else in this series, and is
  the literal architecture spec §103 asks for independent of precedent.
- **Question/Answer/Solution/Skill/Difficulty models**: no real ACEAPT schema
  was available, so `QuestionVersionSnapshot` (`src/contracts/types.ts`) is a
  minimal, deliberately-scoped PORT — real enough to drive every validator in
  this delivery and every one of the 140 real tests, not a guess dressed up as
  the true schema. Field-map it onto the real models when you have them; the
  validators only depend on the interface, not on this being the final shape.
- **Keys left blank**: `.env.example` has empty `GROQ_API_KEY` and DB
  credentials, per your instruction — fill them in yourself.

## Architecture

```
QuestionVersionSnapshot
        |
QuestionValidationService.validateQuestionVersion()
        |
ValidationPlanner  (dependency-aware topological layering)
        |
ValidationExecutor (timeout, retry-on-infra-error, cache-aware, per layer in parallel)
        |
  [12 validators -- see TRUTH_TABLE.md for the full list]
        |
ValidationAggregator (per-mode eligibility matrix; every individual result stays inspectable)
        |
ValidationRunResult -> ValidationRunRepository (in-memory or Postgres via qve_app)
```

Validators are plain classes implementing one `Validator` interface
(`src/contracts/validator.ts`) and are independently unit-testable — see
`src/registry/bootstrap.ts` for the full wiring and `src/profiles/
validationProfiles.ts` for which validators are *required* vs. *optional* per
intended use (practice / diagnostic / transfer / timed / assessment).

### The dependency-vs-relevance distinction (a real bug this delivery hit and fixed)

A validator's `dependsOn` controls whether it's even attempted (spec §16, §93
— a dependency that didn't pass means SKIPPED, never a false PASS). A
profile's `required` list controls whether *that profile's* eligibility can be
VALID. These are deliberately different concepts — see TRUTH_TABLE.md bug #2
for what happens when they get conflated.

## Project layout

```
src/
  contracts/     -- ValidationResult, states, severity, error codes, Validator interface
  registry/      -- ValidatorRegistry + bootstrap.ts (wires all 12 validators)
  planner/       -- dependency-aware topological execution plan
  executor/      -- runs the plan: timeout, retry, dependency-skip, cache
  aggregator/    -- rolls up individual results into overall status + eligibility matrix
  cache/         -- content-hash-keyed validator result cache
  freshness/     -- stale-run detection
  hashing/       -- deterministic question-version content hash
  profiles/      -- PRACTICE / DIAGNOSTIC / TRANSFER / TIMED / ASSESSMENT profiles
  validators/    -- the 12 validators + shared support (safe math eval, CSP solver, numeric parsing)
  ai/            -- Groq adapter, simulated/fallback clients, structured output contract
  ports/         -- dev-mode stand-ins for Skill Graph / Scoring Normalizer / Asset Store
  security/      -- role-based response scoping + answer-key-leakage guard
  service/       -- QuestionValidationService (the top-level orchestrator)
  repositories/  -- in-memory + Postgres (qve_app-only) run/audit repositories
  api/           -- Fastify routes + server wiring
  react/         -- QuestionValidationCenter (admin UI) + EligibilityBadge
  queue/         -- priority-ordered in-memory async queue seam
db/migrations/   -- ported minimal Question tables + Feature 54's own schema + RLS/roles/functions
test/            -- unit / integration / security / react, 140 tests, all real
TRUTH_TABLE.md   -- what's real vs. ported vs. not built, and every bug found via testing
```
