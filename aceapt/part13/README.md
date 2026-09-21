# ACEAPT AI — Feature 13: Continuous Readiness & Exam-Condition Performance Engine

A standalone reference implementation, built the same way as the earlier CodeForge AI
features in this ecosystem: no existing repository was available in this session to
inspect (Section 60 of the brief asks for that first), so this is a self-contained,
runnable system with clean integration seams for Features 8, 9, 10, and 12, rather
than a patch against code that doesn't exist here. Keys and secrets are left blank in
`.env.example` for you to fill in.

Server: Node + TypeScript + Express + PostgreSQL (with Row Level Security).
Web: React + TypeScript + Vite + Tailwind.

## Quickstart

Requires Node 20+ and a local PostgreSQL 14+ server.

```bash
# 1. Database
createdb aceapt_feature13

# 2. Server
cd server
cp .env.example .env          # edit MIGRATIONS_DATABASE_URL if your postgres
                               # superuser isn't postgres/postgres on localhost
npm install
npm run migrate               # creates schema, RLS policies, the aceapt_app role
npm run seed                  # loads topics/questions/profiles + a demo student's
                               # simulation history (prints the student's ID at the end)
npm run test                  # 69 tests, all deterministic engine logic
npm run dev                   # http://localhost:4013

# 3. Web (separate terminal)
cd web
npm install
npm run dev                   # http://localhost:5173, proxies /api to :4013
```

Open the web app, paste in the student ID the seed script printed, and you're looking
at a fully-populated readiness dashboard.

## Architecture

```
RAW EVENTS  ->  RECONCILED ATTEMPTS  ->  DETERMINISTIC METRICS  ->  EVIDENCE
    ->  CONFIDENCE  ->  READINESS DIMENSIONS  ->  GAP MAP  ->  OVERALL STATE
    ->  (optional) AI-POLISHED EXPLANATION
```

This mirrors Section 45/46 of the brief exactly: every number a student sees is
produced by deterministic code before an LLM ever sees it. The LLM (when configured)
is only allowed to reword an already-complete explanation — see
`src/ai/anthropicExplainer.ts`'s system prompt, which explicitly forbids introducing
any number not already in the input text. With no `ANTHROPIC_API_KEY`, the product
works identically using `src/ai/templateExplainer.ts` alone.

### Server layout

```
server/
  db/migrations/0001_init.sql   schema + Row Level Security policies
  db/seed/                      reference data (60 real aptitude questions,
                                 2 assessment profiles) + demo student history
  src/domain/types.ts           shared vocabulary — start here
  src/engines/                  pure, deterministic, unit-tested logic:
    withinSimulationAnalysis.ts   accuracy/speed patterns, time allocation,
                                   question selection, topic switching, recovery,
                                   end-of-assessment degradation (sections 9-16)
    crossSimulationAnalysis.ts    condition gap, consistency, skill decay,
                                   novelty (sections 8, 14, 17, 25, 40)
    postmortemEngine.ts           Section 32 — analyzes ONE simulation
    dimensionScoring.ts           maps analysis -> the 12 readiness dimensions
    confidenceEngine.ts           separates readiness from confidence-in-the-
                                   estimate (sections 3, 18)
    readinessEngine.ts            orchestrator: dimensions -> gap map -> overall
                                   state -> full snapshot (sections 1-2, 19-24, 36)
  src/simulation/                blueprint generation, scoring, event reconciliation
  src/integration/               Feature 8/10/12 client interfaces + mocks
  src/ai/                        template explainer + optional Claude polish
  src/api/                       Express routes (thin — logic lives in engines)
```

### Data model

New schema (`students`, `topics`, `questions`, `assessment_profiles`,
`assessment_blueprints`, `simulations`, `simulation_questions`,
`simulation_question_events`, `simulation_attempts`, `readiness_snapshots`,
`readiness_dimension_scores`, `readiness_gaps`, `readiness_evidence`,
`interventions`) — there was no existing ACEAPT schema in this session to extend, so
this is designed to stand alone and be easy to re-point at your real tables (see
Integration Guide below). `students`/`topics`/`questions` in particular are almost
certainly things your real system already has.

### Event sourcing, not direct writes

The client never tells the server "this question is answered correctly" — it sends
raw events (`QUESTION_VIEWED`, `QUESTION_ANSWERED`, `QUESTION_SKIPPED`,
`QUESTION_REVISITED`, `QUESTION_SUBMITTED`, plus assessment-level events). The server
reconciles the full event log for a question down to one canonical outcome at submit
time (`src/simulation/eventProcessor.ts`) — last selection wins, order-independent,
and a question with zero events is `unanswered` while one with an explicit
`QUESTION_SKIPPED` and no answer is `skipped`. This is Section 44's "never trust a
single event" made concrete.

### Row Level Security

Every student-scoped table carries a denormalized `student_id`, even where it's
reachable via a join, so RLS policies are a single equality check rather than a
correlated subquery on every row (`db/migrations/0001_init.sql`). The app connects as
an unprivileged `aceapt_app` role that migrations create — it cannot even `DELETE` or
`TRUNCATE`. `src/db/withContext.ts` is the only place `app.current_student_id` gets
set (via `set_config`, transaction-scoped), and every repository function that
touches student data routes through it. A separate `app.is_service_role` context
exists for future cross-student rollups (Section 54) and requires a distinct
`DATABASE_SERVICE_URL`.

### The 12 readiness dimensions

`concept, accuracy, speed, time_pressure, mixed_topic, novel_question, retention,
consistency, assessment_condition, recovery, question_selection, time_allocation` —
each gets its own score (0-100), status (`READY` / `DEVELOPING` / `HIGH_RISK`),
confidence, and evidence summary. `time_pressure` and `assessment_condition`
deliberately overlap somewhat: the brief defines Condition Gap Detection (Section 8)
and Pressure Performance (Section 14) as related-but-separate detectors, so
`time_pressure` isolates the untimed-vs-timed delta specifically while
`assessment_condition` reflects the full practice-to-simulation ladder. A dimension
can only show `READY` when confidence is not `LOW` — a thin, lucky sample can't
present as certified-ready regardless of its raw score (mirrors Section 2's rule for
the overall state).

### Overall state gating (Section 36)

`INSUFFICIENT_EVIDENCE` (0 realistic simulations) -> `EARLY_EVIDENCE` (exactly 1,
regardless of score) -> `DEVELOPING` / `NEAR_READY` / `CONDITIONALLY_READY` /
`STRONGLY_READY`, each requiring strictly more evidence, a higher score, *and* higher
confidence than the tier below — see `deriveOverallState` in
`src/engines/readinessEngine.ts` for the exact thresholds, written as a flat,
auditable list rather than buried logic.

## What's implemented vs. deferred

Following Section 56's own prototype-priority scope:

**Built:** realistic simulation with a real timer and question navigator, mixed-topic
assessment, scoring with negative marking, full postmortem analysis, all 12 readiness
dimensions, gap detection, evidence + confidence engines, readiness trend, the
Feature 12 handoff (mocked client, real ledger), resimulation comparison, topic
switching, question-selection intelligence, end-of-assessment degradation, recovery
analysis, novelty tracking, retention/skill-decay detection, and two assessment
profiles.

**Deferred** (Section 58's own "future evolution" list, or explicitly out of scope
per Section 54): cohort/institutional dashboards, adaptive simulation difficulty,
response-prediction ML, personalized readiness thresholds beyond target
score/date, and anti-gaming beyond the novelty-confidence penalty already in place.
These weren't half-built and left broken — they're just not started, matching the
brief's own instruction not to attempt the whole future system before a deadline.

## Integration guide

This was built without your real codebase in context, so here's exactly what to
reconcile:

- **`students` table** — almost certainly replace with your existing student table.
  Every foreign key in the schema points at `students(id)`; repoint them and the rest
  is unaffected, since the engines only consume the shapes in `src/domain/types.ts`,
  never the schema directly.
- **`questions` / `topics`** — minimal reference bank (60 real questions across 5
  topics) so the simulator has content. If ACEAPT already has a question bank, point
  `src/simulation/blueprintGenerator.ts`'s pool query at it instead.
- **Auth** — `src/api/middleware/auth.ts` is a seam, not a real auth system. It
  currently trusts an `X-Student-Id` header outright when `AUTH_JWT_PUBLIC_KEY` is
  unset; that fallback must be deleted before this goes anywhere near production.
- **Feature 8 (mastery)** — `src/integration/featureClients.ts`'s
  `MockFeature8Client` returns `null`, so the `concept` dimension falls back to
  topic-practice accuracy. Replace it with a real call to Feature 8's mastery system.
- **Feature 9 (simulation infrastructure)** — Section 29 asks to reuse existing
  simulation infrastructure. None was available here, so `src/simulation/` is a
  complete implementation of its own. If Feature 9 already delivers realistic
  simulations in your codebase, point the readiness engine at Feature 9's
  attempt/event data instead — it only depends on the `SimulationRecord` shape, not
  on how the data was produced.
- **Feature 10 (trajectory forecast)** — `MockFeature10Client` returns `null`. Wire
  in a real forecast and it'll show up in the API surface once you thread it through.
- **Feature 12 (interventions)** — `MockFeature12Client` maps each gap dimension to
  one illustrative intervention type via a fixed table. A real Feature 12 would
  weigh student history, current workload, and spacing — the integration point
  (`recommendIntervention`) is ready for that; only the mock logic is naive.

## Verification notes

Everything below was actually run, not just written:

- **69 unit tests** (`npm run test`) covering the deterministic engines, including
  the Section 63 edge cases that matter most: zero/one/incomplete simulations, no
  timing data, an empty question pool, event order-independence, a question with no
  events at all vs. an explicit skip, and evidence-gating (a perfect score on one
  simulation must not certify `STRONGLY_READY`).
- **Full live HTTP walkthrough** against a real Postgres instance: migration, seed,
  start a simulation, submit 92 real events, verify RLS blocks a request with no
  student header (401) and rejects a malformed body (400), verify the in-progress
  question payload never includes an answer key, submit, postmortem, request a
  Feature 12 intervention, readiness trend.
- **Clean-room re-run**: dropped the database and repeated migrate, seed, test,
  typecheck from nothing, to confirm none of the above depended on leftover state.
- **Frontend**: `tsc --noEmit` and `vite build` both clean; the data-driven visual
  components (the radial instrument, journey chart, gap list, navigator) were
  server-rendered against the actual seeded readiness JSON, including empty and
  single-point trend edge cases, to catch rendering bugs invisible without a browser
  in this environment.

### Bugs found and fixed while building this

- Postgres's `SET LOCAL x = $1` doesn't accept bind parameters — the RLS context
  setter silently failed with a syntax error until switched to `set_config()`.
- The speed/accuracy classifier's original fast/slow thresholds (under 0.7x and
  over 1.3x expected time) left a gap: an answer right on the expected time fell
  into neither bucket and defaulted to "slow," which surfaced as a `speed`
  dimension score of 0% in the live readiness output. Fixed with a clean binary
  split at the expected-time mark.
- The seed script's scenario generator consumed an RNG draw for the speed
  multiplier *before* the correctness check, desyncing hand-calibrated seeds from
  actual output by up to 20 points of accuracy. Fixed the consumption order and
  recalibrated.
- The seed script represented "ran out of time" questions as an explicit
  `QUESTION_SKIPPED` event, which reconciles to `skipped`, not `unanswered` —
  undercounting the postmortem's unanswered total. Fixed by emitting no events at
  all for genuinely-unreached questions, which is what the reconciler treats as
  `unanswered`.
- A skill-decay test set the "current time" equal to the latest (lower-scoring)
  submission's own timestamp, so "days since last tested" was always zero and the
  decay signal never fired — a test bug, not an engine bug, but worth noting.

## Demo walkthrough (Section 57's story, reproduced)

`npm run seed` plays a demo student through exactly this arc, via the real
start -> events -> submit pipeline (not pre-written rows):

```
topic practice          86.7% accuracy   (untimed, confident)
timed practice           79.3% accuracy   (a clock appears)
realistic simulation    60.7% accuracy   <- the wake-up call
  -> gaps detected: assessment_condition, accuracy, speed
  -> Feature 12 recommends: FULL_MOCK_CYCLE
mixed practice           73.3% accuracy   (working the intervention)
realistic simulation    76.7% accuracy   <- resimulation: did it transfer?

Final readiness: ~82% — NEAR_READY, HIGH confidence, 2 realistic simulations
```

The exact gap Feature 12 gets handed and the exact final numbers vary slightly run to
run (seeded but genuinely computed by the engines, not scripted) — that's the point;
nothing here is hard-coded to produce this story.

## API reference

All routes except `/health` require an `X-Student-Id` header (dev-only — see Auth
above) and are prefixed `/api`.

| Route | Method | Purpose |
|---|---|---|
| `/assessment-profiles` | GET | List available profiles |
| `/assessment-profiles/:id` | GET | One profile |
| `/simulations` | POST | Start a simulation (`profileId`, `practiceMode`) |
| `/simulations` | GET | This student's simulation history |
| `/simulations/:id` | GET | One simulation + questions (answer key withheld until submitted) |
| `/simulations/:id/events` | POST | Batch-record raw events (max 200/request) |
| `/simulations/:id/submit` | POST | Reconcile, score, finalize, recompute readiness |
| `/simulations/:id/postmortem` | GET | Full analysis of one submitted simulation |
| `/readiness` | GET | Current snapshot (computes one if none exists) |
| `/readiness/recompute` | POST | Force recomputation |
| `/readiness/why-not-ready` | GET | Section 34's narrative, on its own |
| `/readiness/trend` | GET | Snapshot history for the journey chart |
| `/interventions` | GET / POST | List / request a Feature 12 recommendation for a gap |
| `/interventions/:id/complete` | POST | Link a resimulation as the intervention's result |

## Frontend design notes

The visual language is a deliberate "precision instrument" theme rather than a
generic dashboard — deep ink-navy panels, a custom-built radial chart for the 12
dimensions (not a default chart-library radar), monospaced tabular figures for every
number, and a muted three-color semantic system (ready / developing / high-risk)
instead of a single bright accent. The calibration rings on the radial chart aren't
decorative — they're the same 25/50/75/100 thresholds the gap map uses. Typography:
Space Grotesk for display, IBM Plex Sans for body, IBM Plex Mono for all data.
