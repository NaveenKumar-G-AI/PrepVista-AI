# ACEAPT AI — Feature 14: Adaptive Mastery & Skill Transfer Intelligence Engine

A working prototype: a deterministic evidence engine that turns raw practice
events into an explainable, multi-dimensional mastery state — plus an API
and a UI on top of it. Built end to end and verified running (automated
tests + live HTTP smoke tests) rather than left as scaffolding.

## A note on scope, read this first

The build prompt this repo implements is written for an agentic coding tool
with access to an existing PrepVista/ACEAPT repository — it repeatedly says
"inspect the repository first," assumes an existing skill graph, question
bank, Feature 7–13 services, auth system, and design system. **No such
repository was provided** — this conversation started from the build prompt
alone, with no codebase attached. So rather than inventing a fake "existing
codebase" to inspect, this was built as a **self-contained module with clean
integration seams**, so it can be lifted into the real PrepVista codebase
later with minimal rework. The specific seams are called out under
[Integrating into the real codebase](#integrating-into-the-real-codebase)
below.

Per your instructions: nothing was held back with clarifying questions, and
every credential is left blank in `.env.example` for you to fill in — the
prototype runs with zero configuration (no database, no API key required).

## Quick start

```bash
# Backend
cd backend
npm install
npm run seed          # writes backend/data/db.json (already included, but reruns cleanly)
npm run dev            # http://localhost:4000

# Frontend, in a second terminal
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173`. The demo student (Aisha Verma) already has a
seeded history spanning every mastery state the engine supports — see
[The seeded demo](#the-seeded-demo) below for what to click on and why.

Optional: copy `backend/.env.example` to `backend/.env` and set
`ANTHROPIC_API_KEY` to have the "why this state" explanations phrased by
Claude instead of the built-in deterministic template. Nothing else in the
app depends on it — this is the only optional integration.

Useful dev commands:
```bash
cd backend
npm test              # 12 tests covering the anti-gaming/anti-fabrication rules
npm run debug:map     # prints the engine's computed state for every skill, no UI
```

## Architecture: the loop the spec asked for

Every mastery verdict in this system is produced by one pipeline, never
shortcut:

```
raw AttemptEvents
  -> evidenceEngine.ts    (independent vs guided, difficulty/format/context/
                            novelty breakdowns, retention, rolling stability)
  -> analysisEngine.ts    (named, threshold-backed gap flags — a flag is only
                            ever raised when there's enough data to support it)
  -> stateEngine.ts       (nested cumulative gates decide the MasteryState;
                            confidence is a SEPARATE axis from state)
  -> masteryAnalyzer.ts   (adds cross-skill root-cause/bottleneck reasoning)
  -> explainer.ts         (phrases the already-computed evidence; optionally
                            asks Claude to rephrase it, never to invent it)
```

No step is allowed to skip the one before it. In particular, `server.ts`
routes never touch raw attempts directly, and the explanation service (AI
or template) only ever receives a JSON object of numbers the engine already
computed — see `backend/src/engine/explainer.ts`. This is the concrete
implementation of the spec's Section 39/40 ("no magic AI").

**Every threshold lives in one file** (`backend/src/domain/constants.ts`),
so every gap flag traces back to a named, documented number instead of a
magic literal buried in engine code.

**State transitions are nested, not incremental.** Each state's gate
function calls the gate below it, so e.g. `RETAINED` cannot be true unless
`STABLE` is also currently true, given current evidence. Re-deriving the
"maximum currently-supported state" from scratch on every evaluation —
rather than incrementing a stored value — is what makes mastery
*regression* (spec §17) fall out of the same function as progression,
instead of needing special-case code. See `backend/src/engine/stateEngine.ts`
for the gate table and the comment explaining this choice.

**Independent accuracy gates on a recent window, not lifetime average**
(`THRESHOLDS.RECENT_WINDOW_SIZE`). This was a deliberate fix made partway
through building the seed data: with a lifetime average, early struggles
would permanently cap a student's state no matter how much they improved
afterward — which would make the diagnose → intervene → re-verify loop
pointless. Lifetime accuracy is still tracked and shown to students
(`evidence.lifetimeIndependentAccuracy`); it just isn't what gates state.

## What's implemented vs. deferred

The build prompt is a 56-section spec explicitly written to be prioritized
(its own §47) rather than built in full for a first prototype. This build
follows that priority list:

**Built and demonstrated end to end:**
- Multi-state mastery model (10 states, §3), nested controlled transitions
  and regression (§16–17)
- Evidence engine across independence, difficulty, format, context,
  novelty, and retention (§4–13)
- Confidence as an axis separate from state, with a stated reason (§14)
- Evidence-sufficiency guard — the system says "not enough data" rather
  than guessing (§15)
- Root-cause and bottleneck detection across the skill dependency graph
  (§18–19)
- A simplified composition-gap hook for skills declared as composites of
  others (§20) — deliberately coarse, as §20 itself allows for a prototype
- Mastery-check blueprint generation and live, answerable checks (§22–24)
- Student-facing Mastery Map, Skill Detail, and "What do I really know?"
  views (§25–28), each with a plain-language "why" (§29)
- Feature 12 and Feature 13 as explicit contracts (interfaces) with a
  labelled fallback implementation, so the gap → intervention →
  re-verify loop is demonstrable now and swappable for the real services
  later (§30–31)
- Mastery history / timeline (§34)
- Automated tests for the specific failure modes §52 calls out: thin
  evidence, repeated-question gaming, guided/independent gaps, instability,
  transfer gaps, retention gaps (`backend/tests/engine.test.ts`)

**Deliberately deferred** (per §47's own "if time permits" list, plus
things that need infrastructure this environment doesn't have):
- Format/context transfer are computed and flagged, but not yet given
  their own dedicated UI section beyond the Skill Detail breakdown
- Full multi-skill composition-gap analysis (§20 calls this an "advanced
  future capability" even for production)
- AI-generated question authoring + validation pipeline (§24) — the
  question bank here is hand-authored, not generated
- Institutional/cohort-level rollups (§37) — explicitly long-term in the
  spec
- Auth/multi-tenant security (§44) — there's one demo student and no
  login; a real deployment sits this behind whatever auth the main
  PrepVista app already uses
- A real database — see below

## Why JSON-file storage instead of a real database

`backend/src/data/store.ts` is an in-memory store with JSON-file
persistence, not Postgres/SQLite. This was a deliberate prototype choice,
not an oversight: it avoids a native-dependency build step (e.g.
better-sqlite3's node-gyp compile) that has nothing to do with the actual
mastery logic, while still being a real, typed repository behind a `Store`
interface. Swapping in a real database means implementing that interface
against Postgres/Prisma — nothing in `engine/*.ts` or `api/server.ts`
would need to change.

## Integrating into the real codebase

When this is dropped into the actual PrepVista/ACEAPT repository:

1. **Replace `data/store.ts`** with your real database layer behind the
   same `Store` shape.
2. **Replace `data/seedData.ts`** with your actual skill graph and question
   bank — `Skill.prerequisiteIds` and the `Question` metadata fields
   (`difficulty`/`format`/`novelty`/`context`) are the only fields the
   engine depends on.
3. **Wire in the real Feature 12** by implementing `InterventionEngine`
   from `contracts/feature12.ts` and swapping it for
   `FallbackInterventionEngine` in `api/server.ts`.
4. **Wire in the real Feature 13** the same way via `contracts/feature13.ts`.
5. **Sit the API behind your existing auth** — every route currently
   trusts `studentId` from the URL; that needs to become "the
   authenticated user," with authorization checks added.
6. Recalibrate `domain/constants.ts` against real usage data — the current
   thresholds are reasonable prototype defaults tuned against the seed
   dataset, not pedagogically validated numbers.

## The seeded demo

One student, `Aisha Verma`, with hand-authored (not randomly generated)
history across 8 skills, chosen to exercise every mechanism above:

| Skill | What it shows |
|---|---|
| Percentages | Rich evidence across every dimension → **Robust Mastery** |
| Profit & Loss | Solid independent performance, no delayed check yet → **Stable**, with an honestly-reported format/context spread gap visible in the detail view |
| Discount | Deliberately thin (3 attempts) → low-confidence **Developing**. Open this one and click "Start a mastery check" to see the live blueprint → answer → recompute flow |
| Ratios | Weak independent accuracy → **Developing**, and independently-evidenced enough to qualify as a root cause |
| Ratio & Proportion | Also weak, and depends on Ratios → flagged with a **root-cause gap** pointing at Ratios |
| Probability | The spec's own §48 walkthrough: practice, a first mastery check exposing real transfer and difficulty gaps, an intervention, a second check showing partial (not total — this is one improvement cycle, reported honestly) improvement, then a retention check |
| Permutations & Combinations | Looked **Stable** a month ago; a later retention check shows real decay → labelled **Retention gap** |
| Data Interpretation | A composite skill (Percentage + Ratios) with almost no attempts on record → correctly reports **"not enough data yet"** rather than guessing, and still surfaces the Ratios root-cause link |

None of these numbers are hard-coded — they're the actual output of the
engine running against the raw attempt events in `backend/src/seed.ts`.
`npm run debug:map` prints them straight from the engine with no UI in the
way, which is how they were checked while building this.

## Known non-issues

`npm install` in the frontend reports a moderate/high `esbuild`/`vite`
advisory (dev-server-only, relevant if the Vite dev server is exposed to an
untrusted network — not applicable to local development or a production
build). Not fixed here because the fix is a breaking Vite 6→8 upgrade,
which is out of scope for a prototype; flagging it so it's a conscious
decision, not a surprise.

## File map

```
backend/
  src/domain/         types.ts, constants.ts — the shared vocabulary + every threshold
  src/data/           store.ts (persistence), seedData.ts (skill graph + question bank)
  src/engine/         evidenceEngine, analysisEngine, stateEngine, rootCauseEngine,
                      masteryCheckEngine, explainer, masteryAnalyzer (orchestrator)
  src/contracts/      feature12.ts, feature13.ts — integration seams + fallbacks
  src/api/server.ts   Express routes
  src/seed.ts         hand-authored demo history
  src/tools/          debug CLI (printMasteryMap) + smoke test script
  tests/              engine.test.ts
frontend/
  src/lib/            api.ts (typed client), types.ts, evidenceStrip.ts
  src/components/     MasteryMap, WhatDoIKnow, SkillDetail, MasteryCheckFlow,
                      EvidenceStrip (signature component), ui.tsx (shared primitives)
```
