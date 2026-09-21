# Architecture

How the 75-section master spec maps to this codebase, and — just as important — every place the spec left something open and a real decision had to be made. Nothing below is asserted as "correct"; it's what was implemented, with the reasoning, so it can be deliberately kept or changed once there's real product/data input.

## Spec section → file map

| Spec section(s) | Concept | File |
|---|---|---|
| 6, 34 | Core product loop / closed loop | `src/services/forecastOrchestrator.ts` (`runForecastPipeline`) |
| 10 | Unified current capability | `src/engines/capabilityModel.ts` |
| 11 | Current vs. target, gaps | `src/engines/targetGapEngine.ts` |
| 12–13 | Readiness states, multidimensional readiness | `src/domain/types.ts` (`ReadinessState`), `capabilityModel.ts` (per-dimension labels) |
| 14, 22–26 | Trajectory, momentum, stagnation/regression/breakthrough | `src/engines/trajectoryEngine.ts` |
| 15, 18 | Evidence quality → confidence | `src/engines/evidenceConfidenceEngine.ts` |
| 16–21 | Forecast, target date, time-to-readiness | `src/engines/forecastEngine.ts` |
| 27–29 | Practice-vs-assessment gap, familiarity, failure boundary | `src/engines/practiceAssessmentGapEngine.ts` |
| 30–32 | Risk identification, ranking, highest-impact gap | `src/engines/riskEngine.ts` |
| 33, 39, 50 | Forecast → Adapt hand-off, "Fix My Readiness" | `forecastOrchestrator.ts` (`fixMyReadiness`), `src/integration/feature26AdaptAdapter.ts` |
| 35–37 | Scenarios ("what if") | `src/engines/scenarioEngine.ts` |
| 40–41 | Forecast history, change/transition events | `src/repository/*`, `src/engines/readinessStateMachine.ts` |
| 42 | Confidence vs. self-reported evidence | `src/engines/explanationEngine.ts` (`compareConfidenceToEvidence`) |
| 43, 49 | Readiness roadmap, Why panel | `explanationEngine.ts` (`buildReadinessRoadmap`, `buildWhyPanel`) |
| 44–50 | UI | `frontend/*` |
| 51–53 | Institutional/cohort view | `src/services/cohortForecastService.ts` |
| 56–57 | AI architecture, content guardrails | `src/integration/aiExplanationProvider.ts`, `src/utils/format.ts` (`guardAgainstEmploymentClaims`) |
| 58 | Data model | `src/domain/types.ts` |
| 59 | Event flow | `src/events/eventBus.ts`, listener in `src/api/server.ts` |
| 60 | API | `src/api/routes.ts` |
| 61 | Performance / caching | `isStale()` check in the `GET /forecast` route |
| 62 | Security | `src/api/middleware.ts` |
| 63 | Edge cases | see below |
| 64 | No fake demo data | `src/integration/devFixtures.ts`, `scripts/demo.ts` — fixtures feed real computation, nothing is a pre-written output string |
| 65 | Testing | `tests/*` (57 tests) |
| 66 | Startupthon demo | `scripts/demo.ts` |

## The closed loop, concretely

```
PlatformEvidenceGateway (read)
        │
        ▼
capabilityModel.buildCapabilitySnapshot ──► targetGapEngine.computeGaps
        │                                           │
        ▼                                           ▼
trajectoryEngine.detectTrend (per dim + overall)   evidenceConfidenceEngine.computeConfidence
        │                                           │
        └───────────────┬───────────────────────────┘
                         ▼
              forecastEngine.generateForecast
                         │
                         ▼
                riskEngine.identifyRisks ──► determineMainFactor
                         │
                         ▼
          explanationEngine.buildWhyPanel / buildReadinessRoadmap
                         │
                         ▼
           ForecastRepository.saveForecastSnapshot (history)
                         │
                    (student clicks "Fix My Readiness")
                         ▼
              Feature26AdaptAdapter.requestIntervention
                         │
                (student completes it; real evidence arrives)
                         ▼
              back to PlatformEvidenceGateway — loop closes
```

Every arrow above is a real function call in `forecastOrchestrator.ts`, not a diagram that the code merely gestures at — see `runForecastPipeline` top to bottom.

## Judgment calls the spec left open

The spec is precise about *behavior* (section 24's stagnation example, section 28's failure-boundary example, section 18's confidence example, etc.) but mostly silent on *formulas*. Every threshold below is a named constant in the relevant engine file, chosen to be defensible and internally consistent — not derived from real outcome data, because none exists yet. Treat these as a first calibration, not a spec.

- **STAGNATION vs. STABILITY** (`trajectoryEngine.ts`): the spec's own examples use the identical flat-series shape for both "stagnation" (section 24) and, implicitly, a hypothetical already-at-target case. The distinguishing rule implemented here: a flat trend reads as **STAGNATION** when there's still a meaningful gap to target (> 3 points), and **STABILITY** when there isn't. Same shape, different meaning, decided by context — which matches how the spec talks about them, even though it never states the rule explicitly.

- **Collapsing six dimensions into one "overall readiness" number** (`capabilityModel.computeOverallReadiness`): the spec is explicit that the *internal* model must stay multidimensional (section 11) but its own mockups clearly show one headline percentage (sections 17, 45). The implementation: an equal-weighted average of dimensions with enough evidence to count, computed only for *display*, with an optional `weights` override for when there's real product input on which dimensions matter most for a given exam/target.

- **Forecast uncertainty band** (`forecastEngine.ts`): base ±3 points at HIGH confidence, widened by a per-confidence-level multiplier and a small horizon-length term. This produces sensible, monotonic behavior (lower confidence → wider band; longer horizon → wider band) but the exact numbers are a placeholder for real calibration against actual forecast-vs-outcome data once it exists.

- **AT_RISK vs. IMPROVING** (`forecastEngine.computeStatus`): the spec's own mockup (section 45) labels a case "AT RISK" while the body text says "you're improving" — blurring a distinction its own state list (section 12) implies should exist. This implementation draws the line on the *trend itself*: AT_RISK means the trend is stagnant or declining; IMPROVING means the trend is genuinely positive but the projection doesn't yet clear the target. This is a stricter (arguably more honest) reading than the mockup, called out here rather than silently forced to match it — the demo output reflects real math, including the possibility of landing on ON_TRACK when the seeded student's numbers genuinely support it (they do — see `npm run seed:demo`).

- **Risk ranking weights** (`riskEngine.ts`, `RISK_TYPE_WEIGHT`): all risk types start at weight 1.0; `TRANSFER_GAP`, `ASSESSMENT_PERFORMANCE_GAP`, and `TIME_PRESSURE_WEAKNESS` are weighted slightly higher, because the spec's own narrative (sections 13, 27, 28) repeatedly emphasizes "knowledge is fine, application under pressure is the real problem" as the product's central insight. Tunable, not derived.

- **Failure-boundary classification** (`practiceAssessmentGapEngine.detectFailureBoundary`): classifying by *cumulative* degradation (NORMAL→NOVEL vs. NOVEL→TIMED/SIMULATION) rather than whichever single consecutive step happens to be steepest. This matters concretely: the spec's own worked example (a steady 91→86→77→69→63 slide) is explicitly meant to read as "combined novelty and time pressure" (section 28's own sentence), and a naive steepest-single-step classifier gets that example wrong. Verified with a dedicated test.

- **`RiskFactorType` has no "mastery gap" or "combined failure boundary" bucket** (spec section 30's own enum is closed): a significant mastery/accuracy gap still shows up in the Why panel and roadmap via `targetGapEngine`, but doesn't become a ranked `RiskSignal` unless something more specific (e.g. a misconception signal) supports it. A `COMBINED` failure-boundary result is filed under `DIFFICULTY_INSTABILITY` since that's the closest fit in the given enum — the human-readable `explanation` field still says "combined novelty and time pressure" regardless of which type tag it's filed under, so no information is actually lost, only the internal category is an approximation.

- **Scenario engine's "points per extra session" constant** (`scenarioEngine.ts`, `POINTS_PER_SESSION_PER_WEEK = 0.8`): explicitly a placeholder heuristic. Every `ScenarioResult` carries a `disclaimer` and a confidence level downgraded from the base forecast's, precisely because this number hasn't been validated against anything.

## Edge cases handled (spec section 63)

- No target configured → pipeline still returns capability + trajectory; `forecast`/`risks`/`whyPanel` are `null` rather than fabricated (`forecastOrchestrator.ts`, tested in the integration suite).
- No assessment date → falls back to a configurable default horizon (`DEFAULT_FORECAST_HORIZON_WEEKS`) instead of failing.
- Fewer than 3 observations → confidence is forced to `INSUFFICIENT` regardless of how good other factors look; fewer than 3 trend points → `INSUFFICIENT_DATA`, never a guessed trend.
- AI provider failure, missing key, or a blocked (employment-claim) response → silent fallback to the deterministic explanation; never a broken response.
- Stale forecast snapshots → `isStale()` checked against `FORECAST_CACHE_MAX_AGE_MS` before serving a cached forecast.
- A single student's data failing inside a cohort computation → caught and excluded rather than failing the whole cohort view (`cohortForecastService.ts`).

## Testing

`tests/` has 57 tests across 9 files: focused unit tests per engine (including the tricky boundary cases called out above), and an integration test (`forecastOrchestrator.integration.test.ts`) that runs the full pipeline against the seeded fixtures, including a full "Fix My Readiness → simulated new evidence → readiness measurably moves" round trip.
