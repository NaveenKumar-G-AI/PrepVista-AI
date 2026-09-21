# ACEAPT Feature 31 — Readiness Simulator

> Don't wait for the real opportunity to discover your weakness. Experience it now.

This is a working **P0 vertical slice** of the Readiness Simulator spec: a target-aware
simulation engine that runs a realistic, multi-stage, timed evaluation; scores it
deterministically; detects where readiness breaks; turns that into evidence; and feeds
the evidence into PATH (bottleneck) and ADAPT (next-best-action) — with a real loop back
to re-simulation. Every number on every screen is computed from something that actually
happened in an attempt. Nothing is hardcoded for the demo.

No existing ACEAPT codebase was provided, so this ships as a **standalone, self-contained
app** with its own minimal versions of the entities Feature 31 depends on (Student,
Target, Capability, PATH, readiness). Every one of those is built behind an interface
specifically so it's a swap, not a rewrite, once the real services exist — see
[Architecture](#architecture) and [Data model](#data-model--production-swap-in).

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — see "Environment variables" below
npm run dev
```

Open `http://localhost:3000`. A demo student and the "Software Developer" target are
auto-seeded on first request — there's no login and nothing to configure to try it.

`npm run build && npm run start` for a production build. `npm run typecheck` for a fast
type-only check.

## Demo walkthrough

This reproduces the spec's own Startupthon demo (§67), end to end, with real evaluation
— nothing here is scripted or faked:

1. Open `/` — target is **Software Developer**, no PATH evidence yet.
2. Go to **Simulations**, open the realistic simulation, read the rules, **Start**.
3. Answer the 5 stages (Foundations → Applied → Timed Transfer → Decision → Wrap-Up).
   Answer the **Timed Transfer** stage badly on purpose (guess) and everything else
   carefully — this reproduces the spec's "74%, bottleneck: Timed Transfer" narrative.
4. Result page: **Simulated Readiness**, evidence confidence, failure-point timeline,
   readiness matrix, "why did performance drop," "what would have happened,"
   next-best-action.
5. Go to **Path** — the bottleneck is now Timed Transfer, with a reason grounded in the
   actual stage accuracy, and a next-best-action.
6. Run the simulation again, this time answering Transfer well too. Readiness goes up,
   the bottleneck clears, and **Path** shows a logged history entry explaining exactly
   why it changed — because the evidence changed, not because a timer or a script said so.
7. **History** shows both attempts on a trend line and lets you select two to compare
   dimension-by-dimension.

I verified this full loop (including the timer-expiry / partial-completion / evidence-
exclusion / target-switching edge cases) by scripting real HTTP calls against the running
app, not just by reading the code — see `usedAsEvidenceReason`, `not_reached` stage
verdicts, and the idempotent `/complete` behavior in the source if you want to see where
that shows up.

## Architecture

Follows the spec's own layering (§70) exactly — each layer is a real module, not a
comment:

```
TARGET / CONTENT           src/lib/content/{targets,item-bank,simulations}.ts
        ↓
BLUEPRINT ENGINE           src/lib/engines/blueprint-engine.ts
        ↓
SIMULATION RUNTIME         src/app/attempts/[attemptId]/run + api/attempts/*/respond
        ↓
EVENT CAPTURE              repository.appendEvent (append-only log)
        ↓
EVALUATION ENGINE          src/lib/engines/evaluation-engine.ts   (deterministic)
        ↓
EVIDENCE ENGINE            src/lib/engines/evidence-engine.ts
        ↓
READINESS ENGINE           src/lib/engines/readiness-engine.ts
        ↓
PATH ENGINE (stand-in)     src/lib/engines/path-engine.ts
        ↓
ADAPT ENGINE (stand-in)    src/lib/engines/adapt-engine.ts
        ↓
PROOF                      readiness-engine sets `proofRecommended`; Proof itself
                            is out of scope (§27 — a simulation shouldn't self-verify)
```

Two engines are explicitly **local stand-ins**, not attempts to reimplement Feature 30 /
ADAPT (spec §26 is explicit about not duplicating that logic here):

- `path-engine.ts` — `recalculatePath(studentId, targetId)` is the one call site the
  `/complete` route uses. Point it at a real PATH service later and nothing else changes.
- `adapt-engine.ts` — `recommend(capabilityId)` is a small deterministic rule table, not
  adaptive-learning content. Same swap story.

**AI is optional and cosmetic, never authoritative** (spec §39/§71). `src/lib/ai/debrief.ts`
adds a personalized paragraph to the result page *if* `ANTHROPIC_API_KEY` is set — every
score, verdict, readiness number, and explanation on that page is already fully computed
by the deterministic engines before this function is ever called. Delete the key and the
product is 100% unaffected except for that one paragraph disappearing.

## Data model & production swap-in

`src/lib/db/schema.ts` defines every entity from spec §41–44 (Simulation,
SimulationBlueprint, SimulationAttempt, SimulationEvent, SimulationResult,
SimulationEvidence) plus the minimal Student/Target/Capability/PathState this slice
depends on. Nothing here was invented ad hoc — it's a direct typed model of those
sections.

There's no existing ACEAPT database to inspect (spec §41 asks to extend one if it
exists), so persistence is a **JSON-file store** (`src/lib/db/store.ts`) behind a
**repository** (`src/lib/db/repository.ts`). This was a deliberate MVP choice, not a
shortcut taken silently: it means the whole app runs with zero external services, and I
could verify the entire loop by actually running it rather than trusting untested code.

To move to a real database, only `store.ts` needs to change — every engine and API route
already calls `repository.ts`, never the store directly. Swap `readCollection` /
`writeCollection` for a Postgres/Prisma client with matching per-entity functions and
nothing above that line moves.

Target/Capability/Simulation/Item content lives in `src/lib/content/` as code, not
mutable records — that's intentional (spec §38: source from existing content
infrastructure). A real deployment would point these at ACEAPT's actual content system
instead.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Aggregated view for the home page |
| GET | `/api/simulations` | List simulations for the current target |
| GET | `/api/simulations/:id` | Simulation brief (rules, stages, duration) |
| POST | `/api/simulations/:id/start` | Generate a blueprint, create an attempt |
| GET | `/api/attempts/:id` | Current runtime state (sanitized — no answer keys) |
| POST | `/api/attempts/:id/respond` | Submit the current item, server-timed & idempotent |
| POST | `/api/attempts/:id/complete` | Run evaluate → evidence → readiness → PATH pipeline |
| GET | `/api/attempts/:id/result` | Fetch the persisted result |
| GET | `/api/history?compare=a,b` | Attempt history + trend + optional comparison |
| GET | `/api/readiness` | Readiness snapshot for the current target |
| GET | `/api/path` | Current PATH state + forecast projection |
| GET/POST | `/api/student/target` | List targets / switch the demo student's target |

## What's built (P0) vs. deferred (P1/P2)

Built end-to-end, matching spec §63:

Target integration · blueprint engine · realistic multi-stage runtime · server-side
timed execution · real performance capture (event log + responses) · deterministic
evaluation · failure-point detection · readiness estimate + evidence confidence ·
next-best-action · PATH integration · ADAPT integration · simulation history · premium
result experience.

Also built, because the data model made them cheap once P0 existed (spec §64 P1 items):
attempt comparison, a second target (Data Analyst, proving this isn't hardcoded to one
simulation), and an honest forecast projection.

Deliberately **not** built, per the spec's own "don't overbuild" instruction (§65/§66)
and P1/P2 prioritization:

- Per-item adaptive difficulty (P1 §16) — level is fixed per blueprint instead.
- Deep interactive interview simulation with dynamic AI follow-ups (P1 §19) — the
  decision/wrap-up stages capture the same *spirit* (recovery, communication) without a
  standalone conversational engine.
- Cohort/institution dashboards, trainer intervention, multi-target weighting, advanced
  proctoring (all explicitly P2, §65).

## Known MVP simplifications (stated plainly, not hidden)

- **One demo student, no login.** `src/lib/auth.ts` is the single seam — every route
  already asks "who is the current student" instead of assuming, so real auth is a
  one-file change, not a refactor.
- **Per-item timing is server-timestamped but single-writer.** The server records when
  each item was handed out and computes elapsed time itself (never trusts a client
  clock for scoring), but there's no distributed-lock layer — fine for an MVP, worth
  revisiting before high-concurrency production use.
- **Communication capability has no numeric rubric.** It's tracked as a capability and
  shows up in ADAPT recommendations, but is deliberately left out of the weighted
  readiness formula — grading free text as if it were objectively scored would be the
  kind of fabricated precision spec §39/§62 rules out.
- **Free-response answers aren't graded for correctness anywhere** — only for
  completion, and optionally referenced by the AI debrief. This is intentional, not a
  gap: the spec is explicit that AI must never become the source of truth for
  correctness.

## Environment variables

See `.env.example`. Everything is optional — the app is fully functional with no `.env`
file at all.

```
ANTHROPIC_API_KEY   optional — powers the personalized result-page debrief only
ANTHROPIC_MODEL     optional — defaults to claude-sonnet-5
DATA_DIR            optional — where the JSON store writes its files (default ./data)
```
