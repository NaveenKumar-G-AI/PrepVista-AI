# ACEAPT Feature 58 — Guessing Intelligence Engine

Decision intelligence for uncertain exam questions: elimination, informed
guessing, strategic skipping, confidence calibration, time allocation, and
evidence-based answer switching. Not a random-guessing tool, not an answer
predictor, and never a live-assessment cheating aid — see
[Assessment integrity](#assessment-integrity) below.

## Why this is built the way it is

The spec this implements calls for reusing ~15 other ACEAPT systems (Feature
34 Confidence, Features 49–57, Mistake Intelligence, Mastery, Retention,
Recommendation, the real scoring engine, auth, analytics, tenant isolation…)
rather than rebuilding any of them. This was built with no access to that
codebase, so instead of guessing at its shape, **every upstream dependency is
a small TypeScript interface ("port") in `src/ports.ts`**, with a safe,
inert default implementation in `src/adapters/defaultPorts.ts`. The actual
decision logic in `src/domain/*` and `src/services/*` only ever talks to
these interfaces.

That means:
- The module runs and is fully testable **standalone**, today, with zero
  real integrations wired in.
- Wiring in the real systems is additive: implement one interface, pass it
  into `src/server.ts` in place of the matching `null*Provider`, and nothing
  else changes.
- Nothing here fabricates data from a system it can't see. Where a real
  answer isn't available (e.g. no scoring-policy provider wired in yet),
  the code returns `null`/`UNKNOWN`/`SELF_REPORTED` rather than guessing —
  see `§120-121`, `§102-103` in the original spec for why that matters here.

All secrets/config are blank in `.env.example` — fill them in as you wire
real systems in. See [Configuration](#configuration).

## What's here

```
db/migrations/0001_decision_intelligence.sql   New tables only — Student/
                                                Assessment/Question/Attempt
                                                already exist in ACEAPT and
                                                are referenced by plain UUID,
                                                never recreated.
src/types.ts             Core enums & shared types (action taxonomy,
                          uncertainty states, evidence levels, etc.)
src/ports.ts              Interfaces for every upstream capability this
                          module depends on (Feature 34, 49-57, scoring
                          policy, analytics, AI gateway, auth).
src/adapters/             Default (inert) + optional real (Anthropic AI
                          gateway) implementations of those ports.
src/domain/               Pure decision-science logic: expected value /
                          break-even guessing math, confidence calibration,
                          decision-quality scoring (no hindsight bias, by
                          construction — see below), bottleneck detection,
                          elimination evidence, configurable policy rules.
src/repositories/         Repository interfaces + a Postgres (raw SQL, no
                          ORM) implementation.
src/services/             The 9 services named in the spec (§131), each a
                          thin orchestration layer over domain/ + repos.
src/middleware/           Auth placeholder + the assessment-integrity guard.
src/api/router.ts         The 9 HTTP endpoints from §129.
src/server.ts             Wires it all together — the file you edit first
                          when swapping in real adapters.
tests/                    45 tests: domain math, service behavior, and the
                          integrity guard.
frontend/                 7 React/TypeScript components + a gallery harness
                          to view them together (see frontend/README below).
```

## The no-hindsight-bias guarantee

The spec is emphatic that a decision must be judged on information available
*at the time*, never on the outcome (§62, §170-171, §238). This is enforced
structurally, not just by convention: `DecisionQualityInput` in
`src/domain/decisionQuality.ts` has **no `isCorrect` / outcome field at all**.
`assessProcessQuality()` physically cannot see the outcome — it's not a
matter of the function choosing to ignore it. Correctness is scored
separately by `assessOutcome()`, and the two are only ever combined for
*display*. `tests/domain/decisionQuality.test.ts` asserts this behaviorally
as well.

## Assessment integrity

This is the property the spec cares about most (§118, §130, §190, §213,
§217), so it's enforced twice (defense in depth):

1. `stripLiveCoachingFields()` in `src/middleware/assessmentIntegrityGuard.ts`
   — a pure, unit-tested function that redacts recommendation/hint/scoring-
   advice fields from any response when the decision context is
   `FORMAL_ASSESSMENT`, unless the assessment's own policy explicitly sets
   `strategyAssistance: 'FULL'`.
2. `assessmentIntegrityGuard` Express middleware wraps `res.json` so this
   happens even if a route handler forgets to call the pure function
   directly.

`DecisionTrainingService.submitDecision()` also independently never returns
a `coaching` string for `FORMAL_ASSESSMENT` submissions — three layers,
any one of which is enough on its own.

## Configuration

Copy `.env.example` to `.env`. Every value can stay blank — the app boots
fine and only fails, loudly, at the point something requiring that value is
actually used.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (defaults to 4058 if blank) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_PUBLIC_KEY` | Placeholder for ACEAPT's real auth verification — see `src/middleware/auth.ts` |
| `AI_GATEWAY_API_KEY` / `AI_GATEWAY_MODEL` | Optional. Blank = runs entirely on the template-based fallback, no AI calls at all (§192) |
| `DEFAULT_TENANT_ID` | Local/dev convenience only |

## Running it

```bash
npm install
docker compose up -d          # local Postgres, or point DATABASE_URL elsewhere
psql "$DATABASE_URL" -f db/migrations/0001_decision_intelligence.sql
npm run typecheck             # tsc --noEmit — verified clean
npm test                      # vitest — 45/45 passing
npm run dev                   # tsx watch src/server.ts
```

Frontend:

```bash
cd frontend
npm install
npm run typecheck             # verified clean
npm run dev                   # vite dev server, component gallery
npm run build                 # verified: produces a working bundle
```

## Integration checklist

Each row is one `src/server.ts` edit — replace the null adapter with a real
one implementing the same interface from `src/ports.ts`:

| Port | Represents | Currently |
|---|---|---|
| `ScoringPolicyProvider` | Real assessment scoring engine | `nullScoringPolicyProvider` — returns `null`, so EV/risk training is skipped rather than guessed at |
| `ConfidenceProvider` | Feature 34 | not yet consumed directly by a route — wire in where you read confidence into a `DecisionEventInput` |
| `AccuracyProvider` | Feature 51 | `nullAccuracyProvider` — skip analysis reports `INSUFFICIENT_DATA` until wired |
| `DifficultyProvider` | Feature 55 | `nullDifficultyProvider` |
| `FormulaIntelligenceProvider` / `ShortcutStrategyProvider` | Features 56 / 57 | not yet consumed — hook into `OptionEliminationService` / scenario generation |
| `QuestionEliminationVerifier` | Features 54/56/57-backed validity check | `nullEliminationVerifier` — every elimination is `SELF_REPORTED` until wired |
| `AnalyticsPublisher` | Existing analytics pipeline | `consoleAnalyticsPublisher` — logs to stdout |
| `AuthContext` / `requireAuth` | Existing session/JWT verification | `src/middleware/auth.ts` trusts headers directly — replace before deploying anywhere reachable |

## P0 / P1 / P2 status (per the spec's own prioritization)

**P0 (must-have) — implemented:** action taxonomy, uncertainty states,
elimination + evidence levels (OBSERVED/VERIFIED/SELF_REPORTED/INFERRED),
partial-knowledge and estimation as decision inputs, skip analysis,
return-later as a first-class action, time-aware decisions, scoring-policy
awareness with versioned historical reproducibility, negative-marking and
no-penalty support, answer-switch tracking, confidence-band integration,
decision history, post-mock structure, training service, integration ports
for every named upstream feature, privacy-respecting tenant scoping,
assessment-integrity enforcement, automated tests.

**P1 (advanced) — implemented:** expected-value / break-even math,
opportunity-cost estimation, bottleneck detection with sample-size gating,
confidence-misalignment detection, decision-insight generation with an AI
fallback path.

**P2 (future) — deliberately NOT implemented**, per the spec's own framing
("architect for", not "build now"): Bayesian uncertainty modeling,
learned (as opposed to rule-based) personal decision policies, sequential
decision optimization, predictive decision-error detection. The ports/domain
separation means none of these require touching `services/*` when added —
they'd plug in as a smarter `DecisionRule` source or a new domain module
that `GuessingIntelligenceService` composes in.

## Known limitations

- `src/middleware/auth.ts` is a placeholder that trusts request headers —
  it exists so the module is runnable standalone, not for production use.
- Scenario content (`decision_training_scenarios`) has no seed data; the
  AI-drafted-scenario path (`AIGateway.draftTrainingScenario`) still needs a
  human/automated validation step wired to Feature 54 before anything it
  produces is marked `VALIDATED` and becomes servable (§194-195) — that
  validation step itself isn't implemented, only the status field gating it.
- `ConfidenceProvider`, `FormulaIntelligenceProvider`, and
  `ShortcutStrategyProvider` are defined but not yet called from a route —
  there was no real system to observe them integrating with, so wiring them
  in is left as the natural next step once the real Features 34/56/57 are
  reachable.
- No live database was available to test against; the Postgres repository
  layer is verified by type-checking and SQL review, not by an integration
  test against a running Postgres instance. `docker-compose.yml` is provided
  to make that easy to add.
