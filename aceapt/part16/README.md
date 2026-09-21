# ACEAPT AI — Feature 16: Adaptive Learning Intervention & Recovery Engine

This is a standalone, working build of Feature 16. It was built fresh rather than
inside an existing ACEAPT repository — no Features 10–15 codebase was provided
alongside the build prompt, so this project defines clean integration seams for
them (see **Integration points** below) instead of assuming code that doesn't
exist here. Wire those seams to your real services and the rest of the system
doesn't need to change.

Every secret/config value is intentionally left blank in `server/.env`. The app
runs correctly with all of them blank — see **Running it** and **What the blank
keys mean**.

## What's actually implemented

Everything in this list is real, working code — not a mockup. It's been run,
not just written: 14 automated unit tests pass, the exact end-to-end scenario
from the brief's "Startupthon Demonstration" section runs both as a CLI script
and over live HTTP, and the built client is served by the built server.

- **Diagnostic engine** (`server/src/engine/diagnosticEngine.ts`) — rule-based,
  deterministic, confidence-scored (HIGH/MODERATE/LOW). Never calls an LLM.
- **Root-cause taxonomy** with a fixed priority order for multi-factor cases
  (`server/src/types/rootCause.ts`).
- **Intervention taxonomy + selector** (`server/src/engine/interventionSelector.ts`)
  — an extensible root-cause → intervention-chain policy map, an 8-level
  escalation ladder, and failed-intervention memory (never re-recommends a type
  that already failed for the same gap).
- **Progressive hints** (5 levels), **explain-differently** (8 representation
  styles, never repeats one), **error deconstruction** (your-approach →
  error-point → why → how-to-avoid), **"I'm stuck"** self-report flow.
- **Recovery sessions** — a multi-step recovery plan (clarification → contrast
  → guided → independent → transfer).
- **Micro-skill diagnosis** — Profit & Loss is broken into 6 components; the
  demo specifically identifies "reverse problems" as the weak component rather
  than labelling the whole topic weak.
- **Targeted, varied question generation** — parameterised templates, not
  random questions or memorisable static ones.
- **Intervention effectiveness** — before/after comparison that explicitly
  never declares mastery on its own.
- **Student intervention profile** — adaptive helpful/less-effective tracking
  with a minimum-evidence gate before drawing any conclusion.
- **Event system** — the 12 events from the brief, emitted with idempotency
  keys.
- **Auth/data isolation** — every route is scoped to `x-student-id`; a student
  can't read or write another student's data (verified with 401/403 tests).
- **The Section 48 demonstration, exactly as specified** — Profit & Loss,
  wrong because of a strategy error (not concept, not calculation) →
  Strategy Selection Training → Contrast Example → Guided Problem →
  Independent Problem → Transfer Challenge → improvement → Feature 14 receives
  evidence → Feature 15 replans.
- **A full frontend** (Vite + React + TypeScript + Tailwind) implementing the
  student-facing screens from the brief's UX sections: the diagnostic reveal
  panel, error deconstruction view, stuck menu, hint ladder, explain-differently
  panel, recovery session view, intervention history, and a guided walkthrough
  of the full demo scenario.

### Deliberately deferred (matches the brief's own "Future" scope)

Cohort-level intervention, teacher/instructor escalation UI, institutional
analytics, long-term intervention optimisation, and advanced learning-science
models are all explicitly out of scope in the brief itself (its own prototype
scope section marks these "Future"). They are not implemented here either —
implementing them without a real classroom/instructor system to attach them to
would just be fabricated UI.

### Known limitations, stated honestly

- **Persistence is a JSON file** (`server/data/db.json`), not a real database.
  This is intentional — it's the fastest path to something that actually runs
  with zero setup. `schema.sql` at the repo root is the reference relational
  design to migrate onto; swap `server/src/data/store.ts` for a real DB client
  and nothing above that module needs to change.
- **Features 10–15 are local mocks**, not real services (see below). They
  update believable local state so the end-to-end loop is genuinely
  observable, but they are not the real mastery/journey/readiness systems.
- **Effectiveness (before/after accuracy) is measured per micro-skill when one
  is tagged**, specifically so a single recovery cycle isn't diluted by a
  student's broader history on the parent topic. Attempts submitted without a
  `microSkillId` fall back to skill-level rolling accuracy, which is noisier —
  this was an actual bug caught while testing the demo (see git history/code
  comments in `orchestrator.ts` and `store.ts` for the reasoning).
- **No real login system.** The auth middleware enforces the one hard
  requirement Feature 16 owns (a student can't touch another student's data);
  it is not a substitute for your product's actual authentication.
- A single correct/incorrect "transfer challenge" question is used as the
  transfer signal in the demo. That's a thin sample size by design for a
  quick UI signal — real transfer-mastery verification over multiple attempts
  is Feature 14's job, not Feature 16's.

## Integration points (Features 10–15)

Every place Feature 16 talks to another feature is isolated in
`server/src/integration/`, with a `TODO(integration)` comment marking exactly
what to replace:

| File | Stands in for | Contract |
|---|---|---|
| `feature14Client.ts` | Mastery, transfer, retention | `submitEvidence()`, `getMasteryState()` |
| `feature15Client.ts` | Learning journey / path | `notifyStruggle()`, `notifyResolved()`, `replan()` |
| `otherFeatureClients.ts` | Feature 12 (intervention intelligence), Feature 13 (readiness/exam-condition), Feature 11 (behavioral signals), Feature 10 (trajectory) | `getInterventionSignal()`, `routeToExamSimulation()`, `getBehavioralSummary()`, `updateTrajectorySignal()` |

If your real Feature 12 already produces a root-cause/intervention signal,
wire it into `getInterventionSignal()` and have `diagnosticEngine.ts` merge it
in rather than running two competing diagnostic systems (this is what Section
29 of the brief asks for).

## Project layout

```
aceapt-feature16/
  schema.sql              reference relational schema (see "Known limitations")
  server/                 Node + TypeScript + Express API
    src/types/            root-cause & intervention taxonomies, evidence shapes
    src/engine/           diagnostic engine, selector, hints, recovery, etc.
    src/integration/      Feature 10-15 adapters (see table above)
    src/llm/              the only file that calls an LLM
    src/routes/           REST endpoints
    src/demo/             the Section 48 scripted scenario (CLI + API)
    src/__tests__/        automated tests (node:test)
    data/db.json          embedded JSON store (created on first run)
  client/                 Vite + React + TypeScript + Tailwind
    src/components/       one component per UX section of the brief
```

## Running it

Requires Node 18+.

```bash
# Terminal 1 — API server
cd server
npm install
npm run build
npm start
# -> http://localhost:4000

# Terminal 2 — frontend (dev mode with hot reload)
cd client
npm install
npm run dev
# -> http://localhost:5173 (proxies /api to :4000)
```

Or, for a single-process production-style run: build the client first
(`cd client && npm install && npm run build`), then start the server — it
automatically serves the built client from `client/dist` at the same port
as the API (`http://localhost:4000`) if it finds that folder.

Open the app and click **"Run the guided demo"** — this seeds a demo student
and replays the exact Section 48 scenario through real API calls. Once it's
run once, the **Live Practice** tab unlocks: a sandbox where you submit your
own evidence (concept gap, strategy gap, procedural gap, calculation error,
misread question, speed gap, or a self-reported "I'm stuck") and watch the
same live engine diagnose it, recommend an intervention, and let you drive
hints / explain-differently / error deconstruction / reassessment / recovery
sessions — nothing in that tab is scripted.

To replay just the scripted scenario from the command line:

```bash
cd server
npm run demo
```

To run the automated tests:

```bash
cd server
npm test
```

## What the blank keys mean

`server/.env` (copied from `.env.example`) ships with every value blank:

- **`ANTHROPIC_API_KEY`** — blank means explanations, hints, and error
  feedback come from deterministic templates instead of an LLM
  (`server/src/llm/llmService.ts`). Fill this in and everything upgrades to
  LLM-generated wording automatically, with zero code changes — the fallback
  and the LLM path return the same shape.
- **`JWT_SECRET`** — blank means the auth middleware runs in a clearly-logged
  dev mode that trusts the `x-student-id` header as-is. Set this before any
  real deployment; the client will then need a real token-issuance path (your
  actual login system), since Feature 16 doesn't own authentication.
- **`PORT`** / **`CORS_ORIGIN`** — sensible local defaults; change if needed.

## Testing performed

- 14 automated unit tests (`npm test` in `server/`) covering: every root-cause
  category reachable from step-level evidence, self-report, aggregate accuracy,
  and regression signals; multi-factor priority ordering; failed-intervention
  memory; and escalation-level progression up to full-chain exhaustion.
- The full Section 48 scenario, run both as a CLI script and as live HTTP
  calls against the running server (`POST /api/demo/run`), with the JSON
  output inspected at each stage.
- Manual HTTP smoke tests of every endpoint the frontend calls (attempts,
  stuck, start, reassess, hint, explain-differently, error-deconstruction,
  recovery sessions + step completion, history, profile, journey), including
  auth failure cases (missing header → 401, mismatched student → 403).
- `tsc` type-checking and a production build for both `server/` and `client/`.

## Security & performance notes (for the production path)

- Data isolation is enforced per-request (Section 41); extend
  `middleware/auth.ts` to call your real auth system rather than trusting
  the header once you're past prototype use.
- `schema.sql` includes the indexes that matter most for this feature's
  access patterns (student+skill+time on attempts/interventions/events).
- The micro-skill graph and student profile lookups are small, in-memory
  operations in this prototype; at production scale, cache the skill graph
  (it changes rarely) and consider background aggregation for the rolling
  accuracy windows rather than recomputing them from raw rows on every
  request (Section 42).
