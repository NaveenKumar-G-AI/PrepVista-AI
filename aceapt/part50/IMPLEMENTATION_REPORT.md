# Feature 50 — Implementation Report

## Part 1 — Existing-system inspection (spec section 126)

This environment contained the Feature 50 prompt document itself and
nothing else — no ACEAPT repository, no Features 42–49 source, no database,
no existing frontend. Every item below reflects that honestly rather than
guessing at a codebase that wasn't there.

| Spec asked about | Finding |
|---|---|
| 1. Existing response-time architecture | Not available. `NewSpeedAttempt.responseTimeMs` is the seam — the host app's existing timer just needs to produce this one number. |
| 2. Existing timed-assessment architecture | Not available. Placement/pacing sessions are built as a new, clearly-separate `pacing_sessions` table so they never entangle with the real assessment-integrity system (spec 75). |
| 3. Existing question difficulty model | Not available. `DifficultyCalibrationProvider.getExpectedTimeMs()` is the seam (`src/integrations/types.ts`). Default returns `null` — never a guessed expected time. |
| 4. Existing Feature 42–49 dependencies | Not available. Nine adapter interfaces in `src/integrations/types.ts` stand in for them; `defaultProviders.ts` gives safe "unknown" defaults so the module runs standalone. |
| 5. Existing guided-solving timing (Feature 47) | Not available. `GuidedSolvingProvider.getStageTimings()` is the seam; `bottleneckEngine.detectStageBottleneck` degrades to `UNKNOWN` with a plain-language reason when it isn't wired up. |
| 6. Existing hint tracking (Feature 48) | Not available. `HintProvider` is the seam; `computeBaseline` already excludes hint-assisted attempts by default regardless of where hint data comes from. |
| 7. Existing novelty tracking (Feature 49) | Not available. `NoveltyProvider` is the seam; `computeBaseline`/`groupByScope` already support novelty-scoped baselines. |
| 8. Existing mastery/readiness systems | Not available. `MasteryProvider` gates session start (low/unknown mastery → session opens in `SOFT_TIMER`/`BALANCED` regardless of what was requested); `ReadinessSink.reportSpeedSignal()` is a one-way seam Feature 50 writes to and never reads back from. |
| 9. Existing analytics | Not available. Feature 50 ships its own analytics (profile/bottleneck/history) rather than assuming a shape to reuse. |
| 10. Reusable frontend components | Not available. 13 new components were built to the spec's own naming (section 87), styled with Tailwind utility classes only, no new UI framework introduced. |

**Consequence:** every one of Features 42–49 is represented as a TypeScript
interface Feature 50 depends on, never as a guess at their internals.
Wiring the real features in later requires edits only in
`src/integrations/defaultProviders.ts` (or passing real providers into
`createApp({ providers })`) — nothing in `src/core` or `src/services`
changes.

## Part 2 — Architecture decisions

- **Language/stack:** TypeScript throughout. Backend: Node.js + Express +
  Drizzle ORM + PostgreSQL, validated with Zod, tested with Jest. Frontend:
  React components, Tailwind classes, no extra chart/icon dependency (kept
  to `react`/`react-dom` as the only peer deps so it drops into an existing
  app cleanly).
- **Why Drizzle over an alternative ORM:** pure TypeScript, no native
  binaries to download at install time (this sandbox's network allowlist
  doesn't include a general binary CDN), and it type-checks against a real
  Postgres schema without needing a live database for verification.
- **Speed-training architecture:** `core/` holds every algorithm as pure
  functions with no I/O, so the "intelligence" is unit-testable without a
  database, a server, or a mocked framework — and so a future contributor
  can read the rules without wading through persistence code.
- **Pacing architecture:** a single `pacing_sessions` table serves both
  PACING mode and PLACEMENT_SIMULATION mode (spec 39, 74), kept separate
  from `speed_sessions` and from any real assessment table (spec 75).
- **Security model:** bearer JWT verified against `JWT_SECRET` (meant to
  match the real ACEAPT token issuer — this module verifies, it does not
  issue tokens); every service call takes `studentId` from the verified
  token and checks it against the resource's owner before returning
  anything (`ForbiddenError` otherwise); cohort analytics additionally
  requires a `TRAINER`/`TPO` role and only ever returns aggregate
  percentages, never a raw per-student row (spec 106–107, 78, 141).
- **Testing strategy:** unit-test every `core/` algorithm directly against
  the spec's own worked examples and its "CORE TEST" list (section
  128–144), then integration-test the service layer against the in-memory
  repository (security isolation, idempotent double-submit, session
  recovery), then smoke-test the real Express app over real HTTP.
- **Performance strategy:** all core algorithms are O(window size), with
  the rolling windows capped (5 for policy decisions, 50 for baseline
  history) so per-attempt cost stays flat regardless of a student's total
  history. `speed_attempts` has a composite index on
  `(student_id, skill_id, difficulty)` for the baseline/bottleneck queries.
- **Risks:** see "Known limitations" below.

## Part 3 — Post-implementation report (spec section 127)

**1. Files created:** 38 backend files (`backend/src/**`, `backend/tests/**`,
configs) + 16 frontend files (`frontend/src/**`) + 4 root files (this
report, README, `.gitignore`, `docker-compose.yml`) = 58 files.

**2. Files modified:** none — greenfield module, nothing to modify.

**3. Existing systems reused:** none were available to reuse (see Part 1).
Every reuse point is expressed as an interface instead.

**4. Speed services** (`backend/src/services`):
`speedSessionService` (start/get/submit-attempt/complete, mastery-gated
start, ownership checks), `speedAnalyticsService` (profile/bottlenecks/
targets/pacing summary/placement simulation/cohort view), `aiCoachingService`
(optional, deterministic-first, see below).

**5. Database changes:** six new tables — `speed_sessions`, `speed_attempts`
(with a unique `(session_id, client_attempt_id)` constraint for idempotency),
`speed_profiles`, `speed_bottlenecks`, `speed_targets`, `pacing_sessions`.
Schema: `backend/src/db/schema.ts`. Hand-written mirror migration:
`backend/src/db/migrations/0001_init.sql`. `student_id`/`question_id`/
`goal_id` are left as plain `uuid` columns (FK comments included) since the
core ACEAPT tables weren't available to reference.

**6. APIs** (`backend/src/api/routes.ts`, mounted at `/api/speed`):
`POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/attempts`,
`POST /sessions/:id/complete`, `GET /profile`, `GET /bottlenecks`,
`GET /targets`, `GET /frontier`, `POST /placement-simulations`,
`POST /pacing-sessions`, `GET /pacing/:id`,
`POST /cohort/:cohortId/bottlenecks` (role-gated) — the nine operations
from spec section 86, plus the frontier/safe-zone endpoint (spec 110-111)
and the bonus cohort endpoint.

**7. Speed profile implementation:** `core/speedAnalysis.ts` computes
average/median/accuracy/sample-size/confidence from independent (non-hint)
attempts only, requires ≥3 samples before returning anything (never a
guessed baseline), and `resolveExpectedTime` prefers calibrated data over
the personal baseline over an explicit "unknown" — never a fabricated
number.

**8. Bottleneck implementation:** `core/bottleneckEngine.ts` — stage-level
detection (reading/strategy/calculation/verification, only when step
timing is actually present) plus rushing/hesitation/knowledge-gap/
time-wasting signal detectors, each requiring its own minimum evidence and
each returning a confidence tier.

**9. Training modes:** all nine from spec section 32 are represented in
`TrainingMode` and selectable from `SpeedTrainingSetup`; `FLUENCY`,
`BALANCED`, and `DECISION` are actively driven by policy transitions,
`PACING`/`PLACEMENT_SIMULATION` by the pacing engine.

**10. Adaptive pressure:** `core/trainingPolicy.ts` — a five-branch
priority state machine (fatigue → rushing → knowledge-gap → hesitation →
stable-improving), gradual target ramp (~5%/step, floor at 65% of true
baseline), never a jump.

**11. Accuracy guardrails:** explicit `core/accuracyGuardrail.ts` utility,
plus guardrail checks baked into `trainingPolicy`'s branch logic.

**12. Feature 42–49 integrations:** nine interfaces in
`src/integrations/types.ts`, safe "unknown" defaults in
`defaultProviders.ts` — see Part 1 for per-feature mapping.

**13. Mastery/readiness integration:** `startSpeedSession` downgrades
pressure/mode when mastery is `NOT_STARTED`/`DEVELOPING`/unknown;
`completeSpeedSession` reports a `ReadinessSpeedSignal` outward and never
computes readiness itself.

**14. Analytics:** personal profile, bottleneck report, speed history
(frontend renders it from data the host app supplies), and an authorized
aggregate-only cohort distribution view.

**15. Security:** JWT auth + per-request ownership checks (tested),
role-gated cohort endpoint, fail-closed default authorization provider,
idempotent attempt submission via a DB unique constraint (Postgres) /
equivalent map check (in-memory), Zod validation on every request body.

**16. Tests added:** 63, across 9 files — see `backend/tests/`. Deliberately
mapped to the spec's own section 128–144 test list (see table below), plus
a dedicated file for the safe-speed-zone/frontier logic (spec 110-111).

**17. Tests passed:** **63 / 63**, plus a clean `tsc --noEmit` on both
backend and frontend, plus a live HTTP smoke test (see below) — all
reproducible with `cd backend && npm install && npm test`.

**18. Build status:** `npm run build` (backend) compiles cleanly to
`backend/dist`. Frontend components type-check cleanly against React 18
types; no build step is included for the frontend since it's meant to be
compiled by the host app, not shipped as its own bundle.

**19. Performance findings:** no live-load testing was performed (no
deployment target in this environment); algorithmic complexity is bounded
per point above.

**20. Known limitations:**
  - `db/repositories/drizzle.ts` type-checks against Drizzle's real types
    but was never run against a live Postgres instance (none was available
    here) — the in-memory repository is what all 58 tests actually exercise.
    Recommend running the migration against a real (or `docker compose up`)
    Postgres and re-running the test suite with a Drizzle-backed
    integration pass before production use.
  - `listRecentAttemptsByScope` in the Drizzle repository filters by scope
    in application code after fetching a bounded page from Postgres, rather
    than pushing every `ScopeType` variant into SQL — fine at moderate
    volume, worth revisiting with real traffic patterns.
  - Frontend components assume Tailwind is available in the host app and
    were not run through an actual bundler here (no host app to bundle
    into) — TypeScript/JSX correctness was verified, visual rendering was not.
  - `SpeedTrainingSession`'s question-answering contract
    (`renderQuestion(onAnswered)`) is a minimal seam; the real ACEAPT
    question UI will likely want a richer contract (e.g. passing the
    student's selected option through for review).
  - P2 items (voice/handwriting/multimodal timing, predictive pacing) were
    intentionally not built, per the spec's own instruction not to build
    speculative capability in P0.

**21. P0/P1/P2 status:** see the checklist below.

## Part 4 — P0 / P1 / P2 checklist (spec sections 121–123)

### P0 — must have

- [x] Response-time integration (`NewSpeedAttempt.responseTimeMs`, the seam for the host app's existing timer)
- [x] Difficulty-aware timing (`groupByScope`, difficulty is part of every scope key)
- [x] Speed profile (`speedAnalysis.computeBaseline` + `speedAnalyticsService.getSpeedProfile`)
- [x] Accuracy-aware speed analysis (`classifySpeedState`, four-state model + on-pace)
- [x] Personal baseline (evidence-gated, ≥3 samples, independent-only by default)
- [x] Speed bottleneck identification (`bottleneckEngine.ts`, 10 detectors)
- [x] Fluency mode (`TrainingMode.FLUENCY`, selectable in setup)
- [x] Recognition mode (`TrainingMode.RECOGNITION`, selectable in setup)
- [x] Strategy mode (`TrainingMode.STRATEGY`, selectable + stage-detected)
- [x] Calculation mode (`TrainingMode.CALCULATION`, selectable + stage-detected)
- [x] Balanced mode (`TrainingMode.BALANCED`, the policy's default safe landing state)
- [x] Adaptive pressure (`trainingPolicy.evaluateTrainingPolicy`)
- [x] Accuracy guardrail (`accuracyGuardrail.ts` + policy branches)
- [x] Rushing detection (`bottleneckEngine.detectRushing` + policy branch)
- [x] Safe speed logic (target ramp with floor, `trainingPolicy.rampTarget`)
- [x] Progress tracking (`SpeedHistory`, `SpeedSummary`, `getSpeedProfile`)
- [x] Feature 42 integration seam (`DifficultyCalibrationProvider`)
- [x] Feature 43 integration seam (same provider — diagnostic-sourced calibration)
- [x] Feature 44 integration seam (`GoalProvider`, `goalId` threaded through sessions)
- [x] Feature 45 integration seam (`SkillGraphProvider`)
- [x] Feature 47 integration seam (`GuidedSolvingProvider`, stage bottleneck detection)
- [x] Feature 48 integration seam (`HintProvider`, independence-aware baselines)
- [x] Feature 49 integration seam (`NoveltyProvider`, novelty-scoped baselines)
- [x] Mastery integration (`MasteryProvider` gates session start)
- [x] Secure persistence (JWT + ownership checks + Zod validation, tested)
- [~] Mobile — components use responsive Tailwind classes; no device testing was possible in this environment
- [x] Accessibility (`SpeedMeter`: text-carried status, `aria-live`, no color-only signaling, reduced-motion-safe — no CSS animation used)
- [x] AI fallback (`aiCoachingService`, tested failure/disabled/no-key paths)
- [x] Tests (58, see above)

### P1 — advanced

- [x] Stage-level timing (`bottleneckEngine.detectStageBottleneck`, gated on real instrumentation)
- [x] Reading-speed training (`TrainingMode.READING`, `BottleneckType.READING`)
- [x] Strategy-selection drills (`TrainingMode.STRATEGY`)
- [x] Calculation sprints (`TrainingMode.CALCULATION`)
- [x] Decision-speed training (`TrainingMode.DECISION`, `DecisionTraining` component)
- [x] Attempt/skip training (`decisionEngine.recommendAttemptDecision`)
- [x] Pacing mode (`pacingEngine.ts`, `PacingPanel`)
- [x] Placement simulation (`PlacementSimulation` component + `startPlacementSimulation`)
- [x] Safe-speed zone (`core/speedAccuracyFrontier.computeSafeSpeedZone` — widest contiguous evidence-backed range at/above guardrail, e.g. spec's own "42–55 sec" example; rendered in `SpeedDashboard`)
- [x] Speed/accuracy frontier chart (`core/speedAccuracyFrontier.computeSpeedAccuracyFrontier` — bucketed, evidence-gated, never decorative per spec 110; rendered as a shaded-safe-region chart in `SpeedDashboard`)
- [x] Rushing detection
- [x] Hesitation detection
- [x] Time-wasting detection (gated on optional retry/idle instrumentation)
- [x] Adaptive target ramp
- [x] Cohort speed analytics (`getCohortBottleneckDistribution`, role-gated, aggregate-only)

### P2 — future (intentionally not built; architecture leaves room)

- [ ] Voice-response timing
- [ ] Handwritten calculation timing
- [ ] Visual problem-solving speed
- [ ] Multimodal speed training
- [ ] Personalized pacing prediction
- [ ] Advanced response-stage modeling
- [ ] Real-time placement pacing coach

## Part 5 — Spec's own test list (section 128–144), mapped to real test files

| Spec test | Result | File |
|---|---|---|
| 128 Case A–D (speed vs accuracy) | ✅ pass | `tests/coreScenarios.test.ts` |
| 129 Adaptive pressure ramp | ✅ pass | `tests/trainingPolicy.test.ts` |
| 130 Accuracy collapse | ✅ pass | `tests/trainingPolicy.test.ts` |
| 131 Rushing | ✅ pass | `tests/bottleneckEngine.test.ts`, `tests/coreScenarios.test.ts` |
| 132 Hesitation | ✅ pass | `tests/bottleneckEngine.test.ts`, `tests/trainingPolicy.test.ts` |
| 133 Strategy bottleneck | ✅ pass | `tests/bottleneckEngine.test.ts` |
| 134 Calculation bottleneck | ✅ pass | `tests/bottleneckEngine.test.ts` |
| 135 Novelty fairness | ✅ pass | `tests/coreScenarios.test.ts` |
| 136 Hints analyzed separately | ✅ pass | `tests/speedAnalysis.test.ts` |
| 137 Guided-solving step bottleneck | ✅ pass | `tests/bottleneckEngine.test.ts` |
| 138 Difficulty fairness | ✅ pass | `tests/speedAnalysis.test.ts`, `tests/decisionAndPacing.test.ts` |
| 139 Fatigue | ✅ pass | `tests/trainingPolicy.test.ts` |
| 140 Placement attempt/skip | ✅ pass | `tests/decisionAndPacing.test.ts` |
| 141 Security isolation | ✅ pass | `tests/sessionService.test.ts` + live HTTP smoke test |
| 142 Session recovery | ✅ pass | `tests/sessionService.test.ts` |
| 143 Concurrency / double-submit | ✅ pass | `tests/sessionService.test.ts` |
| 144 AI failure | ✅ pass | `tests/aiCoachingService.test.ts` |

Plus a tone-safety scan (spec 73) run across every generated message in
`tests/coreScenarios.test.ts`, and a live end-to-end HTTP smoke test
(server boot → health check → auth rejection → start session → submit
attempt → complete session → cross-student 403) run manually against the
compiled server during development.
