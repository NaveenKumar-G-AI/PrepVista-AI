# PART15_INTEGRATION.md

## How to actually plug this into your system

**The one change that matters:** implement `PlacementDataRepository`
(`repository/PlacementDataRepository.ts`) against your real schema, then
construct `bootstrap(yourRepository)` instead of `bootstrap()` (which
defaults to the synthetic demo repository). Nothing in `services/`, `api/`,
or `modules/` needs to change — they only ever depend on the interface type.

```ts
import { bootstrap } from "./index.js";
import { YourRealRepository } from "./your-real-repository.js";

const { services, aiTools, api } = bootstrap(new YourRealRepository(db));
```

## Architecture

```
                 ┌─────────────────────────────┐
  Parts 1-14 DB  │   PlacementDataRepository    │   <- the ONLY seam. Read-only.
  (your schema)  │        (interface)           │      No write methods exist,
                 └──────────────┬───────────────┘      which is what makes
                                 │ implements               ScenarioService's
                 ┌───────────────┴───────────────┐         isolation structural
                 │  DemoPlacementDataRepository   │         rather than a promise.
                 │  (synthetic, swap this out)    │
                 └───────────────┬───────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                         │
 services/forecast/       services/strategy/       services/scenario/
 services/opportunity-intelligence/
        │                        │                         │
        └────────────┬───────────┴─────────────┬──────────┘
                      │                         │
              modules/*/ai-tools.ts      api/forecast/router.ts
              (Part 12 tool surface)     api/strategy/router.ts
                                         (framework-agnostic handlers)
```

Every service constructor takes the repository as its only required
dependency. `index.ts::bootstrap()` is the single place that wires
everything together — read it first when integrating.

## Forecast architecture & model versions

Two independent methods, blended (`services/forecast/ForecastService.ts`):

1. **Baseline** — historical season trajectory. Compares today's placement %
   against the % completed seasons had at the *same fractional point*, and
   applies the historical average uplift from there to season end.
2. **Primary** — pipeline-weighted projection. Every unplaced student sits in
   exactly one engagement-status bucket; each bucket has a historical
   "eventual verified placement by season end" rate; multiply and sum. Same
   methodology as sales weighted-pipeline forecasting (see PART15_RESEARCH.md #1).

The two methods' disagreement (`spread`) plus the backtested historical error
(`backtestMAE`, leave-one-season-out) together determine both the confidence
tier and the range width — never a fixed ± percentage.

`FORECAST_MODEL_VERSION = "forecast-v1.0.0"` is stamped on every forecast
along with `dataThrough` (the asOf cutoff actually used) and `inputWindow`
(what data fed it), so a forecast generated today is reproducible against
what the data looked like on that date, even after the live dataset moves on
— Section 18.

**Department forecasts** blend a shrinkage estimate (department's own % pulled
toward the institution % in proportion to how little data backs it) with a
genuine department-level pipeline projection (department bucket counts ×
institution-level bucket rates — see PART15_RESEARCH.md #2 for why the rate
is borrowed rather than fit per department). Departments below
`MIN_DEPARTMENT_SAMPLE_SIZE` (15) get `dataAvailable: false`, never a number.

**Live accuracy feeds back into confidence.** Pass a `ForecastPerformanceService`
into `ForecastService`'s constructor (bootstrap already does this) and
confidence will downgrade — never upgrade — once enough live forecasts have
been resolved and show real drift. See PART15_HOSTILE_REVIEW.md finding F2.

## Target model

`PlacementTarget` (`types/placement-strategy.types.ts`) matches the spec's
conceptual shape exactly — `metric`, `targetValue`, `targetDate`, `scope`,
`version`, `status`. `TargetService.getActivePlacementTarget` reads the
active one for a season; there's no UI for creating/versioning targets in
this build (that's a TPO-facing form, out of scope for a backend module) —
`repo.getActiveTarget` is the read side; add a write path on your real
target-management screen that writes to the `placement_target` table
(migrations/0001) and this module picks it up automatically.

## Target gap & the funnel-stage explanation

`GapAnalysisService.explainGap()` returns `TargetGapSummary` (target, current,
gap in points, required additional placements) plus a **funnel-stage
breakdown that cannot double-count by construction** — see the doc comment
at the top of `GapAnalysisService.ts` for the exact mutually-exclusive-bucket
reasoning, and PART15_HOSTILE_REVIEW.md for what a "does this double count"
adversarial pass actually checked. `BENCHMARK_EVENTUAL_JOIN_RATE` (exported
from that file) is the one set of numbers in this build you should replace
first — it's an institution-configured "what's realistically achievable"
assumption, currently a demo default, and belongs next to your target
configuration once that exists for real.

## Scenarios

`ScenarioService.runScenario()` / `.compareScenarios()` — pure functions over
a cloned snapshot, isolated by the repository interface having no write
methods (Section 40; proven in `tests/strategy/scenarioIsolation.test.ts`).
Every result is typed `type: "scenario_estimate"` and carries a `caveat`
disclosing its assumptions in plain language, including the coarse
seats-per-drive assumption used for the `additionalDrives` input (flagged as
a known simplification in PART15_HOSTILE_REVIEW.md finding F7 — extend
`ScenarioInput` if role-category-specific drive scenarios become a common ask).

## Opportunity coverage / skill supply-demand / company intelligence

`OpportunityCoverageService`, `SkillSupplyDemandService`,
`CompanyConcentrationService`, `OutreachPriorityService` — all pure
computations over `getStudents`/`getActiveDrives`/`getCompanies`. Nothing
here needs its own persistence; recompute on demand or cache the *result*
(see Performance below), not intermediate state.

`OutreachPriorityService` is TPO-only (`assertTpoAccess`, not the broader
`assertInstitutionalAccess`) and every result carries an explicit disclaimer
that it's a recommendation, not a fact about a company's hiring intent
(Section 33). It infers a candidate company's likely skill/department
relevance from *currently active* companies in the same industry — if your
real company records carry their own historical role-requirement data, prefer
that over the industry-peer inference this build falls back to.

## Strategic recommendations

`RecommendationEngine.getRecommendations()` — ranked
`impact × urgency × feasibility × confidence`, every factor visible in
`explanation`. Feasibility is overridable per-institution
(`new RecommendationEngine(repo, { JOINING_CONVERSION: 0.7 })`) — see
PART15_HOSTILE_REVIEW.md finding F4. Do **not** revert the impact
normalization to a `Math.max(...thisRun)` pattern — see finding F3 and
PART15_RESEARCH_UPGRADE.md for exactly why that's wrong, not just
stylistically different.

## Company outreach → TPO action → Part 14

`RoadmapService.acceptRecommendation()` is the one place this module writes
anything resembling a "decision" — and even then, it only calls
`ActionSystemAdapter.proposeAction()`, which in this build
(`DemoActionSystemAdapter`) just stores a `PENDING_TPO_CONFIRMATION` record
in memory. **Replace `ActionSystemAdapter` with a real adapter that calls
your Part 14 task-creation API** — that's the entire integration surface for
Section 83 ("Part 15 does not bypass Part 14"). Nothing else in this module
ever mutates operational state.

## Events

`events/event-bus.ts` is a Node `EventEmitter` wrapper publishing every event
name from Section 53. It's in-process only. If Parts 1-14 already have a
real event bus (Kafka/SNS/BullMQ/etc.), the cleanest integration is to
subscribe to `strategyEventBus.on("*", ...)` and re-publish onto your real
bus, rather than rewriting every `emitEvent(...)` call site.

## Audit

`audit/audit-log.ts` — in-memory, append-only, same shape as the
`strategy_audit_log` table in migrations/0001. Swap the class for one that
writes to that table; every call site (`auditLog.record(...)`) stays the same.

## Permissions

Three roles only: `TPO`, `MANAGEMENT`, `STUDENT` — see
`rbac/access-control.ts`. There is no fourth role, and specifically no
recruiter role anywhere (`tests/strategy/noRecruiterRole.test.ts` asserts
this directly against the actual exported surface, not just the type). Every
institutional service method and AI tool calls `assertInstitutionalAccess`
or `assertTpoAccess` before touching the repository; the one student-facing
tool (`get_personal_outlook`) calls `assertOwnStudentAccess` and its handler
is hand-checked to return only `PersonalOutlook`'s five whitelisted fields
(`tests/strategy/studentBoundary.test.ts`).

**Your real auth middleware is responsible for constructing `CallerContext`**
(`role`, `userId`, `institutionId`, and `studentId` when role is STUDENT) from
the authenticated session and passing it into every call — this module trusts
whatever `CallerContext` it's given, so populate it from a verified session,
never from client-supplied input.

## AI tool surface (Part 12 integration)

`bootstrap().aiTools` is a flat `ToolDefinition[]` — 17 tools total, listed in
`module.manifest.json`. Each has `name`, `description`, `parameters` (JSON
schema), `requiresRole`, and `handler(args, caller)`. Wire these into
whatever tool-calling mechanism Part 12's AI layer uses (Anthropic tool use,
OpenAI function calling, a custom dispatcher — the shape is intentionally
generic). **Every handler returns the underlying service's output
unmodified** — Part 12 must present `dataAvailable: false` honestly rather
than substitute a guess (Section 49); nothing in this module gives an LLM
room to invent a number that isn't there.

## Part 14 integration

Covered above (Roadmap/ActionSystemAdapter). One additional note: this
module's recommendations are stateless per-call (recomputed from current data
each time `getRecommendations` runs) — if Part 14 needs a stable ID to
reference across a multi-step workflow, persist the recommendation to the
`strategic_recommendation` table (migrations/0001) at the point it's
accepted, not before; recommendations that are shown but never acted on
shouldn't accumulate rows.

## Part 16 validation — what to actually check

Concrete, checkable claims for Part 16 to verify against wherever this module
ends up living:

- [ ] `npm test` passes (27 tests) against your real repository implementation, not just the demo one — the tests are written against the `PlacementDataRepository` interface conceptually, but currently instantiate `DemoPlacementDataRepository` directly; the highest-value Part 16 action is parameterizing them to run against both.
- [ ] A forecast computed with `asOf` = yesterday is provably unaffected by anything recorded today (leakage) — see `tests/forecast/leakage.test.ts` for the pattern to replicate against real data.
- [ ] No STUDENT-role session can retrieve any field outside `PersonalOutlook`'s five keys, through any route — not just the ones this build's tests already cover.
- [ ] No route, tool, or role in the deployed system references "recruiter."
- [ ] Running the same scenario twice with identical inputs and an unchanged `asOf` produces identical output (pure-function determinism) — and running any scenario does not change what a subsequent forecast call returns.
- [ ] `module.manifest.json`'s `database_tables` list matches what actually got migrated.

## Known limitations carried into this handoff (see PART15_HOSTILE_REVIEW.md for the full list with severities)

- Repository is synthetic/in-memory — this is the whole integration task.
- No real UI — this delivery is the data/service/API layer only, matching
  "build what you want, I can integrate" rather than guessing at your
  existing frontend stack.
- No production caching layer (Section 58) — deferred deliberately rather
  than built against fake data (finding F10).
- `additionalDrives` scenario input doesn't yet distinguish role category
  (finding F7).
