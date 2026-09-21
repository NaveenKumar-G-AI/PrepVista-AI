# ACEAPT AI — Feature 19: Retention, Forgetting & Knowledge Reinstatement Engine

Answers one question per concept, per student: **can they still retrieve this,
after time has passed — not just today?**

Built as a standalone, self-contained module because the real ACEAPT codebase
wasn't available to inspect. Every dependency on the rest of ACEAPT (the
student model, Feature 14 mastery, Feature 17 questions, Feature 13
readiness, Feature 16 intervention) is expressed as a small interface with a
mock implementation behind it, so this runs with **zero configuration** and
drops into the real system by swapping those mocks for real clients — see
`ARCHITECTURE_ASSUMPTIONS.md`.

## Quick start

```bash
npm install
npm run demo     # runs the Day 1 → Day 7 → Day 21 scenario from the brief, narrated
npm run dev      # starts the HTTP API on :4019
npm run typecheck
```

No `.env` file is required to run either of those — see **Keys & config**
below.

## What's real vs. mocked

| Piece | Status |
|---|---|
| Evidence collection, diversity scoring, strength bands, decay detection, reactivation state machine, concept-dependency propagation, recall scheduling | **Real** — deterministic, fully implemented, unit-testable pure functions in `src/engine/` |
| In-memory repositories | **Real**, but not persisted — swap for Prisma-backed classes (schema in `prisma/schema.prisma`) when ready |
| `MockMasteryPort`, `MockQuestionPort`, `MockReadinessPort`, `MockInterventionPort`, `MockReasoningPort` | **Mocked** — replace with real Feature 13/14/16/17 clients in `src/integration/featurePorts.ts` |
| AI content (recall prompts, hints, micro-lessons, contrastive explanations) | **Real**, calls the Anthropic API when `ANTHROPIC_API_KEY` is set; falls back to deterministic templated text otherwise |

## Keys & config

Copy `.env.example` to `.env` and fill in what you have. Every value starts
blank on purpose:

```
PORT=4019
DATABASE_URL=            # not wired up yet — in-memory by default
ANTHROPIC_API_KEY=       # optional — falls back to templated text if blank
ANTHROPIC_MODEL=claude-sonnet-5
```

Nothing breaks with all of these blank. `DATABASE_URL` has no effect until
you implement a Prisma-backed repository (see below); it's here so the shape
is ready when you are.

## Folder structure

```
src/
  domain/types.ts          Feature 19's own model (KnowledgeState, RetentionEvidence, …)
  events/                  Event bus + the 9 event types from the brief
  repositories/            Ports (interfaces) + in-memory implementations
  integration/             Ports to Features 13/14/16/17/18 + mocks
  ai/                      AI content generation, separated from scoring
  engine/                  The actual intelligence — pure, deterministic, testable
  services/RetentionService.ts   Orchestrates everything; the one class the API/demo call
  api/                     Express routes + composition root
  demo/judgeDemo.ts        Runnable end-to-end scenario
frontend/                  Two components matching the brief's UI mockups
prisma/schema.prisma       Reference schema for when you persist for real
```

## API

Base path `/api/feature19`. All bodies/responses are JSON.

| Method & path | Purpose |
|---|---|
| `POST /students/:id/mastery-entries` `{conceptId}` | Feature 14 calls this the moment a concept becomes MASTERED |
| `GET /students/:id/today-memory-check` | Today's Memory Check card data |
| `GET /students/:id/knowledge-states` | All tracked concepts for a student |
| `POST /students/:id/recall-sessions` `{conceptIds, type}` | Start a session (`today_memory_check`, `mixed_retention`, `contrastive_recall`, `blind_retrieval`, `single_concept_check`) |
| `POST /recall-sessions/:id/attempts` | Submit a graded retrieval attempt |
| `POST /students/:id/concepts/:conceptId/reactivation` | Start a reactivation session |
| `POST /reactivation-sessions/:id/steps` `{phase, correct, ...}` | Advance the reactivation ladder (`phase`: `repair` \| `similar` \| `transfer`) |
| `GET /students/:id/dashboard` | Knowledge Health Dashboard counts |
| `GET /analytics/observability?studentId=` | Recall/reactivation success rates, event counts |
| `POST /api/feature19/_dev/mastery-entries` | **Dev-only.** Seeds the mock mastery port so you can hit the API without a real Feature 14 connected. Delete once real integration lands. |

## Key design decisions

- **Feature 19 does not grade answers.** `submitRetrievalAttempt` takes an
  already-graded attempt (`correct`, `latencyMs`, `hintsUsed`, …) from
  whatever ran the question. It turns that into retention evidence — it
  isn't a question engine or a mastery engine.
- **Qualitative before numeric.** `strengthBand` (`STRONG` / `MODERATE` /
  `WEAK` / `INSUFFICIENT_EVIDENCE`) is always present; `strengthScore` only
  appears once evidence sufficiency clears a threshold. No 87.43% out of two
  data points.
- **Decay detection is per-student, multi-signal, and reversible.** Risk
  state moves based on the *latest attempt's own result*, with baseline
  gap / transfer weakness / staleness as corroborating magnitude — not a
  fixed "N days since practice" rule, and not a one-way ratchet: strong
  corroborated evidence recovers risk state.
- **Minimum necessary intervention.** The reactivation ladder starts at
  whatever level is currently active and only escalates on failure; any
  success jumps straight to verification instead of working through every
  remaining level.
- **A verified reactivation is authoritative.** Completing repair → similar
  → transfer sets risk state to `STABLE` directly (and fires
  `KNOWLEDGE_STABILIZED`) rather than waiting for a rolling average to catch
  up — matching the brief's own `REACTIVATE → VERIFY → STABILIZE` loop.
  Day-to-day recall outside a formal reactivation still recovers gradually
  from evidence.
- **Context diversity is measured, not assumed.** Shannon entropy over
  (template, difficulty, method, topic-wrapper) — ten near-identical
  questions score as low diversity even at 100% correct.
  ("*10 similar questions ≠ mastery.*")
- **Prerequisite risk only ever soft-flags dependents** for the next mixed
  check; it never silently downgrades a dependent's own confirmed state.
- **AI never decides a state.** It only writes the text of prompts, hints,
  reminders, and micro-lessons. Every score and transition is a pure
  function in `src/engine/`.

## Testing strategy

Everything in `src/engine/` is a pure function (no I/O), which makes it the
highest-value place to add unit tests — feed it a crafted `RetrievalAttempt[]`
/ `RetentionEvidence` and assert on the output:

- `evidence.ts` — diversity score on identical vs. varied contexts; sufficiency at 0/2/6+ attempts
- `retentionStrength.ts` — band boundaries; score omitted below the sufficiency threshold
- `decayDetection.ts` — a single miss vs. a corroborated severe drop; recovery after a strong run; no runaway escalation through a success streak (this was an actual bug caught by `npm run demo` during development — worth locking in as a regression test)
- `reactivationEngine.ts` — escalation on failure, jump-to-verify on success, exhaustion at level 5 → `escalated`
- `conceptGraph.ts` — propagation only fires for WEAKENING+ states

`RetentionService` is the integration layer — `npm run demo` already
exercises it end-to-end; the same wiring pattern (in-memory repos + mock
ports + a `FakeClock`) is what a service-level test suite would use.

## What was deliberately left as a seam, not built

- **Personalized decay profiles** (`PersonalDecayProfile` in
  `decayDetection.ts`) currently use one neutral prior per student. The
  brief's "student-specific evidence" requirement is honored at the
  *interface* level — nothing else in the engine needs to change when this
  becomes a real per-student model fit from history — but fitting that model
  is a data-science task, not something to invent here.
- **`transferAfterDelaySuccessRate`** in the observability endpoint returns
  `null` on purpose — it needs a product decision on what "after delay"
  means (how many days?) before it can be computed honestly.
