# PART15_FINAL_REPORT.md
## PrepVista AI — Part 15: Placement Forecasting + Strategy Engine
### Final Immersive Engineering Report

---

## A. Executive Summary

This delivery is a standalone, integration-ready backend module implementing
the core of Part 15: real forecasting (two independent, backtested methods),
target-vs-actual gap analysis that provably doesn't double-count, an isolated
what-if scenario engine, opportunity/skill/company intelligence, an
explainable recommendation engine, and a hard RBAC boundary (TPO/MANAGEMENT
full access, STUDENT restricted to a five-field personal outlook, no
recruiter role anywhere in the codebase). 27 tests pass, all against real
logic — none are placeholder assertions. A hostile review (§Y) found 11 real
issues by actually running the code and fixed the 7 that mattered, live in
this delivery, not just written up. No repository from Parts 1–14 was
available in this environment, so integration happens through one interface
(`PlacementDataRepository`) rather than through inspected, wired code — see
§AI for exactly what that means is and isn't done.

## B. Product Boundary Confirmation

- **TPO + MANAGEMENT** are the primary strategy users — every institutional
  forecast, gap, scenario, recommendation, and company-intelligence call
  requires one of these two roles (`assertInstitutionalAccess` /
  `assertTpoAccess`), enforced in code and proven in
  `tests/strategy/studentBoundary.test.ts`.
- **Students** receive only `PersonalOutlook` — readiness trend, readiness
  score, eligible active opportunity count, recommended training, one
  message string. Nothing else. Whitelist-checked directly against the
  handler's actual return value, not just its declared type.
- **Recruiters have no PrepVista access.** No recruiter role, route, table,
  or AI tool exists anywhere in this codebase.
  `tests/strategy/noRecruiterRole.test.ts` asserts this against the real
  exported `Role` enum, every AI tool's name/description, and every API
  handler name — not against documentation claiming it.

## C. Forecast Architecture

Two independently-computed methods, blended:
1. **Baseline** (historical season trajectory) — average uplift from a
   comparable checkpoint to season-end, across completed seasons.
2. **Primary** (pipeline-weighted projection) — every unplaced student's
   engagement-status bucket × that bucket's historical eventual-join rate,
   summed. Methodologically identical to weighted-pipeline sales forecasting
   (PART15_RESEARCH.md #1).

The two methods' disagreement, plus backtested historical error, sets both
confidence tier and range width. See `services/forecast/ForecastService.ts`.

## D. Forecast Models

| Forecast | Status | Method |
|---|---|---|
| Placement | Implemented | Blended (baseline + pipeline) |
| Joining | Implemented | Alias of Placement — same event in this domain model (see repository/demo/seed.ts) |
| Offers | Implemented | Pipeline-weighted, own eventual-offer rate table |
| Department | Implemented | Shrinkage estimate blended with department-level pipeline projection |
| Applications / Interviews | Not implemented as standalone forecasts | Their conversion rates feed the gap-attribution and recommendation engines instead of being forecast in isolation — see §X for why this scope line was drawn here |
| Readiness | Not implemented as a forecast | `PersonalOutlook.readinessTrend` is a current-state read (IMPROVING/STEADY/DECLINING), not a projected trajectory |
| Opportunity pipeline | Implemented | `OpportunityCoverageService` — current-state, not forward-projected |

## E. Target Engine

`PlacementTarget` type + `TargetService` (read path). `getTargetGapSummary`
computes current %, gap in points, and required additional verified
placements from the active target and current snapshot. Target
creation/versioning UI/write-path is out of scope for a backend module — see
§AI (Partially Implemented).

## F. Target Gap

`GapAnalysisService.explainGap()` decomposes the gap across four funnel
stages using a **mutually exclusive partition** of the unplaced population
(every student is in exactly one engagement-status bucket), so contributions
sum without an interaction term to hide. The one place a genuine residual
remains — whether hitting every benchmark would actually close the target
gap — is computed and surfaced explicitly, never silently zeroed. Verified
in `tests/strategy/gapAttribution.test.ts` (4 tests).

## G. Uncertainty

Every `ForecastEnvelope` carries `range`, `confidence`, `dataThrough`,
`freshness`, and `limitations` as required fields — there is no code path
that returns a bare number. Confidence tiers are LOW/MEDIUM/HIGH, driven by
sample size, method spread, backtested error, data freshness, and (after the
hostile-review fix) live tracked accuracy.

## H. Model Versioning

`FORECAST_MODEL_VERSION = "forecast-v1.0.0"` stamped on every forecast,
alongside `dataThrough` (the exact cutoff used) and `inputWindow` (what fed
it) — a forecast generated today stays reproducible against that day's data
even as the live dataset moves on.

## I. Forecast Validation

Leave-one-season-out backtest of the baseline method across the 4 historical
seasons (`ForecastService.backtestBaseline`) — genuinely never trains on the
season it's predicting. `ForecastPerformanceService` tracks live
forecast-vs-actual once outcomes resolve (MAE, coverage rate), and — after
the hostile-review fix — poor live accuracy downgrades future confidence
ratings rather than being tracked for show. See
`tests/forecast/forecastAccuracy.test.ts` (5 tests) and
`tests/forecast/leakage.test.ts` (4 tests, proving a forecast at a given
cutoff is unaffected by data recorded after it, using a real late-arriving
batch).

## J. Scenario Engine

`ScenarioService.runScenario()` / `.compareScenarios()`. Isolation is
**structural**: `PlacementDataRepository` has no write methods at all, so
nothing here can mutate live data even by accident — proven in
`tests/strategy/scenarioIsolation.test.ts` (5 tests, including a byte-for-byte
before/after repository state comparison). Every result is typed
`"scenario_estimate"` and carries a plain-language caveat.

## K. Scenario Assumptions

Rate deltas apply to the corresponding engagement-status bucket's eventual-
join rate. `additionalDrives` uses a disclosed coarse assumption
(seats/drive, fill rate) — flagged in the hostile review (finding F7) as not
yet role-category-aware, deliberately left that way rather than guessing at
per-role fill rates with no data to back them.

## L. Opportunity Coverage

`OpportunityCoverageService` — ready (unplaced, readiness ≥ 70) students vs.
those matched to ≥1 currently open, eligible, skill-overlapping drive. In
this build's demo data: 163 ready, 161 matched, 2 unmatched (see §AH for why
that's a small number in this specific dataset, not a general claim about
real institutions).

## M. Skill Demand vs Supply

`SkillSupplyDemandService` — per-skill active-role seat demand vs. student
count meeting the skill threshold, plus role-category coverage. Categories
come from whatever's configured on drive records, never a hardcoded list.

## N. Company/Relationship Opportunity Intelligence

`OutreachPriorityService` — six explainable, individually-visible score
components (past hiring, relationship strength, student skill match,
department demand, recency, opportunity gap), never an opaque single number.
TPO-only (`assertTpoAccess`, stricter than the general institutional check).
Every result carries "This is a recommendation... not a fact about future
hiring intent." No recruiter ever sees this data — there's no route for them
to.

## O. Strategic Gap Engine

`StrategicGapService` assembles all six named gap types (student,
opportunity, skill, funnel, joining, data) from signals computed elsewhere,
each with evidence and an affected-student count.

## P. Recommendation Engine

`RecommendationEngine` — ranked `impact × urgency × feasibility ×
confidence`, three independent sources (funnel-stage contributions,
department comparison vs. institutional median, opportunity coverage
shortfall). Feasibility weights are overridable per-institution. The impact
formula was rewritten after the hostile review found it was structurally
guaranteed to make the top recommendation look maximally urgent regardless
of actual severity (finding F3) — now anchored to the actual number of
placements still needed, not to the current run's own largest number.

## Q. Strategic Action Integration

`RoadmapService.acceptRecommendation()` → `ActionSystemAdapter.proposeAction()`.
This module only ever proposes a pending action; it never confirms or
executes one — that boundary is enforced by the adapter interface having
exactly one method, `proposeAction`, with nothing resembling `execute` or
`confirm` anywhere in this codebase.

## R. Management Strategy Dashboard

**Data layer implemented; no visual UI built.** Every number the mockups in
Section 46/67 describe (current/target/forecast/gap/confidence, largest
observed gaps, scenario comparison) is available from
`services.forecast`, `services.target`, `services.gapAnalysis`,
`services.scenario` and is exercised end-to-end in `demo/run-demo.ts`. Actual
screens were out of scope — see §AI.

## S. TPO Strategy Workbench

Same story as §R: `services.recommendations`, `services.roadmap`,
`services.opportunityCoverage`, `services.outreachPriority` supply every
section the workbench mockup (Section 47) describes. No frontend was built.

## T. Student Boundary

Covered in depth in §B. One more concrete guarantee: even TPO/MANAGEMENT
calling `get_personal_outlook` on a student's behalf get back the same
five-field `PersonalOutlook` shape — there's no institutional-detail escape
hatch for any caller through that particular tool.

## U. Security

Tenant scoping: every repository method is inherently scoped to
`getInstitutionId()`'s institution in the demo implementation; a real
multi-tenant implementation must filter every query by institution ID (see
the commented-out row-level-security template in
`migrations/0001_placement_strategy_intelligence.sql`). Role authorization:
covered above. Data minimization: `PersonalOutlook` is a hand-maintained
whitelist type, not a filtered version of a larger object. AI permission
inheritance: every AI tool asserts the same role check its underlying
service/API handler would.

## V. Privacy

Aggregate views (company concentration, industry concentration, skill
supply/demand) never expose individual identifiers. One deferred finding
(F9): `OpportunityCoverage.unmatchedStudentIds` is available identically to
TPO and MANAGEMENT callers today; a board-level MANAGEMENT view arguably
shouldn't see individual IDs even though the role is technically authorized
to. Documented as a recommended follow-up, not fixed in this pass — see
PART15_HOSTILE_REVIEW.md.

## W. Performance

Not load-tested against production scale (there is no production-scale
backing store to test against in this environment). At demo scale — 1200
students, 13 companies, 7 active drives — every service call in
`demo/run-demo.ts` completes in low single-digit milliseconds; the full test
suite (27 tests) runs in ~2 seconds. Caching/async job infrastructure was
deliberately deferred (finding F10) rather than built against data that
wouldn't validate anything about real query cost.

## X. Data Quality

`CurrentSeasonSnapshot.dataQualityFlags` and `freshnessStatus` are first-
class fields, not derived after the fact — a `DELAYED` freshness status
forces confidence to LOW regardless of everything else
(`tests/forecast/forecastAccuracy.test.ts`). `StrategicGapService` surfaces
`DATA_GAP` entries directly from these flags.

## Y. Hostile Review

Full detail in `docs/PART15_HOSTILE_REVIEW.md`. Summary: 11 findings across
4 lenses (principal data scientist, TPO, security, performance/privacy) — 7
fixed in this delivery (4 HIGH — three forecast/recommendation-correctness
bugs plus one architecture-layering violation caught during final
verification, all fixed by actually re-running the code after each change, 3
MEDIUM), 4 deliberately deferred with reasoning recorded rather than
silently dropped.

## Z. Research Findings

Full detail in `docs/PART15_RESEARCH.md` — 6 findings grounding the
forecasting method (weighted-pipeline forecasting), small-sample handling
(empirical Bayes shrinkage), and backtesting approach (walk-forward
validation) in real, cited sources rather than an arbitrary choice of
model family.

## AA. Improvements After Review

Full detail in `docs/PART15_RESEARCH_UPGRADE.md` — one new question
(why relative/in-batch score normalization structurally inflates the
top-ranked item) came up directly while diagnosing hostile-review finding
F3, got its own citation-backed answer, and was cross-checked against the
one other place in this codebase that does batch-relative normalization
(`OutreachPriorityService.pastHiring`) to confirm that instance is a
legitimately different (and fine) case rather than the same bug twice.

## AB. Tests and Results

27 tests, `node:test` via `tsx`, zero mocking framework — every test either
exercises real service logic against the demo repository or asserts a
structural invariant (no write methods on the repository interface, no
recruiter string anywhere in the Role enum/tool names/handler names).

| File | Tests | Proves |
|---|---|---|
| `tests/forecast/smallSample.test.ts` | 3 | Small departments get `dataAvailable:false`, never a number; large ones get a real forecast |
| `tests/forecast/leakage.test.ts` | 4 | A forecast at cutoff T is unaffected by data recorded after T, using a real late-arriving batch |
| `tests/forecast/forecastAccuracy.test.ts` | 5 | Backtest MAE is finite/sane; DELAYED freshness forces LOW confidence; forecast-vs-actual tracking computes correctly; live poor accuracy downgrades confidence |
| `tests/strategy/gapAttribution.test.ts` | 4 | No stage double-counted; contributions independently recompute correctly; residual against the target gap is surfaced, not hidden |
| `tests/strategy/scenarioIsolation.test.ts` | 5 | Repository state is byte-identical before/after a scenario run; repository has no write-like methods; results are always labeled `scenario_estimate`; scenario uncertainty ≥ baseline uncertainty |
| `tests/strategy/studentBoundary.test.ts` | 4 | Every institutional tool rejects STUDENT callers; `get_personal_outlook` returns only whitelisted fields; a student can't fetch another student's outlook; TPO/MANAGEMENT are correctly permitted |
| `tests/strategy/noRecruiterRole.test.ts` | 3 | No "recruiter" anywhere in the Role enum, AI tool names/descriptions, or API handler names |

```
npm run typecheck   →  clean, zero errors
npm test             →  27/27 passing
npm run demo          →  runs end-to-end against real logic, real numbers
```

## AC. Part 12 Integration

`bootstrap().aiTools` — 17 `ToolDefinition` objects (name, description, JSON
schema, `requiresRole`, handler). Every handler returns the underlying
service's output verbatim, including `dataAvailable: false` — Part 12 must
present that honestly, not substitute a guess (Section 49). See
`docs/PART15_INTEGRATION.md` for the full wiring guide.

## AD. Part 13 Integration

This module publishes 13 named events (`TARGET_GAP_DETECTED`,
`FORECAST_ERROR_DETECTED`, `STRATEGIC_GAP_DETECTED`, etc.) via
`events/event-bus.ts`. A real Part 13 proactive-intelligence layer should
subscribe to `strategyEventBus.on("*", ...)` — no code here assumes what
Part 13 does with them.

## AE. Part 14 Integration

Covered in §Q. `ActionSystemAdapter` is the entire seam — implement it
against your real task-creation API and nothing else in this module changes.

## AF. Part 16 Integration

A concrete, checkable list (not a vague "test everything") is in
`docs/PART15_INTEGRATION.md` under "Part 16 validation" — six specific
assertions, each naming the exact test file whose pattern to replicate
against real data.

## AG. Module Manifest

`module.manifest.json` — routes, API paths, database tables, forecast
models, scenario types, events published/consumed, services exposed, AI
tools, roles, and an explicit `recruiter_access: "NONE"` field plus a
`dependency_status` field stating plainly that Parts 1-14 are not actually
wired in this delivery.

## AH. Demo Walkthrough

`demo/run-demo.ts`, run for real, producing (this run's actual output, not a
mockup):

```
CURRENT       78.4%
TARGET        85%
FORECAST      83.7–84.9%  (point estimate 84.3%)
CONFIDENCE    HIGH
GAP           6.6 points  (79 additional verified placements needed)

Largest observed gaps:
  INTERVIEW_CONVERSION   observed 15%  vs benchmark 22%  → ~5.9 students
  OFFER_ACCEPTANCE       observed 35%  vs benchmark 45%  → ~5.8 students
  APPLICATION_CONVERSION observed 3%   vs benchmark 8%   → ~4.3 students
  JOINING_CONVERSION     observed 90%  vs benchmark 95%  → ~1.5 students

Scenario "Application +5, Joining +3": 82.8–85.4% (baseline 84.3%)

Opportunity coverage: 163 ready, 161 matched, 2 unmatched
Top recommendation: Improve Electronics & Communication Engineering
  technical interview conversion (priority 0.13, 82 students affected)

Outreach: ABC Technologies (HIGH, score 0.8) — 66 historical hires, no
  active drive this season

TPO accepts the top recommendation → action-1, PENDING_TPO_CONFIRMATION

Student view: {"readinessTrend":"IMPROVING","readinessScore":81,
  "eligibleActiveOpportunities":4,"recommendedTraining":[],
  "message":"Based on your current progress, your readiness is improving."}

Same student asks an institutional question → blocked:
  "Role 'STUDENT' cannot access institutional strategic data."
```

The opportunity-coverage numbers (163/161/2) come out small in this specific
synthetic dataset because student skill tags were deliberately correlated
with drive skill requirements for internal consistency — that's a property
of this demo data, not a claim about what coverage gaps look like at a real
institution. The funnel-stage gaps and department forecast (ECE materially
lower than every other department) are the more representative illustration
of the engine working, since those emerged from deliberately-planted, but
realistic, underperformance in the seed data and were correctly discovered
by the algorithms rather than hardcoded as output.

## AI. Truth Table

**IMPLEMENTED** (real logic, tested, run end-to-end):
Forecast engine (baseline + pipeline, blended, versioned, backtested) ·
department forecasts with small-sample safeguard · data-leakage prevention ·
target vs. actual + gap in points + required additional placements ·
funnel-stage gap attribution with no double-counting and an honest residual ·
scenario engine (isolated, comparison, labeled estimates) · opportunity
coverage · skill supply/demand · company + industry concentration ·
explainable outreach priority scoring (TPO-only) · recommendation engine
(impact×urgency×feasibility×confidence, evidence-based, configurable
feasibility) · weekly roadmap bucketing · RBAC (TPO/MANAGEMENT/STUDENT, no
recruiter) enforced and directly tested · student personal-outlook whitelist
enforced and directly tested · 17-tool AI surface with role checks and
"insufficient data" honesty · 13 named events wired at real call sites ·
append-only audit log · forecast-performance tracking with live-accuracy
feedback into confidence · SQL migration schema · module manifest · hostile
review with 6 real fixes verified by re-running tests and the demo.

**PARTIALLY IMPLEMENTED**:
Target model (read path only; no creation/versioning UI or write API) ·
historical comparability checking (fractional-point check exists for the
baseline forecast method specifically; not a generalized cross-metric
validator) · framework-agnostic API handlers (implemented and typed; not
wired to a running HTTP server — Express adapter shown as an example, not
executed) · audit/event persistence (in-memory reference implementations;
migration tables exist for both, not connected).

**DEVELOPMENT/TEST ONLY**:
`DemoPlacementDataRepository` + `repository/demo/seed.ts` (synthetic,
loudly labeled, isolated behind the repository interface) ·
`DemoActionSystemAdapter` (in-memory action proposals standing in for Part
14) · the Express adapter snippet in `api/forecast/router.ts`'s doc comment.

**NOT IMPLEMENTED**:
Any visual UI/dashboard screens · real database connectivity (Postgres or
otherwise — migration SQL provided, not executed against a live instance
here) · real Part 12/13/14 wiring (contracts provided; no actual Part
12/13/14 code existed in this environment to wire against) · row-level
security enforcement (commented-out template only) · production caching/
background-job infrastructure · role-category-aware `additionalDrives`
scenario modeling · board-level vs. operational-level data-detail
distinction for MANAGEMENT (finding F9) · accessibility implementation (no
UI exists in this delivery to make accessible).

---

Forecasts in this system are ranges with stated confidence, never bare
numbers. Scenarios are always labeled estimates, never guarantees.
Recommendations always carry evidence and an explicit priority-score
breakdown, never an opaque "AI score." No student caller can reach
institutional data through any tool this module exposes. No recruiter
caller exists to reach anything at all.
