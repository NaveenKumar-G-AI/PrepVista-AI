# Architecture Assumptions

The brief asks, before coding, for: current architecture, relevant files,
mastery system, question system, feature integrations, DB changes, API
changes, retention model, event model, prototype scope, testing strategy.
No ACEAPT codebase was attached to inspect, and the instruction was to build
without stopping to ask — so here's that same checklist, answered as
documentation of what got built and why, so it's auditable against the real
codebase later instead of skipped.

## A/B. Current architecture & relevant files

Unknown — no repository was provided. Rather than guess at ACEAPT's actual
stack (which would risk producing code that looks plausible but doesn't fit
your conventions), Feature 19 was built as an **isolated module with hard
interface boundaries**. Every place it would need to touch the real system
is a named interface in `src/repositories/ports.ts` or
`src/integration/featurePorts.ts`, not a guess at your internals.

**Stack chosen for the prototype:** Node.js + TypeScript, Express, in-memory
storage by default. This is a default, not a discovery — if ACEAPT's real
backend is a different language or framework, the *design* (the engine
functions, the event model, the state machine) ports directly even if the
glue code doesn't.

## C. Mastery system (Feature 14)

Assumed contract: Feature 14 exposes, at minimum, *when* a concept was
mastered and *at what success rate*. That's `MasteryRecord` in
`featurePorts.ts`. Feature 19 calls `getMasteryRecord` once (on
`onConceptMastered`) to seed the baseline it compares later evidence
against, and again on every recompute to keep that baseline current if
Feature 14 revises it. If Feature 14's real record has a richer shape, only
`MockMasteryPort` and the two field reads in `RetentionService` need to
change.

## D. Question system (Feature 17)

Assumed contract: given a concept + a retrieval mode (`micro` / `blind` /
`contrastive` / `mixed` / `transfer` / `standard`) plus some optional
constraints (difficulty, timed, exclude-these-templates,
contrast-with-these-concepts), Feature 17 returns question references with
enough metadata (`templateId`, `method`, `topicWrapper`, `difficultyBand`)
for Feature 19 to score context diversity. Feature 19 never authors question
content — `MockQuestionPort` fabricates placeholder prompts only so the
demo/API are runnable standalone.

## E. Feature integrations

| Feature | Direction | Contract |
|---|---|---|
| 13 — Readiness | Feature 19 → 13 | `reportPressureEvidence` when timed success is meaningfully below untimed (see `pressureAnalysis.ts`) |
| 14 — Mastery | 14 → Feature 19 | `getMasteryRecord`; Feature 19 refuses to initialize a concept without one |
| 16 — Intervention | Feature 19 → 16 | `escalate` when a reactivation exhausts all 5 levels without success |
| 17 — Questions | Feature 19 → 17 | `getQuestions` for every session type |
| 18 — Reasoning | 18 → Feature 19 (optional) | `getReasoningSignal` — defined but not yet consumed anywhere in the engine; a real explanation-dependency signal from Feature 18 would sharpen `explanationDependencyRate`, currently derived only from `explanationRequested` on each attempt. Wiring this in is a small, isolated change to `evidence.ts`. |

## F. Database changes

None yet, by design — see `prisma/schema.prisma` for the reference shape and
the README's "Swapping in a real database" pointer below. `KnowledgeState`
is the one truly new persisted concept; `RetrievalAttempt` is an append-only
log; `RetentionEvidence` is deliberately **not** a table — it's computed on
demand from `RetrievalAttempt` history so there's exactly one source of
truth for what happened.

## G. API changes

All new, additive, namespaced under `/api/feature19` — see README. Nothing
here modifies an existing endpoint.

## H. Retention model

`RetrievalAttempt` (raw, append-only) → `RetentionEvidence` (computed) →
`{strengthBand, riskState}` (persisted on `KnowledgeState`). See
`src/domain/types.ts` for the full shape and the README's "Key design
decisions" for the reasoning behind each field.

## I. Event model

All 9 events from the brief are implemented in `src/events/eventTypes.ts`
and emitted from `RetentionService` at the points listed in the README.
`EventBus` is in-process pub/sub with a queryable log; swap it for a real
event stream by reimplementing the same three methods (`emit`, `on`,
`getLog`) against Kafka/SNS/an outbox table.

## J. Prototype scope

**In scope (built):** evidence collection & context-diversity scoring,
strength banding, per-student decay detection, the 5-level reactivation
ladder, personalized recall scheduling ("Today's Memory Check"), blind
retrieval / contrastive recall / mixed retention session shaping,
retrieval-under-pressure detection, prerequisite-risk propagation, the full
event stream, an HTTP API, two frontend components, and a scripted demo
reproducing the brief's own "Day 1 / Day 7 / Day 21" judge scenario.

**Out of scope (seams left for real data/ML work):** actually fitting a
per-student decay/forgetting-curve model from history (currently a neutral
constant per `PersonalDecayProfile` — see README); persistence; real
Feature 13/14/16/17/18 clients; auth/multi-tenancy; rate limiting; anything
resembling a training pipeline.

## K. Testing strategy

See README → "Testing strategy." Short version: `src/engine/` is pure
functions and is where unit tests pay off most; `npm run demo` is the
integration-level smoke test and already caught one real bug during
development (risk state escalating through a successful reactivation
because it compared a rolling average to baseline instead of weighting the
attempt that just happened — fixed in `decayDetection.ts`, worth locking in
as a regression test).

---

## Swapping in a real database

1. Implement each interface in `src/repositories/ports.ts` against Prisma,
   using `prisma/schema.prisma` as the starting shape (reconcile
   `studentId`/`conceptId` with your real `student`/`concept` tables first).
2. In `src/api/server.ts`, replace the `InMemory*` constructors with your
   new classes. Nothing else changes — `RetentionService` and everything in
   `src/engine/` only ever see the interface.

## Swapping in real Feature 13/14/16/17/18 clients

Same pattern: implement the interface in `src/integration/featurePorts.ts`
for the feature you're connecting, replace the `Mock*` constructor in
`src/api/server.ts` (and `src/demo/judgeDemo.ts` if you want the demo to use
real data too). Delete the `/api/feature19/_dev/mastery-entries` route once
`MockMasteryPort` is gone — it has no equivalent in the real system.
