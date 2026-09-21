# ACEAPT — Feature 11: Learning Behavior, Motivation & Consistency Intelligence

No existing ACEAPT repository was provided alongside the brief, so this was built as a standalone,
runnable project rather than pausing to ask about a codebase that didn't exist in this conversation.
Everything below is real, tested, and running — not scaffolding.

## 0. Scope decision (read this first)

The brief itself (section 55, "Startupthon Prototype Priority") says not to spend prototype time
building every future enterprise capability, and to prioritize *visible proof of product intelligence*
instead. This build follows that instruction literally:

**Built for real, tested, and running:**
- All 12 signal detectors (consistency, session behavior, abandonment, challenge exposure, persistence,
  recovery, assistance dependency, confidence calibration, plan adherence + plan realism mismatch,
  learning rhythm, cramming, question friction — both per-student and cross-student, workload mismatch +
  practice distribution imbalance, returning-student)
- The full event → aggregation → signal → profile pipeline
- A REST API over it, with a placeholder-but-real auth layer
- A student-facing "Learning Behavior" page (React) matching section 38/39's mockups
- A demo script that seeds synthetic multi-student data and runs the actual closed loop described in
  section 56, end to end, printing real computed numbers
- 44 passing unit/integration tests covering the named calculators, edge cases, and the full pipeline

**Deliberately designed-for-but-not-built** (documented, not hidden — see §8):
- Real database persistence (an `EventStore` interface makes this a one-file swap, see §3)
- Production auth/JWT (interface + placeholder implementation exist, see §3)
- Institutional/cohort aggregation UI (section 33) — the per-question cross-student friction detector
  is a real, working instance of "aggregate across many students," which is the same primitive a cohort
  view would need; a full cohort dashboard is not built
- ML-based signal detection (section 51) — every detector is a documented, tunable heuristic on purpose

## 1. Repository layout

```
aceapt-feature11/
  backend/                  Node/TypeScript/Express — the actual intelligence engine + API
    src/
      config/               env.ts, thresholds.ts (every heuristic constant, documented, section 50)
      types/                events.ts, signals.ts, profile.ts — canonical data models
      domain/
        signals/            the 12 detectors + confidenceScore.ts + signalFactory.ts + index.ts (orchestrator)
        explain/            explanationEngine.ts (composite narrative), narrativeEnhancer.ts (optional LLM hook)
        time.ts, utils.ts, eventStore.ts (interface), eventValidation.ts (zod), profileBuilder.ts
      infrastructure/       inMemoryEventStore.ts (swap point for a real DB), store.ts (singletons)
      sample-adaptive-planner/  NOT Feature 11 — see §4
      api/                   routes.ts, controllers/, middleware/ (auth placeholder, error handling)
      demo/                  seedEvents.ts (synthetic data), runDemoStory.ts (the section-56 walkthrough)
      server.ts
    tests/                   7 files, 44 tests
  frontend/                 React/TypeScript/Vite — the student-facing "Learning Behavior" page
    src/
      api/behaviorApi.ts
      components/LearningBehaviorPage.tsx, PlanChangeExplanation.tsx
      styles/tokens.css
  demo-preview.html          Standalone, no-server-needed visual preview (real computed data embedded)
  README.md                  This file
```

## 2. How to run

**Backend:**
```
cd backend
cp .env.example .env      # everything sensitive is left blank — see §7
npm install
npm run dev                # http://localhost:4000, loads synthetic demo students (DEMO_MODE=true)
```

**Frontend** (separate terminal):
```
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

**Demo story** (no frontend needed — prints the full section-56 closed loop to the terminal):
```
cd backend
npm run demo
```

## 3. Architecture: the pipeline (section 22)

```
Raw Events → Validation (zod) → [per-detector aggregation] → Signal Detectors (12) →
  Behavior Signals → Behavior Profile → API (adaptive-signals feed to a real Feature 7)
```

Each stage is independently testable and swappable:
- **Storage**: everything above `EventStore` (`domain/eventStore.ts`) depends only on that interface.
  `infrastructure/inMemoryEventStore.ts` is the only file that knows events live in a JS array — swap in
  Postgres/Mongo by writing one new class.
- **Auth**: every route goes through `api/middleware/auth.ts`, a single placeholder function. Replace its
  body with real session/JWT verification once `JWT_SECRET` is set; nothing else changes.
- **Confidence**: every detector calls the same `computeSignalConfidence()` (section 24) instead of
  inventing its own math — retuning "how much evidence is enough" happens in one function.
- **Thresholds**: every heuristic constant lives in `config/thresholds.ts`, documented (section 50).
- **Explanations**: deterministic and evidence-grounded by construction (section 49). An optional
  `NarrativeEnhancer` interface exists for later LLM-based rephrasing — see §7 for why it's not wired up.

## 4. The architectural boundary the brief insists on (sections 28–32, and the "IMPORTANT ARCHITECTURAL
RULE" at the top of the brief)

Feature 11 produces observations and signals. It does not decide the learning plan — that's Feature 7,
which doesn't exist in this repository. To demonstrate the full closed loop from section 56 without
violating that boundary, `sample-adaptive-planner/planAdapter.ts` is a small, clearly-labeled stand-in:
it consumes Feature 11's public `BehaviorSignal[]` output through the same exported types a real Feature 7
would use, with no special-cased internals. Its own file header explains this is a demo convenience, not
part of Feature 11. Its API route (`GET /student/:id/sample-plan-change-explanation`) is kept visibly
separate from Feature 11's own surface in `api/routes.ts`.

## 5. API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/api/student/:id/behavior-profile` | The 8-dimension student-facing profile (section 18) |
| GET | `/api/student/:id/behavior-signals` | Full signal list, incl. conditional patterns |
| GET | `/api/student/:id/behavior-summary` | Condensed headline + one-line summary |
| GET | `/api/student/:id/behavior-history` | Stored BehaviorSnapshots over time (section 21) |
| POST | `/api/student/:id/behavior/context` | Student-provided context, e.g. "I only have 15 minutes" (section 27) |
| GET | `/api/student/:id/adaptive-signals` | ACTIVE, confidence-filtered signals for a real Feature 7 to consume |
| POST | `/api/events`, `/api/events/batch` | Event ingestion (not in the brief's section-41 list, but required infrastructure — Feature 11 has nothing to analyze without it) |
| GET | `/api/student/:id/sample-plan-change-explanation` | Demo-only — see §4 |

All `:id` routes require an `x-student-id` header matching `:id` (or `x-role: admin` to bypass, for the
internal-dashboard use case in section 40) — see §3 on why this is a placeholder, not production auth.

## 6. Verifying it actually works

```
cd backend
npm run typecheck   # tsc --noEmit, clean
npm test            # 44/44 passing
npm run demo        # prints the real, computed section-56 closed loop
```

```
cd frontend
npm run typecheck   # clean
npm run build       # produces a real Vite production bundle
```

`demo-preview.html` at the repo root needs neither of the above running — open it directly in a browser.
It embeds the *actual* output of `npm run demo` (not separately hand-written copy) so the numbers you see
are the numbers the engine computed.

## 7. What's intentionally left blank

Per request, nothing sensitive is filled in:
- `backend/.env.example` — `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET` are all blank. Each has a
  comment pointing to the exact file to change when you're ready to use it.
- The optional `LLMNarrativeEnhancer` (`domain/explain/narrativeEnhancer.ts`) is sketched but not wired
  up — the service is fully functional without it, using deterministic templates instead.
- `frontend/.env.example` — `VITE_API_BASE_URL` defaults to localhost.

## 8. Known limitations (honest accounting, section 60)

- **Plan model is simplified**: the current model tracks one target session length per plan, not a full
  calendar of scheduled sessions. Adherence measures how close actual sessions come to that target
  duration, not whether specific scheduled sessions were skipped outright. Documented inline in
  `planAdherence.ts`.
- **Workload mismatch** reads assigned-item counts from a plan event's `metadata` field (there's no
  separate curriculum/mastery model in this repo to source that from) — a real integration would pull
  this from wherever ACEAPT's mastery/diagnostic system lives.
- **Practice distribution imbalance** infers "other weak topics" from what was practiced at all in the
  window, not from an actual weak-topics list (which would come from Feature 1-3's diagnostic output,
  not part of this repo).
- **Storage is in-memory** — state resets on restart aside from the demo seed. This is a genuine
  prototype-scope decision (see §3), not an oversight.
- **No cohort dashboard UI** — the cross-student content-friction detector proves the underlying
  aggregation primitive works (see the demo output), but there's no institutional-view frontend.

## 9. Future expansion points (section 51–53)

- Swap `computeSignalConfidence()`'s internals for a calibrated/learned model without touching any
  detector (every detector already depends on that one function, not its own math).
- `BehaviorSnapshot` storage already exists (`infrastructure/store.ts`) — a longitudinal view (section 53)
  is a matter of querying that history, not a new data model.
- Intervention-effectiveness tracking (section 52) has a natural home: log which `PlanChangeRecommendation`
  was applied, then compare `BehaviorSignal` values before/after over the following weeks using the
  history endpoint that already exists.

## 10. Demo scenario walkthrough (section 56)

`npm run demo` (from `backend/`) seeds a student (`demo-arjun`) whose real synthetic event history plays
out the brief's own story:

1. **Practices infrequently, well short of the plan** — 4 sessions in ~3 weeks, each ~25 minutes against
   a 60-minute planned target.
2. **Feature 11 observes it** — `PLAN_REALISM_MISMATCH` fires with real evidence (median actual duration,
   how many separate days it held), plus a `CHALLENGE_EXPOSURE: LOW` signal.
3. **The sample downstream planner reacts** (explicitly *not* Feature 11 — see §4) — recommends 60 → 25
   minute sessions, with the exact evidence-grounded sentences a "Why did ACEAPT change my plan?" panel
   would show.
4. **Student becomes more consistent under the new plan** — 9 sessions in the following 9 days, adherence
   moves from MODERATE (42%) to STRONG (100% against the new target).

Every number in that walkthrough is computed by the real engine at two different historical cutoffs, not
scripted — see `backend/src/demo/runDemoStory.ts`.
