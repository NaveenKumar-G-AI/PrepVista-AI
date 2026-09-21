# ACEAPT Feature 33 — Opportunity-to-Action Engine

Turns a discovered opportunity into a personal, explainable decision: is this
eligible, is it a fit, what's missing, what should you do about it before the
deadline — and, afterward, what actually happened.

This implements the **P0 vertical slice** the spec itself defines as the
minimum meaningful build (spec section 85), fully working end-to-end, plus a
handful of cheap, high-value P1 pieces (duplicate detection, freshness
status, the priority queue, pattern detection). It does not implement P2
(TPO/institutional dashboards, cohort intelligence, predictive forecasting,
multi-source scraping) — see "Not built" below.

## Important — what had to be assumed

No existing ACEAPT codebase was provided in this build session (the prompt's
own instruction to "first inspect the existing codebase" had nothing to
inspect). So this ships as a **standalone service with clean integration
seams** rather than a patch on real code:

- **Student / Target / Capability** models (`src/seed/capabilities.js`,
  the student fields in `src/db/memoryStore.js`) are minimal stand-ins for
  whatever those tables already look like in ACEAPT. Swap them for real
  lookups and everything downstream (matching, gaps, recommendations) keeps
  working unchanged, since the engines only depend on the shapes, not on
  where the data comes from.
- **PATH, ADAPT, Feature 31 (Simulation), PROOF, FORECAST** integrations
  (`src/integrations/*.js`) are honest stubs: `isAvailable()` returns
  `false`, and the one real function each exposes throws a clearly-labeled
  `NOT_INTEGRATED` error instead of faking a result. Feature 33 checks
  `isAvailable()` everywhere before calling one and degrades gracefully when
  it's false (e.g. `POST /simulate` returns `503` with a plain explanation,
  not a fabricated simulation). Wiring in a real implementation is a matter
  of replacing these two exports per file with the real service call — no
  other file needs to change.
- **Persistence** is in-memory by default (`src/db/memoryStore.js`) so the
  whole thing runs with zero setup. `src/db/schema.sql` is the matching
  reference Postgres schema for when you're ready to wire in a real
  database — see "Wiring into the real ACEAPT" below.

## What's implemented (P0)

Ingestion & normalization · required-vs-preferred requirement extraction ·
eligibility analysis (never guesses on missing data) · multi-dimensional fit
(target alignment / capability match / evidence match / readiness /
timeline) · capability-gap vs evidence-gap vs target-gap vs
opportunity-gap analysis · deadline-aware, deterministic recommendation
(APPLY_NOW / PREPARE_AND_APPLY / PREPARE_FIRST / WATCH / NOT_RECOMMENDED /
VERIFY_ELIGIBILITY) · personalized opportunity brief · minimum-effective
action plan generator · validated application state machine · outcome
recording with sample-size-aware pattern detection · the priority queue
("My Opportunities") · duplicate and staleness detection.

**The recommendation is never an AI opinion.** It comes from a deterministic
table (`src/engines/recommendationEngine.js`) keyed by eligibility state,
fit band, readiness-gap size, and deadline urgency. An AI provider, if
configured, only rephrases the *already-decided* reasons into plainer
English, or proposes a capability match for requirement text the rule-based
matcher couldn't classify — it never decides eligibility, fit, or the
recommendation itself (spec section 66).

## Not built (P1/P2 — out of scope for this pass)

Resume-alignment scoring, opportunity-specific simulation content, TPO/
institutional dashboards, cohort intelligence, predictive forecasting,
automated multi-source scraping. The repository-pattern + engine-separation
architecture is meant to make these additive later rather than a rewrite.

## Configuration — keys left blank on purpose

Copy `.env.example` to `.env`. **Everything works with it left untouched:**
rule-based requirement matching and the in-memory store need no setup at
all. Fill in only what you're ready to use:

- `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic` — turns on the two optional
  AI-assist features described above (`src/ai/aiProvider.js`).
- `DATABASE_URL` — currently just a placeholder for when you wire in
  Postgres (see below); nothing reads it yet.

## Running it

```bash
npm install
npm test        # 10 tests: eligibility edge cases, full pipeline, recommendation matrix, state machine, patterns
npm run seed     # runs the entire OPPORTUNITY -> ACTION -> OUTCOME -> LEARNING loop and prints it
npm start        # http://localhost:4000 - demo UI + API on the same port
```

In the UI: **Seed demo data** to load the spec's own worked example
(a Backend Developer internship against a Software Developer target), or
**+ Add an opportunity** to try your own. Click any card in the queue to
open its case file — eligibility, fit by dimension, gaps, the
recommendation, an action-plan checklist, an application-status tracker,
and an outcome-recording form all live there.

## Verified, not just written

Every piece below was actually executed in the build sandbox, not just
authored:

- `npm test` passes 10/10, including a check that "in Computer Science"
  (a field of study) doesn't get misread as a location constraint, and that
  pattern detection needs ≥2 data points before flagging a bottleneck.
- `npm run seed` runs the full lifecycle and — using the demo's input data,
  not hardcoded output — independently reproduces the spec's own section-22
  example: **System Design** comes out as a *target gap* and **FastAPI**
  comes out as an *opportunity gap*, purely because FastAPI isn't in the
  Software Developer target's core capability list and System Design is.
- The HTTP API was exercised end-to-end with curl: seeding, analysis,
  action-plan generation, checklist completion, and a blocked invalid
  application-state transition (`APPLIED -> FINAL_STAGE`) all return the
  expected results.

## API surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/opportunities` | Ingest (manual entry today; same shape for a future feed/API) |
| GET | `/api/opportunities` | List |
| GET | `/api/opportunities/:id` | Raw opportunity + extracted requirements |
| POST | `/api/opportunities/:id/analyze` | Run eligibility + fit + gaps + recommendation for a student |
| GET | `/api/opportunities/:id/analysis/:studentId` | Cached brief |
| POST | `/api/opportunities/:id/action-plan` | Generate the minimum-effective plan |
| POST | `/api/opportunities/:id/action-plan/:studentId/items/:order/complete` | Check off a plan item |
| POST | `/api/opportunities/:id/simulate` | Feature 31 seam (`503` until connected) |
| POST | `/api/opportunities/:id/application` | Advance application status (validated) |
| GET | `/api/opportunities/:id/application/:studentId` | Current application status |
| POST | `/api/opportunities/:id/outcome` | Record a real outcome; runs pattern detection |
| GET | `/api/students/:id/opportunities` | Priority queue |
| GET | `/api/students/:id/opportunity-history` | Journey counts |
| GET | `/api/students/:id/patterns` | Bottleneck / strength detection |
| POST | `/api/demo/seed`, `/api/demo/run` | Load the worked example |

## Architecture

```
src/
  engines/       pure functions: normalization, requirement extraction,
                 eligibility, matching, gaps, recommendation, action-plan
                 generation, deadline/duplicate detection, outcome learning,
                 the application state machine
  services/      orchestration: wires engines + storage together
  integrations/  seams for PATH / ADAPT / Feature 31 / PROOF / FORECAST
  ai/            pluggable AI provider (rule-based default, optional Claude)
  db/            in-memory store (default) + schema.sql (Postgres reference)
  routes/        Express REST routes
  seed/          capability catalog + demo data
public/          vanilla HTML/CSS/JS frontend (served by the same Express app)
tests/           node:test suite
scripts/         end-to-end demo runner
```

Engines never touch storage directly, so swapping the in-memory store for a
real database, or a stub integration for a real service, doesn't require
touching the decision logic.

## Wiring into the real ACEAPT

1. **Database:** implement the functions exported by
   `src/db/memoryStore.js` against real tables (see `src/db/schema.sql` for
   the matching structure), and point `src/services/*.js` at that module
   instead.
2. **Student/Target/Capability data:** replace `src/seed/capabilities.js`'s
   `findCapabilityByText` and `TARGET_CORE_CAPABILITIES` with real lookups,
   and replace the student-profile fields in `memoryStore.js` with your real
   Student model's fields.
3. **PATH / ADAPT / Feature 31 / PROOF / FORECAST:** implement the two
   exports in each `src/integrations/*.js` file against the real service.
   Nothing else changes — every call site already branches on
   `isAvailable()`.
4. **AI:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` once you want
   the two optional AI-assist features turned on.
