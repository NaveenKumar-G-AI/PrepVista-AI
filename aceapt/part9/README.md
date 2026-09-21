# ACEAPT Feature 9 — Real-World Performance Simulation Engine

A working, tested implementation of the Feature 9 spec: a mixed-topic,
hidden-label, server-timed aptitude simulation with a full decision-quality
/ time-management / recovery / endurance / failure-cascade analytics
layer, and structured integration seams for Features 3–8.

**Read this first:** no existing ACEAPT repository was shared in the
conversation this was built from — only the Feature 9 spec document. So
this isn't a patch against your real codebase; it's a standalone,
independently-runnable module built to the spec's naming and architecture,
with every "reuse existing X" seam implemented as a typed interface + an
in-memory mock, so wiring in the real thing later is contained to one file
per seam. See **[backend/INTEGRATION.md](backend/INTEGRATION.md)** for the
exact swap points.

Everything below has actually been run in this environment: `npm install`,
`tsc --noEmit`, the full test suite, a live server smoke test over HTTP,
and a production frontend build all pass — see [Verification](#verification).

## Quickstart

```bash
# Terminal 1 — backend (http://localhost:4000)
cd backend
cp .env.example .env   # JWT_SECRET etc. are intentionally blank; a dev
                        # fallback secret is used locally if you skip this
npm install
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The app logs in as a demo student via a
dev-only token route (`POST /api/dev/token`, disabled when
`NODE_ENV=production`), lists the three blueprints, and lets you run a
full timed simulation end to end.

Backend only, via curl:

```bash
curl -X POST http://localhost:4000/api/dev/token -d '{"studentId":"s1"}' -H 'Content-Type: application/json'
curl -X POST http://localhost:4000/api/simulations/start -d '{"blueprintId":"quick-simulation-v1"}' \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <token>'
```

## What's implemented

Mapped against the spec's own MVP list (section 54):

| Spec MVP item | Status | Where |
|---|---|---|
| Mixed-topic simulation | ✅ | `services/questionSelectionService.ts` |
| Hidden topic labels | ✅ | `hideTopicLabels` on blueprint, enforced in `toPublicQuestion` |
| Real server-authoritative timer | ✅ | `services/timerService.ts` |
| Skip / Return | ✅ | `SimulationEngine.skip/returnTo` |
| Question event tracking | ✅ | `POST /events`, `SimulationEngine.logEvent` |
| Difficulty distribution (controlled, not random) | ✅ | `blueprint.difficultySequence` |
| Simulation scoring incl. negative marking | ✅ | `services/simulationScoringService.ts` |
| Decision quality analysis | ✅ | `services/decisionTrackingService.ts` |
| Performance breakdown (7 dimensions) | ✅ | `services/simulationReportService.ts` |
| Feature 6/7/8 integration | ✅ (seams + mocks) | `src/integrations/*`, `INTEGRATION.md` |
| Simulation history | ✅ | `services/simulationHistoryService.ts` |

"Wow" features (spec section 54): performance curve, recovery detection,
endurance detection, time-management analysis, failure-cascade detection,
and before/after simulation comparison are **all implemented** —
`performanceCurveAnalyzer.ts`, `recoveryAnalyzer.ts`, `enduranceAnalyzer.ts`,
`timeManagementAnalyzer.ts`, `failureCascadeDetector.ts`,
`simulationHistoryService.ts`.

Explicitly **not** built (spec section 54 "Future", or out of scope for a
standalone module): the AI-assisted question-generation pipeline (section
44 — a static 30-question seed bank stands in for it), institution-defined
`CUSTOM_SIMULATION` templates, and any recruiter/placement functionality
(correctly — the spec forbids it in section 59, and none exists here).

## Architecture

```
backend/src/
  domain/          Simulation, Blueprint, AnswerRecord, DimensionScores, errors
  config/          Blueprint definitions (QUICK/STANDARD/FULL) + pressure modifiers
  data/            30-question seed bank (10 skills × 3 difficulties) — replace, see INTEGRATION.md
  integrations/    Feature3Client..Feature8Client interfaces + mocks (the reuse seams)
  repositories/    SimulationRepository interface + in-memory implementation
  services/        TimerService, QuestionSelectionService, DecisionTrackingService,
                    TimeManagementAnalyzer, ConsistencyAnalyzer, RecoveryAnalyzer,
                    EnduranceAnalyzer, PerformanceCurveAnalyzer, FailureCascadeDetector,
                    ErrorPatternAnalyzer, SimulationScoringService, SimulationReportService,
                    SimulationHistoryService, ReadinessIntegrationService,
                    NextActionSignalService, SimulationEngine (orchestrator)
  analytics/       Topic-switch effect + answer-change effectiveness (sample-size gated)
  api/             Express routes matching spec section 49, auth, error handling
frontend/src/
  api/client.ts    Fetch wrapper for the API above
  components/      SimulationStart, SimulationRunner (timer/palette/question),
                    SimulationReport (dimensions/insights/next action)
```

Names deliberately mirror spec section 48's service list so the mapping
back to the spec is direct.

## Design notes / known simplifications

Being upfront about where this diverges from a full production build,
matching the spec's own "no fake intelligence" standard (section 58) —
nothing below is hidden, everything is a heuristic with a stated rule:

- **Overall score is a transparent, tunable weighted composite**
  (`SimulationScoringService.overallScore`), not a validated psychometric
  model. Weights are named constants, easy to replace with a reviewed
  formula.
- **Decision-quality's SKIPPED_GOOD_DECISION / SKIPPED_MISSED_OPPORTUNITY**
  categories apply to questions with *no final answer* at completion time.
  A question that's skipped, returned to, and then actually answered is
  scored in the CORRECT/WRONG buckets instead — it has a final answer, so
  it's judged on that answer's correctness and efficiency. The skip/return
  journey is still fully visible in the event log and in `previousOptionIds`.
- **Per-question time tracking** measures wall-clock time from first-open
  to final-answer, including any time spent away from the question during
  a skip → return gap. A production build would track open/close segments
  and sum only active time.
- **Error-pattern classification** (`ErrorPatternAnalyzer`) is a timing-based
  heuristic with an explicit `insufficient_evidence` fallback — it does not
  claim to always know *why* an answer was wrong, per spec section 26.
- **Question bank** is 30 original, hand-written questions (not from any
  external source) — enough to demo every blueprint, not a real bank.

## Testing

```bash
cd backend && npm test
```

29 tests across 8 files, all passing: `TimerService` (server-authoritative
clock, never trusts client time), `SimulationScoringService` (negative
marking math, score bounds), `DecisionTrackingService` (all 6 outcome
categories), `RecoveryAnalyzer` (the spec's own 3-wrong-then-4-of-5 worked
example), `EnduranceAnalyzer` (the spec's 89%→83%→64% worked example),
`FailureCascadeDetector` (positive and negative cases), `auth` middleware,
and a full `SimulationEngine` end-to-end run (start → mixed hidden-label
questions → skip → return → complete → idempotent re-completion → history).

## Verification

Run in this environment before delivery:

- `npm install` — backend (180 packages) and frontend (134 packages), both clean
- `npx tsc --noEmit` — backend and frontend, both zero errors
- `npx vitest run` — 8 files, 29/29 tests passing
- Live server smoke test over real HTTP: health check, dev token issuance,
  blueprint listing, starting a simulation (confirmed topic labels are
  `null`/hidden), unauthenticated request → `401`, cross-student ownership
  → `403`
- `npm run build` (frontend) — `tsc --noEmit && vite build`, clean production
  bundle

## Keys / secrets

Left blank as requested, in `backend/.env.example`: `JWT_SECRET`,
`AI_API_KEY` (unused — nothing in this codebase calls an AI provider),
`DATABASE_URL` (unused until you swap in a real repository — see
INTEGRATION.md). A dev fallback JWT secret is used automatically if you
run without setting one, so the app works locally out of the box; set a
real secret before deploying.
