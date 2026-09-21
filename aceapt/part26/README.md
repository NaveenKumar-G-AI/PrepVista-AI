# ACEAPT Adapt (Feature 26)

An adaptive orchestration engine for PrepVista/ACEAPT: given everything currently
known about a student, decide the single highest-value thing they should do
next, build a time-boxed plan around it, and replan live as evidence comes in.

This is a full, working implementation of the OBSERVE → UNDERSTAND → DIAGNOSE →
PRIORITIZE → ADAPT → INTERVENE → MEASURE → UPDATE → REPLAN loop, built as a
standalone module with a real backend, a real frontend, and a real test suite
(46 tests, all passing) — not a mockup.

**No existing PrepVista codebase was provided alongside the spec.** The master
prompt is explicit that Feature 26 should inspect and reuse PrepVista's real
mastery/retention/transfer/question-engine systems rather than recreate them.
Since none of that was available here, this build creates a narrow, clearly
marked integration boundary (`backend/src/db/store.ts` + `seed.ts` +
`contentBank.ts`) in place of those systems, so the real engine underneath —
diagnosis, prioritization, planning, replanning, explainability — can be
dropped into the real codebase later with those three files swapped out and
nothing else touched. See **"What's real vs. a placeholder"** below.

---

## Quick start

Two terminals, no database or API key required to run the full demo:

```bash
# Terminal 1 - backend (http://localhost:4000)
cd backend
npm install
cp .env.example .env
npm run dev

# Terminal 2 - frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The app loads with seeded evidence for 8 topics
(see `backend/src/db/seed.ts`) and is fully interactive: pick a time budget,
start the recommended action, answer the questions, and watch the plan
recompute from your actual answers. "Reset" in the header restores the seed
data at any time.

### Run the backend tests

```bash
cd backend
npm test          # 46 tests: unit + integration
npm run typecheck
npm run build      # compiles to dist/
```

---

## The core loop, and where it lives

```
OBSERVE        backend/src/db/seed.ts, store.ts        (evidence in)
UNDERSTAND     backend/src/engine/state.ts, signals.ts  (confidence, momentum, stability, regression)
DIAGNOSE       backend/src/engine/diagnosis.ts          (the actual bottleneck, never just "weak")
PRIORITIZE     backend/src/engine/priority.ts           (transparent, weighted expected-value scoring)
ADAPT          backend/src/engine/plan.ts               (time-boxed plan, live replanning)
INTERVENE      backend/src/engine/contentBank.ts + frontend ActionPlayer
MEASURE        backend/src/engine/orchestrator.ts        (server-side grading only)
UPDATE         backend/src/engine/state.ts#applyEvidenceUpdate
REPLAN         backend/src/engine/orchestrator.ts#completeAction (calls back into ADAPT)
```

`backend/src/engine/orchestrator.ts` is the seam that wires all of the above
into the five API endpoints frontend actually calls.

### API

| Method | Path                              | Purpose                                    |
|--------|-----------------------------------|---------------------------------------------|
| GET    | `/api/capability-state`           | Per-topic state + diagnosis                |
| GET    | `/api/next-action`                | The single top recommendation + why        |
| GET    | `/api/adaptive-plan?minutes=15`   | Time-boxed multi-step plan                 |
| POST   | `/api/action/start`               | `{candidateActionId}` → question items     |
| POST   | `/api/action/complete`            | `{executionId, answers}` → graded, replanned state |
| POST   | `/api/action/skip`                | `{candidateActionId}` → logged, not graded |
| GET    | `/api/adaptation-history`         | Event log for the visible timeline         |

Authentication is a placeholder (`x-student-id` header, see
`backend/src/middleware/studentContext.ts`) — swap for PrepVista's real
session middleware; every route already just reads `req.studentId`.

---

## Traceability to the master prompt

The engine's rules were built to reproduce the document's own worked examples,
not just gesture at them. These are golden tests, not documentation:

| Spec section | What it says | Where it's implemented | Proven by |
|---|---|---|---|
| §9 | Percentages: strong mastery/retention, weak transfer → transfer challenge | `diagnosis.ts` TRANSFER_GAP branch | `tests/engine/diagnosis.test.ts` |
| §10 | Probability: retention gap, transfer *unknown* → repair retention, don't test transfer yet | `diagnosis.ts` (transfer check skipped when `null`) | `tests/engine/diagnosis.test.ts` |
| §11 | Averages: everything strong → stable, stop repeating it | `diagnosis.ts` STABLE branch | `tests/engine/diagnosis.test.ts`, `priority.test.ts` |
| §12, §45 | 15 minutes → 6min retention repair + 6min transfer + 3min verification | `plan.ts` greedy packing + mix-verification | `tests/engine/plan.test.ts` (exact reproduction) |
| §13 | Transparent prioritization, no arbitrary magic scores | `priority.ts` — every factor named, weighted, returned in `priorityBreakdown` | `tests/engine/priority.test.ts` (breakdown sums to score) |
| §17 | Live replanning after each result | `orchestrator.ts#completeAction` | `tests/integration/adaptiveLoop.test.ts` |
| §18 | Don't decide from thin evidence | `diagnosis.ts` LOW_EVIDENCE gate | `tests/engine/diagnosis.test.ts` |
| §19 | Stability → stop repetitive testing | `diagnosis.ts`, `signals.ts#computeStability` | `tests/engine/signals.test.ts` |
| §20 | Sudden drops need investigating, not a conclusion | `signals.ts#computeRegression` (returns hypotheses, never a verdict) | `tests/engine/signals.test.ts` (reproduces the 82→79→73→54 example) |
| §21 | Momentum is a signal, not a diagnosis | `signals.ts#computeMomentum` | `tests/engine/signals.test.ts` (reproduces both documented examples) |
| §22 | One error is noise; a recurring one is a pattern | `signals.ts#computePersistentErrorPattern` | `tests/engine/signals.test.ts` |
| §23-24 | Bridge difficulty, don't jump straight to hard | `engine/difficulty.ts` | (unit-testable ladder function; not yet wired into the item bank's live selection - see below) |
| §27 | A weak topic can really be a weak prerequisite | `diagnosis.ts` PREREQUISITE_GAP branch | `tests/engine/diagnosis.test.ts` (Quadratic Equations → Algebra Basics) |
| §29 | Different time budgets → different plans, including "not enough time for the real priority" | `plan.ts` (`exceedsBudget` case) | `tests/engine/plan.test.ts` |
| §31 | Every recommendation answers WHAT/WHY/TIME/EXPECTED VALUE | `engine/explain.ts` | Used directly in `/next-action`'s response |
| §32 | Skip is behavior, not failure | `orchestrator.ts#skipAction` (never touches evidence) | `tests/integration/adaptiveLoop.test.ts` |
| §35 | Fatigue signal, not a medical claim | `signals.ts#detectFatigue`, surfaced as a plain-language plan banner | `tests/engine/signals.test.ts` |
| §38 | AI assists with wording; never controls the path | `ai/client.ts` (can only reword an already-computed explanation; falls back silently) | Manual - requires `ANTHROPIC_API_KEY` to exercise the live path |
| §55 | Client never dictates mastery/correctness | `orchestrator.ts#completeAction` grades only against server-stored answers | `tests/integration/adaptiveLoop.test.ts` |
| §56 | No hard-coded demo outputs | Every number in the demo is computed from `seed.ts` evidence through the real engine | The golden tests would fail immediately if this weren't true |

---

## What's real vs. a placeholder

**Real, tested, production-shaped:** the entire adaptation engine (diagnosis,
priority scoring, time-boxed planning, live replanning, confidence gating,
stability/regression/momentum detection, prerequisite redirection, fatigue
detection, explainability), the API layer, and the full frontend UX loop
(open → see state → see next best action → why → start → complete → see
result → recompute → see new next action).

**Deliberately simplified placeholders, clearly marked in code comments,
standing in for systems that weren't available to integrate with here:**

- **Evidence source** (`db/seed.ts`, `db/store.ts`): seeded, in-memory + JSON-file
  storage instead of PrepVista's real mastery/retention/transfer services and
  database. Swap `store.ts`'s functions for real queries; nothing else changes.
- **Question content** (`engine/contentBank.ts`): a small hand-written item
  bank (curated for the two headline demo topics, generic elsewhere) standing
  in for the real question engine and the AI-generation + validation pipeline
  described in §39.
- **Evidence update model** (`state.ts#applyEvidenceUpdate`): a simple,
  documented smoothing formula standing in for PrepVista's real mastery/
  retention/transfer algorithms. It's intentionally transparent rather than
  psychometrically tuned - expect it to be more reactive to a single result
  than a production estimator would be.
- **Auth** (`middleware/studentContext.ts`): a header/query param instead of
  real sessions.
- **Difficulty bridging** (`engine/difficulty.ts`): the ladder function exists
  and is correct, but isn't yet wired into live item selection inside a
  multi-question action - each action currently serves a fixed small set.
- **Cohort/institutional intelligence** (§46-48): not built. The store is
  already keyed by `studentId`, so aggregating across students is a natural
  extension, but no aggregation or trainer/TPO-facing views exist yet.

Nothing above fakes an outcome - the demo works because the real engine
computes it from the seed evidence, not because any answer is hard-coded
(§56). The placeholders are about *where the input data and content come
from*, not about the decision-making itself.

---

## Design notes (frontend)

The visual language is built around evidence, not decoration: a deep
ink-blue surface, one confident accent (`--color-signal`, teal) for
"here's the evidence," and a second accent spent only on the single
highest-priority call to action (`--color-priority`, gold). Numbered steps
appear only for the adaptive plan, because that's the one place content is
genuinely sequential. The recurring "evidence readout" (left teal bar +
mono metrics + plain-language why, with an optional scoring breakdown) is
the one deliberate signature element, reused in the hero card and every
plan step, because explainability is the actual point of this feature.

Typefaces: Space Grotesk (display), IBM Plex Sans (body), IBM Plex Mono
(numbers/timestamps/scoring).

---

## Filling in the blanks

Per your instructions, nothing here needs secrets to run. `backend/.env.example`
lists everything you can optionally fill in later:

- `ANTHROPIC_API_KEY` - only enables the optional AI rewrite of explanations
  (§38). Leave blank and the app works identically, using the deterministic
  explanation text.
- `JWT_SECRET`, `DATABASE_URL` - unused placeholders for when you wire this
  into PrepVista's real auth and database.
