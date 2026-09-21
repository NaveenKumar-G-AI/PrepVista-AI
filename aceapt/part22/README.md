# ACEAPT Pathfinder — Feature 22 (vertical slice)

This is a working scaffold for the Adaptive Personal Learning Path & Goal
Optimization Engine described in the Feature 22 spec, scoped the way
**Section 55 explicitly asks for the prototype to be scoped**: one polished
vertical slice —

```
Goal -> Current Evidence -> Gap Analysis -> Bottleneck -> Personal Path ->
Next Action -> Student Completes Action -> New Evidence -> Path Automatically Changes
```

— rather than an attempt at all 57 sections at once. Everything here is
real, runnable, and tested (see "What was verified" below), not a mockup.

## What's in here

```
backend/            TypeScript engine scaffold (deterministic, testable, framework-free)
  types.ts              domain model: Goal, StudentState, Gap, Bottleneck, Priority, PathGraph, Events
  config.ts              ALL integration keys/URLs left blank, as requested
  events.ts              in-memory event bus stub (Section 47)
  engines/
    targetStateEngine.ts  goal -> measurable requirements (Section 10)
    gapEngine.ts           current vs target (Section 12)
    bottleneckEngine.ts    prerequisite-aware bottleneck detection (Section 13) + plain-language "biggest bottleneck" (27-28)
    priorityEngine.ts      explainable CRITICAL..MAINTENANCE scoring (14-15)
    pathEngine.ts          gates (19-22), stability (24), versioning + decision log (25-26), compression/expansion (32-33)
  services/
    pathfinderService.ts   orchestrates the above into planInitialPath() / ingestEvidence() / completeNode()
  demo.ts                 runs the exact Section 56 "ideal demo" scenario end-to-end and logs the result

frontend/
  aceapt-pathfinder-demo.jsx   interactive React demo of the same loop (Sections 51-56), already shared as an artifact above
```

## Assumptions made (per your instructions, I didn't stop to ask)

- **No existing ACEAPT codebase was attached to this task**, so this is a
  clean-room scaffold, not an integration into your real repo. The spec
  says to "inspect the codebase" and reuse existing Student/Skill/Assessment
  models before building — that step still needs to happen against your
  actual code; this scaffold is written so that's a relabeling exercise
  (swap the types in `types.ts` for your real ones) rather than a rewrite.
- **Stack**: TypeScript/Node for the engine layer, React for the UI. Nothing
  in the spec named a stack, and this pairing is easy to drop into most
  existing setups.
- **All secrets/URLs are blank** (`backend/config.ts`) — database
  connection string, event bus URL, AI explanation-generation key, and the
  URLs for the existing intelligence services (mastery, transfer, retention,
  simulation, diagnosis, intervention, Feature 20, Feature 21). Fill these
  in when wiring this into the real system; nothing currently reads them.

## Running it

```
cd backend
npm install
npm run demo
```

This type-checks the whole scaffold under `strict: true` and runs
`demo.ts`, which plays out Section 56's scenario: a student at Mastery
82 / Retention 79 / Transfer 58 / Timed 61 gets told their bottleneck is
"Transfer under time pressure," gets a path, completes the first step,
and the path visibly replans around new evidence — with a logged reason,
not a silent change.

The React file is already rendered as an artifact in our conversation above; it's also a
plain, dependency-light component (`react`, `lucide-react`) you can drop into
any React app that has those installed.

## Notable engineering decisions (and why)

- **Priority score is a gated weighted sum, not the spec's illustrative
  product formula.** A pure product lets one near-zero factor erase an
  otherwise-urgent item; a flat sum lets a skill with high prerequisite
  reach outrank a skill that's barely weak but not actually failing. What's
  implemented instead multiplies severity into the impact terms so a skill
  has to actually be weak before its position in the dependency graph can
  elevate it. This is covered in comments in `priorityEngine.ts` and
  `bottleneckEngine.ts`, and it's the actual reason the demo initially
  targets Data Interpretation rather than the more "central" but only
  marginally-weak Ratio skill.
- **Evidence-count and confidence gate replanning** (`classifyEvidenceStrength`
  in `pathEngine.ts`), per Section 24 — one low-confidence data point moves
  nothing; only sustained, confident evidence triggers a replan.
- **Replanning never destroys progress**: completed nodes are carried
  forward by matching label across path versions (Section 25/34), and
  version history + a full decision log (trigger, evidence, confidence,
  reason) are retained rather than overwritten.

## What was verified, concretely

- The backend type-checks clean under TypeScript `strict` mode and
  `demo.ts` runs end-to-end with no errors (`npm run demo`).
- The React artifact was rendered headlessly (jsdom + React 18) and driven
  through 12+ "mark complete" clicks, the time-budget selector, the "why"
  toggle, and the decision log — confirmed no runtime errors, and traced
  the output to confirm the bottleneck/path genuinely change in response to
  simulated evidence rather than following a hardcoded script. One real bug
  this caught and fixed: the decision-log toggle was originally a `<div
  onClick>` instead of a real `<button>`, which also would have hurt
  keyboard/screen-reader accessibility.

## Deliberately not built (scope left for the next pass)

Being upfront about this rather than quietly pretending it's all there:

- **Persistence.** `pathfinderService.ts` holds paths in a `Map` in memory;
  `config.database.connectionString` is where that plugs in.
- **The other Feature-22 sections** not needed by the vertical slice:
  weekly/monthly experience views (39), milestone tracking as a first-class
  entity (40), personal learning-strategy inference from historical outcomes
  (36), intervention-memory (37), and the full event-bus integration (47) —
  the event *shapes* exist in `types.ts` and are published to the in-memory
  bus, but nothing consumes them yet.
- **Anti-oscillation rule for priority.** In testing, the engine correctly
  re-targets a different skill as soon as it edges out the current one on
  score — which is the intended behavior, but a production version would
  likely want a small hysteresis rule (e.g., don't switch the top skill
  target on every single evidence update if the current one still has an
  active, incomplete node) so the student doesn't perceive thrash between
  two close-scoring skills.
- **Real intelligence-service integration.** Mastery/transfer/retention/
  simulation/diagnosis/intervention data is mocked in `demo.ts`; the
  `config.integrations.*` URLs are where those services plug in per
  Section 42.
