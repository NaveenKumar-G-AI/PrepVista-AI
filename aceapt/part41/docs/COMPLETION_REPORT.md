# Feature 41 Next-Gen — Completion Report

Following the report structure the spec itself requests in section 102.

**Read this first:** no existing ACEAPT repository was provided in this
conversation — only the spec document. Sections 95-96 of the spec assume an
"inspect the existing repository" step that wasn't possible here. Rather
than fabricate a fictional existing codebase to "integrate" with, this was
built as a self-contained, integration-ready module: real, tested,
independently-runnable code with clearly marked seams (interfaces, a
migration for new tables only, a devAuth placeholder) for wiring into the
real ACEAPT app. That tradeoff shapes almost every answer below.

## 1. Existing architecture discovered
None — no repository was available in this environment. See above.

## 2. Architecture changes
N/A (nothing existing to change). New, additive module only.

## 3. New models
`CareerStrategy`, `StrategyVersion`, `StrategySignal`, `Bottleneck`,
`StrategyAction`, `CareerExperiment`, `ExperimentOutcome`, `Recommendation`,
`RecommendationFeedback`, `StrategyReview` — matches spec #59's suggested
list exactly. Defined in `backend/src/types/strategy.ts`, persisted per
`backend/db/migrations/001_feature41_schema.sql`.

## 4. Modified models
None. `backend/src/types/domain.ts` defines placeholder shapes for
Student/Goal/Skill/Evidence/Opportunity/Application/Decision/Outcome/
Constraint so the module type-checks in isolation — these are not real
modifications, they're stand-ins to be deleted in favor of your actual
types at integration time.

## 5. API endpoints
All under `/api/feature41`, defined in `backend/src/routes/`:
- `GET /command-center/:studentId`
- `GET /strategy/:studentId/versions`
- `POST /strategy/:studentId/confirm-change`
- `GET /timeline/:studentId`
- `POST /review/:studentId/generate`, `GET /review/:studentId/latest`
- `POST /decisions/:studentId`
- `PATCH /actions/:actionId/status`
- `POST /experiments/:studentId`, `POST /experiments/:id/start`,
  `POST /experiments/:id/conclude`, `GET /experiments/:studentId`
- `POST /recommendations/:id/feedback`

## 6. Frontend components
`CareerCommandCenter`, `NextBestMoveCard` (+ inline `WhyThisPanel` /
`NotNowPicker`), `BottleneckCard`, `StrategyHealthCard`, `MomentumCard`,
`StrategyTimeline`, `ConstraintBanner`, `EmptyState`/`LowDataState`,
`StrategyChangeConfirmationModal` — all in `frontend/src/components/`,
all type-check against React 18 (`npm run typecheck`, verified clean).

## 7. AI pipeline
Implemented per spec #52 exactly: context builder → signal engine →
constraint check → bottleneck/next-best-move engines (deterministic) →
narrative generator (LLM, bounded to explanation-only, with a schema
contract, a safety-check net for banned guarantee language, and a
deterministic-template fallback). See `docs/ARCHITECTURE.md` for the
diagram and rationale. **Not exercised against a live Anthropic API key**
in this build (none was available) — the deterministic-fallback path was,
extensively (see section 18).

## 8-14. Feature 34-40 integration
Interface-only (`ContextSourceRepository` in
`backend/src/repositories/types.ts`), for the reason stated at the top of
this report: none of Features 34-40 existed in this environment to
integrate against. The interface is deliberately shaped to match what the
spec says each feature owns (goals from 34, evidence from 37, opportunities
from 39, etc.) so that implementing it against your real features should be
a matter of writing adapters, not redesigning the contract.

## 15. Feature 41 integration
This report describes Feature 41 itself — see sections 1-14 and 16-22.

## 16. Database migrations
One migration, `backend/db/migrations/001_feature41_schema.sql`, creating
only the ten new tables from section 3. Column types were cross-checked
against `pgRepository.ts` (see section 20) but **the migration has not been
run against a live Postgres instance** — none was available in this
environment. The commented `student(id)`/`goal(id)` foreign key lines need
your real table names before you enable them.

## 17. Environment changes
`.env.example` at the project root — every value blank, as requested.
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET` all default to "off"
behavior (in-memory store, deterministic-only recommendations, dev-only
auth) rather than throwing when unset.

## 18. Tests
`backend/tests/*.test.ts` — 20 tests across the bottleneck engine,
next-best-move engine, constraint/drift detectors, and strategy health
engine. **All 20 pass** (`npm test`, verified in this build). One test
initially caught a wrong assumption in the test itself, not the engine —
documented inline in `nextBestMoveEngine.test.ts` since it's a good example
of spec #38's "plan doesn't fit constraints" behavior working as intended.

Additionally, `backend/src/seed/qaScenario.ts` implements the spec's own
"FINAL QA SCENARIO" (section 99) verbatim — Backend Engineer target, two
projects, one internship opportunity, 10h/week constraint, a decision about
cloud-learning vs. internship prep — and runs it end-to-end against the
real pipeline (`npm run seed:qa`, verified in this build). Sample of what
it actually computed (not fabricated — this is real output from that run):

- Primary bottleneck: `insufficient_technical_evidence` — "Evidence doesn't
  yet cover: databases, cloud, testing," severity `high`, with
  `insufficient_application_volume` correctly retained as a runner-up
  rather than discarded.
- Next best move: apply to the highest-relevance open opportunity (85%
  match) — scored above building a new project once effort was weighed
  against the 10h/week constraint, with "build a project" surfaced as the
  top alternative.
- Strategy health: `direction: good`, `readiness: fair`, `evidence: fair`,
  `opportunity: poor`, `execution`/`adaptation: unknown` (nothing planned
  yet) → overall `needs_attention`, explained rather than blended into one
  score.
- The decision ("focus on internship prep, layering in cloud basics")
  correctly triggered **no** contradiction and **no** strategy-change
  prompt, since it didn't change the target role or conflict with a
  high-weighted priority.
- The full action-accept → experiment-start → experiment-conclude
  (`inconclusive`, correctly not overstated to `invalidated`) lifecycle ran
  without errors.

## 19. Security validation
Implemented: `devAuth` + `enforceStudentIsolation` (spec #73's
student-level isolation, returns 403 on scope mismatch), a per-key rate
limiter, zod request validation on every write route, a structured error
handler that hides internals in production. **Not implemented / explicitly
a placeholder**: real session/JWT verification (spec #73's "authentication")
— `devAuth` reads a plain header and is documented as dev-only in three
places (its own docstring, `backend/README.md`, `.env.example`) so it can't
be missed. Prompt-injection defense (spec #74) is structural: external
content never reaches the LLM at all in this build, since the narrative
prompt only receives the already-computed, already-typed engine output
(see `buildUserPrompt` in `src/ai/pipeline.ts`), not raw external text.

## 20. Performance validation
Indexes on every foreign-key + status column used by the actual query
patterns (see the migration). No load testing was performed (no deployed
instance to test against). The command-center endpoint does one pass over
one student's context per request — there's no obvious quadratic cost, but
this hasn't been measured under real concurrency.

## 21. Known limitations
- Value-tier thresholds and effort-hour estimates (`nextBestMoveEngine.ts`,
  `guardEngines.ts`) are reasoned first-pass constants, consistent with
  spec #7's "don't expose fake precision" — but not calibrated against real
  usage. In the QA run, both the top move and its alternative landed in the
  `low` tier band, which suggests the `high` threshold may want loosening
  once real score distributions are visible.
- `PgStrategyStore` type-checks and its SQL matches the migration, but
  wasn't run against a live database.
- The LLM narrative path wasn't exercised against a live API key.
- `CareerCommandCenter.tsx`'s `handleStart`/`handleNotNow` have a marked
  integration gap: creating a `StrategyAction` from an accepted
  `NextBestMove` needs an action-creation route that wasn't in the P0 route
  list this was built against (only action *status updates by id* were) —
  flagged explicitly in the frontend README rather than guessed at.
- Strategy simulator, hybrid-strategy generation, information-value
  ranking, and strategy comparison (spec #21, #85-86, #31-32, #20) are P1
  per the spec's own priority list (#93) and were not built, per the spec's
  own instruction not to overbuild the MVP (#94). The types and engine
  seams (e.g. `PriorityWeights`, `StrategyVersion` history) were designed
  to support adding them without a rework.

## 22. P0/P1/P2 completion status

**P0 (spec #92) — all 16 implemented and exercised:**
Career Command Center, Current Strategy, Strategy Versioning, Next Best
Move, Bottleneck Detection, Strategy Health, Goal-to-Action Alignment (via
the drift detector + focus list), Constraint Awareness, Decision
Integration, Outcome Integration, Strategy Review, Strategy Timeline,
Recommendation Explanation, Student Confirmation (strategy-change gate),
Cross-feature integration (interface-level — see section 8-14), Secure
student data isolation (student-scope enforcement — full auth is a
placeholder, see section 19).

**P1 (spec #93) — partially implemented:**
Built: strategy drift detection, stop-doing recommendations (via the
`stop_low_value_activity` candidate), decision contradiction detection,
recommendation feedback. Not built (typed/architected for, not
implemented): career experiments beyond the basic lifecycle, strategy
simulator, FOMO detection, strategy comparison, Plan B, hybrid strategies,
information-value analysis.

**P2 (spec #94):** Not implemented, per the spec's own instruction.
