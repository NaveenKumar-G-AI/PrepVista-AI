# ACEAPT Feature 56 - Formula Intelligence Engine

A standalone, integration-ready implementation of the Feature 56 spec:
formula understanding, recognition, recall, selection, variable mapping,
application, verification, transfer and retention - a training and
diagnosis engine, not a formula sheet.

## Why this is standalone

No existing ACEAPT repository was available to inspect in this session, so
this was built fresh rather than claiming to have found and reused code
that was never actually seen. Every reuse point the spec calls for
(Features 45/48/49/50/51/52/53/54/55, general mastery, retention
scheduling, the AI gateway) is represented as a small TypeScript interface
with a conservative default implementation - see `src/integrations/ports.ts`
and `docs/INTEGRATION.md` for how to wire your real ones in.

## Quick start

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test             # vitest - engine, validator, classifier, confusion, API (56 tests)
npm run dev           # demo server on :4056 against in-memory + seed data
```

## What's implemented (P0, spec section 238)

- Canonical formula entity, versioning, variables, conditions, non-applicability
- Derived/inverse forms, validated numerically against the canonical form
  (`src/validation/formulaValidator.ts` - randomized-trial identity checking
  with mathjs; see the file header for the exact method and its limits)
- Formula relationships & confusion graph (`src/graph`)
- Eight training activity types: RECOGNIZE, RECALL, SELECT, MAP, APPLY,
  VERIFY, TRANSFER, RETAIN
- Per-student, per-formula competency state across 8 dimensions, with a
  minimum-sample-size rule before anything is called STRONG / NEEDS_ATTENTION
  (spec sections 118, 183) and regression detection (section 126)
- Formula-specific error taxonomy with "first error, not every downstream
  symptom" classification (spec sections 35-46, 116, 205-215)
- Confusion-pattern detection and resolution, derived from the attempt log
  rather than a parallel store (spec sections 37-39, 129, 185)
- Bottleneck analysis and an adaptive next-activity policy that follows the
  recognition -> recall -> selection -> mapping -> application ->
  verification -> transfer -> retention progression (spec sections 67, 180-181)
- Guidance fading / support-level state machine (spec sections 53-54)
- Assessment-mode lock enforced inside the engine and at the API layer, not
  just left to the frontend to respect (spec sections 85, 172, 232)
- Role-gated API (student-self-or-staff, content-editor-only admin routes)
- AI is fully optional and never the source of canonical truth - every code
  path works with the default no-AI adapter; a prompt-injection-safe helper
  keeps untrusted content structurally separate from instructions (spec
  sections 105-107, 171, 231, 233)

P1/P2 items (formula chains, semantic search, cohort analytics, handwriting
recognition, etc.) are intentionally not built - the spec marks these as
"advanced" / "future" (sections 239-240), and the interfaces here (the
relationship-type vocabulary, the per-dimension state model, the ports
layer) are shaped so they can be added without a rewrite.

## Architecture

```
FormulaRegistry / FormulaGraphService        FormulaStudentStateService
   (canonical content, relationships)   (per-student, per-formula evidence)
                    \                          /
                     \                        /
              FormulaTrainingEngine  <-- ConfusionDetector
              (sessions, grading,         (derived from the
               getNextActivity,            attempt log)
               submitAttempt)
                     |
              FormulaTrainingPolicy
              (bottleneck -> next activity,
               via formulaBottleneckAnalyzer)
                     |
        Features 45-55 / mastery / retention / AI
        (src/integrations/ports.ts - swap Default*/Null*
         adapters for real ones, see docs/INTEGRATION.md)
```

Formula content and student evidence never touch each other directly -
`FormulaRegistry`/`FormulaGraphService` own the former,
`FormulaStudentStateService` owns the latter, and `FormulaTrainingEngine` is
the only thing that reads both to decide what happens next.

## What this deliberately does NOT do

- **Author question content.** `getNextActivity` returns a *directive*
  (formula, activity type, difficulty, novelty, discrimination candidates) -
  your validated Question Bank (Feature 53/54) turns that into an actual
  question. See the `AttemptInput` doc comment in `src/types/index.ts`.
- **Implement real authentication.** `attachAuthContext` is a header-based
  dev stub, clearly marked - do not deploy it as-is.
- **Fully partition multi-tenant data.** `Formula.tenantId` exists for
  tenant-private content, but student-state tenant isolation is not wired
  end-to-end. See docs/INTEGRATION.md.
- **Run Prisma.** `prisma/schema.prisma` is a design artifact; `npx prisma
  generate` needs network access to Prisma's engine CDN and a real
  `DATABASE_URL`, neither available in this environment. The engine itself
  only depends on the repository interfaces in `src/repositories/index.ts`,
  so a real Postgres-backed implementation doesn't require touching engine
  code.

## Known limitations

- Seed content (`src/seed/formulas.seed.ts`) covers 3 formulas
  (Speed-Distance-Time, Simple Interest, Compound Interest) - enough to
  exercise every code path and mirror the spec's own worked examples
  (sections 100, 195, 244-249), not a content library.
- Unit/dimensional validation (spec section 102) is not implemented - only
  algebraic (numeric-trial) validation of derived forms.
- Training-session creation doesn't yet verify the caller is the student in
  question - the profile/weakness/admin routes do (see `tests/api.test.ts`
  for the RBAC tests); see docs/INTEGRATION.md item 4.
- `MasteryPort` and `RetentionSchedulerPort` are defined but not yet called
  anywhere in `FormulaTrainingEngine` - see docs/INTEGRATION.md item 2 for
  the intended hook points.

## Project layout

```
src/types/            domain types shared everywhere
src/repositories/      port interfaces + in-memory implementations
src/seed/               example canonical content (3 formulas)
src/validation/         numeric derived-form validator (mathjs)
src/registry/           canonical formula lookup/search
src/graph/              relationships + confusion pairs
src/state/              per-student competency state
src/errors/              per-attempt error classifier + transfer/retention gaps
src/confusion/           confusion pattern detection/resolution
src/bottleneck/          adaptive bottleneck algorithm
src/integrations/        ports for Features 45-55, mastery, retention, AI
src/training/            policy (what to train next) + engine (orchestration)
src/api/                 Express app, routes, controllers, auth middleware
prisma/schema.prisma     design-time DB schema (not generated/run here)
tests/                   56 tests across all of the above, including HTTP-level API tests
docs/INTEGRATION.md      practical wiring guide
```
