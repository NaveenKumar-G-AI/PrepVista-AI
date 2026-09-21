# ACEAPT AI — Feature 44: Goal-Based Learning Engine

A standalone, runnable reference implementation, built the same way as the
earlier ACEAPT/CodeForge/PrepVista features in this series: no existing
repository was attached to this session, so rather than guess at your real
codebase's shape, this is a complete, independently-tested implementation
you integrate into it yourself. Every architectural decision Feature 44
needed to make on its own is written down below, and every "existing
system" it depends on (capability data, the learning system, the planner,
the readiness engine) is implemented as a swappable interface with a mock
behind it, so the real thing is a one-line change at the composition root
(`src/server.ts`).

**Stack:** Express + PostgreSQL (Row Level Security) on the backend,
React + Vite on the frontend, matching the stack used for the ACEAPT
Feature 13/PATH and CodeForge reference implementations earlier in this
project.

---

## 1. What "inspecting the repository" meant here

Section 5 of the brief asks Feature 44 to inspect Features 1–43 before
building. No repository was provided in this session, so this build
substitutes the same discipline in a different form:

- Every place Feature 44 needs something from an "existing system"
  (capability/diagnostic data, the learning system, the planner, the
  readiness engine) is expressed as a **named interface**, not a direct
  dependency — see §9.
- Nothing about Features 1–43's *internals* is assumed. Only their
  documented *outputs* are assumed (e.g. "capability data has a
  quant/logical/verbal score, an accuracy percentage, a speed band").
- Where the brief itself says "only use dimensions supported by existing
  ACEAPT data" (Section 20) or "do not invent a target" (Section 19),
  this implementation takes that literally: retention gap, transfer gap,
  and difficulty gap are explicitly reported as `unsupported` rather than
  computed from nothing (see `src/engines/gapEngine.ts`).

When you integrate this, the real work is swapping the mock clients in
§9 for real ones — the domain logic underneath does not need to change.

---

## 2. Repository layout

```
aceapt-feature-44/
├── db/
│   ├── setup_roles.sql        # creates the goal_app DB role (run once, superuser)
│   ├── migrations/*.sql       # schema + RLS, numbered, idempotent
│   ├── migrate.ts             # tiny framework-agnostic migration runner
│   └── seed.ts                # demo data (matches the spec's own worked example)
├── src/
│   ├── domain/types.ts        # the canonical shapes every layer agrees on
│   ├── engines/                # deterministic logic - no LLM, no I/O
│   │   ├── gapEngine.ts
│   │   ├── priorityEngine.ts
│   │   ├── targetResolver.ts
│   │   ├── healthEngine.ts
│   │   ├── feasibilityEngine.ts
│   │   └── progressEngine.ts
│   ├── integrations/
│   │   ├── capability/         # CapabilityDataClient interface + mock (Feature 43 stand-in)
│   │   └── ai/AnthropicClient.ts  # the ONLY file that imports the Anthropic SDK
│   ├── services/
│   │   ├── goalService.ts      # orchestrator - the only place engines are wired together
│   │   ├── milestoneService.ts
│   │   ├── aiExtractionService.ts    # Anthropic adapter + deterministic fallback
│   │   ├── explanationService.ts     # ditto, for prose explanations
│   │   ├── deterministicExtractor.ts # the fallback itself
│   │   └── handoffService.ts   # learning/planner/readiness payload builders
│   ├── repositories/           # SQL, one file per table family
│   ├── routes/goals.ts         # Express routes
│   ├── middleware/auth.ts      # JWT verify, with a dev-mode fallback (see §10)
│   ├── analytics/events.ts     # the exact event names from Section 59
│   └── server.ts               # composition root - swap mocks for real clients here
├── tests/
│   ├── unit/                   # engines, pure functions - no DB, no network
│   └── integration/            # live Postgres, live HTTP, live Anthropic API
└── frontend/                   # Vite + React + TS, see §8
```

---

## 3. Data model

See `db/migrations/003_goals.sql` for the authoritative schema. Summary:

- **`goals`** — one row per goal. Holds type, status, deadline, target
  (per-dimension + accuracy + speed), the *last computed* gap/priority
  snapshot (denormalized onto the row for fast reads), health,
  feasibility, confidence, and progress.
- **`goal_milestones`** — outcome-based (Section 10), generated from the
  goal's top priority at creation time, evaluated against real evidence
  (never a "mark done" button — see §6).
- **`goal_snapshots`** — append-only historical record (Section 11),
  written on every creation/recalculation/pause/resume. This is what
  before/after (Section 27) and health trend detection read from.
- **`goal_history_events`** — append-only audit log (Section 35) of
  every state transition.
- **`students`** and **`mock_capability_snapshots`** — stand-ins for
  tables Feature 44 does not own (see §9). Delete both when integrating;
  point `goals.student_id` at your real students table instead.

**A canonical model, not five.** The brief warns against `Goal` /
`StudentGoal` / `LearningGoal` sprawl (Section 6). There is exactly one:
`goals`.

### Row Level Security

Every student-owned table has `ENABLE ROW LEVEL SECURITY` **and**
`FORCE ROW LEVEL SECURITY`, with a policy keyed on a session variable:

```sql
USING (student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid)
```

The app connects as a dedicated non-superuser role, `goal_app`, that owns
none of the tables — RLS cannot be bypassed by accident the way it can
for a table owner or superuser. The session variable is set once per
request via `src/db/pool.ts`'s `withStudentContext()`, using
`SELECT set_config('app.current_student_id', $1, true)` — a bound
parameter, not a string-interpolated `SET LOCAL`. (An earlier ACEAPT
feature shipped a real bug from exactly that interpolation pattern; see
the project history. This build avoided it from the start rather than
re-discovering it.)

This is not just designed — it's tested live, through the real
application code path, in `tests/integration/rls.test.ts`: Student B
genuinely cannot read, update, or spoof-insert into Student A's rows,
and an unset session variable denies everything rather than defaulting
to "allow" (fail closed).

---

## 4. The deterministic core

Sections 21 and 49 are explicit: priority, gap, health, and feasibility
are **arithmetic**, never an LLM guess. Every engine in `src/engines/` is
a pure function — same input, same output, no I/O, no randomness.

| Engine | Input | Output |
|---|---|---|
| `gapEngine` | current capability, resolved target | per-dimension gap + classification (NONE/SMALL/MODERATE/LARGE), honestly marking anything unmeasurable as `UNKNOWN` and anything unsupported by name |
| `targetResolver` | goal type, student's explicit input, optional assessment benchmark | the actual target used, with a `sources` map recording *why* each field has the value it does (student input > assessment benchmark > goal-type benchmark > current+delta > left unset) |
| `priorityEngine` | gap, goal type, capability, days remaining | a ranked list with a full score breakdown per item, and a template-generated (not LLM-generated) `reason` string per item |
| `healthEngine` | status, snapshot history, days remaining | HEALTHY / IMPROVING / NEEDS_ATTENTION / AT_RISK / PAUSED / COMPLETED, with a reason built only from the numbers given |
| `feasibilityEngine` | ranked priorities, gaps, available time, days remaining | ON_TRACK / CHALLENGING / HIGHLY_CONSTRAINED / INSUFFICIENT_EVIDENCE, or **`null`** when there's no deadline (Section 47 — never invents urgency) |
| `progressEngine` | baseline, latest, target, per-dimension weights | outcome-based progress (capability closed, never `questions_done / total`) |

**Worked example fidelity.** `tests/unit/priorityEngine.test.ts` runs the
exact numbers from Section 22 (Quant 78 / Logical 51 / Verbal 72) and
asserts Logical ranks first — not because the test was written to match
the spec's prose, but because the underlying formula does.

**Time pressure changes the ranking, not just a label.** Section 16 says
a short deadline should favor high-impact/quick-win skills over raw gap
size. `priorityEngine` operationalizes this by having "days remaining"
shift weight from gap-size toward learning-opportunity (how fast a
dimension has historically improved per hour of practice) — tested in
`tests/unit/priorityEngine.test.ts`'s urgency case.

---

## 5. AI usage — exactly where the brief allows it, nowhere else

Section 49 draws a hard line: AI for language, never for numbers, dates,
state, or authorization. This build enforces that structurally, not just
by convention:

- **`src/integrations/ai/AnthropicClient.ts`** is the *only* file that
  imports `@anthropic-ai/sdk`. It has exactly two methods:
  `extractGoalFields` (forced tool-use, so the model cannot return
  free-form prose where structured fields are expected) and
  `polishExplanation` (rewrites an already-computed reason string —
  the system prompt explicitly forbids adding any fact not already in
  the input).
- **Extraction is never authoritative** (Section 13). `POST
  /goals/extract` returns a draft; nothing is persisted until the
  student confirms it through the normal `POST /goals` call.
- **A stated weakness is stored as stated, not as fact** (Section 14).
  `student_reported_weakness` and the real capability data are separate
  columns; nothing promotes the former into the latter.
- **AI failure never blocks goal creation** (Section 50). Both
  `AiExtractionService` and `ExplanationService` fall back to
  deterministic logic — a regex/keyword extractor and the engine's own
  reason string, respectively — on *any* failure: missing key, network
  error, timeout, or a malformed response.

That fallback path is tested against a **real 401 from the live
Anthropic API** (`tests/integration/aiExtractionFallback.test.ts` sets a
deliberately invalid key and lets the real HTTP round-trip fail), not a
mock. `ANTHROPIC_API_KEY` is blank in `.env.example` per your standing
instruction — the fallback path is what runs until you fill it in, and
it was built to be fully functional on its own, not a degraded stub.

---

## 6. A few decisions worth flagging explicitly

- **Milestones have no "mark done" endpoint.** They're evaluated against
  `target_state` evidence (`milestoneService.evaluate`) and only the
  server can move one to `ACHIEVED`. This is what makes
  `system_verified_complete` (Section 33) meaningful — it's tied to the
  final "Verification" milestone's evidence, not a flag a client can set.
- **`student_marked_complete` and `system_verified_complete` are
  genuinely separate columns.** `POST /goals/:id/complete` always
  records the student's click; it only flips `status` to `COMPLETED`
  when the Verification milestone actually has evidence behind it.
  Tested explicitly in `goalService.test.ts`.
- **Resuming a paused goal always recalculates** (Section 32) — `resume()`
  calls straight into the same `recalculate()` path a fresh performance
  update would use, rather than restoring whatever priority was cached
  before the pause.
- **Feasibility is `null`, not a guess, for open-ended goals** (Section
  47) and **`INSUFFICIENT_EVIDENCE`, not a guess, when there's no
  improvement-rate history yet** — both are distinct, honest states
  rather than a default.
- **"Already at target" is a first-class response field**
  (`alreadyAtOrAboveTarget`), not an afterthought — Section 34's "don't
  force more learning" case has its own UI state (see §8) rather than
  silently falling through to a 0%-progress goal screen.

---

## 7. API

All routes are mounted under `/api` and require a `studentId` on the
request (see §10 for how that's established). Response shapes mirror
`src/domain/types.ts` directly.

```
POST   /goals/extract              draft-only NL extraction (Section 13)
POST   /goals                      create
GET    /goals                      list (optional ?status=)
GET    /goals/:id
PATCH  /goals/:id                  title/description/availableTime/target adjustments
POST   /goals/:id/recalculate
POST   /goals/:id/pause
POST   /goals/:id/resume
POST   /goals/:id/complete         student-initiated; see §6
GET    /goals/:id/progress
GET    /goals/:id/health
GET    /goals/:id/milestones
GET    /goals/:id/history
GET    /goals/:id/snapshots
GET    /goals/:id/explanation      AI-polished when available, deterministic otherwise
GET    /goals/:id/handoff/learning   \
GET    /goals/:id/handoff/planner     > Sections 41-43 structured payloads
GET    /goals/:id/handoff/readiness  /
```

This adapts Section 51's route list rather than copying it verbatim, per
that section's own instruction ("do not blindly implement these exact
routes if existing conventions differ") — swap the path prefix and
casing to match your real API conventions when integrating.

---

## 8. Frontend

Vite + React + TypeScript, in `frontend/`. Design direction: an
**"Ascent"** visual language — a goal is a summit, a capability gap is
the distance still to climb, a milestone is a camp along the route. One
distinctive element carries that idea (the gap-map's vertical elevation
gauges in `GoalGapMap.tsx`, current fill vs. a dashed target line);
everything else — the dashboard hero, the creation flow, the milestone
list — stays quiet and gets out of its way, per Section 58's "do not
overdesign."

- **`GoalCreation.tsx`** — the "what are you trying to achieve" flow
  (Section 12): pick a type, or describe it in free text and let
  extraction fill in what it can, then a short, only-what's-missing
  constraints step (Section 15's "ask only the minimum useful question").
- **`GoalDashboard.tsx`** — the Section 37 hierarchy: goal, days
  remaining, progress/confidence/feasibility, today's priority with its
  reason, a Continue action, then gap/milestones as tabs.
- **`GoalGapMap.tsx`** / **`GoalMilestones.tsx`** — the two visualizations
  from Sections 38–39.

Dev-mode auth only — there's a plain student-id field, not a login
screen (see §10). Swap `useDemoStudentId` for your real session once
this is wired into ACEAPT's actual frontend shell.

---

## 9. Integration points (swap these, keep everything else)

| Interface | Mock in this build | Replace with |
|---|---|---|
| `CapabilityDataClient` (`src/integrations/capability/`) | Reads a `mock_capability_snapshots` table seeded with the spec's own example numbers | Feature 43's real client |
| Learning handoff (`buildLearningHandoff`) | Returns a structured payload; nothing consumes it | Wire the return value into the real personalized-learning system (Section 41) |
| Planner handoff (`buildPlannerHandoff`) | Same | Section 42 |
| Readiness handoff (`buildReadinessHandoff`) | Same | Section 43 |
| `students` table | A 2-column stub | Your real students/identity table — update the FK in `db/migrations/003_goals.sql` |
| `AnalyticsSink` (`src/analytics/events.ts`) | `ConsoleAnalyticsSink`, logs JSON lines | Your real analytics pipeline — the interface (and all 13 Section 59 event names) is already there |
| Auth (`src/middleware/auth.ts`) | Verifies a JWT if `JWT_PUBLIC_KEY_OR_SECRET` is set, otherwise accepts a dev-only `X-Student-Id` header | Your real auth middleware / session verification |

Nothing in `src/engines/` or `src/services/goalService.ts` references
any of the above directly — they're passed in at the composition root
(`src/server.ts`), so none of the intelligence layer needs to change
when you do this swap.

---

## 10. Running it

```bash
# 1. Postgres: create the app role, then the database
psql -f db/setup_roles.sql            # as a superuser
createdb aceapt_goals

# 2. Configure
cp .env.example .env                  # fill in DATABASE_URL / MIGRATION_DATABASE_URL
                                        # for your Postgres; leave ANTHROPIC_API_KEY
                                        # blank until you're ready to enable AI

# 3. Install, migrate, seed (seed is optional demo data)
npm install
npm run migrate
npm run seed

# 4. Run
npm run dev          # backend on :4044 (PORT in .env)
cd frontend && npm install && npm run dev   # frontend, separate dev server
```

**Auth in dev mode:** with `JWT_PUBLIC_KEY_OR_SECRET` unset, every
request needs an `X-Student-Id: <uuid>` header instead of a bearer
token — this is what let the whole stack be built and tested end-to-end
without a real auth service attached, and it's the frontend's demo
student-id field. It's refused outright the moment a real secret is
configured, so it cannot reach production by accident.

### Running the tests

```bash
npm test                    # backend: 65 tests (unit + live-Postgres integration)
cd frontend && npm test     # frontend: 1 real end-to-end test (spawns the actual
                             # compiled backend, drives the real UI through jsdom)
```

Both suites need a live Postgres reachable via `DATABASE_URL` /
`MIGRATION_DATABASE_URL` with migrations applied; the integration tests
create and clean up their own student fixtures, so `npm run seed` is
optional convenience data, not a test dependency.

---

## 11. Bugs found and fixed

Everything below was found by actually running the code — migrations
against a live Postgres, tests against a live database and a live (if
deliberately unauthenticated) Anthropic API, and the full stack through
a real browser-less DOM render — not by reading it back and reasoning
about it.

1. **`pause()` never updated `health`.** It flipped `status` to `PAUSED`
   but the `health` column was untouched by `updateStatus()`, so a
   paused goal kept showing whatever health it had before pausing.
   Fixed by extending `updateStatus()` to accept `health`/`healthReason`
   and having `pause()`/`markStudentComplete()` pass them explicitly.
2. **A seed fixture's own claim didn't match its data.** "Student B is
   already strong across the board" was true for 3 of 5 dimensions —
   `verbal` (74) and `data_interpretation` (68) were actually just below
   their PLACEMENT_READINESS benchmarks (75/70). The already-achieved
   code was working correctly; the fixture comment was wrong. Raised
   both values so the fixture genuinely represents the case it claims to.
3. **Two `\uXXXX` sequences rendered as literal text.** A unicode escape
   only means anything inside an actual JS string literal; placed as
   bare JSX children (e.g. `<div>\u2192{value}</div>`) it's just six
   characters of text. Found by the real DOM-render test asserting on
   visible text, not by type-checking (which is silent on this). Fixed
   by wrapping the escapes in string expressions or using HTML entities.
4. **Cross-test-file database pollution.** Two integration test files
   shared the same global seed students; Vitest runs files in parallel
   by default, and interleaved writes/deletes to those shared rows
   produced a nondeterministic "wrong priority" failure. Fixed by giving
   each integration test file its own dedicated, disposable student
   fixtures, plus `fileParallelism: false` as a second layer of safety
   for a live-database suite this size.
5. **A real React race condition.** The student-id input triggered a
   data refetch on every keystroke (the effect depends on `studentId`),
   so typing a UUID fired ~36 requests, most with invalid partial UUIDs.
   An out-of-order response could overwrite good state with a stale
   error. Fixed with UUID-format validation before fetching, plus a
   request-generation guard so only the response to the most recent
   request can update state. Found by the real end-to-end test, which
   types the id character-by-character the way a real user would.
6. **An off-by-one in "days remaining."** `computeDaysRemaining` compared
   a precise `Date.now()` against the target date's `23:59:59` cutoff
   and rounded up — so a goal created with "30 days from now" showed
   "31 DAYS REMAINING" at any time other than just before midnight.
   Fixed by comparing calendar dates at UTC midnight instead, which is
   insensitive to time-of-day; added `tests/unit/dateHelpers.test.ts` as
   a regression test covering every hour-of-day boundary that mattered.
7. **A `SET LOCAL` parameter-binding pitfall, avoided proactively.** An
   earlier ACEAPT feature in this project shipped a real bug from
   binding a parameter directly into `SET LOCAL`. This build used
   `SELECT set_config(..., $1, true)` from the start instead, which
   supports normal bound parameters — carried forward as a lesson rather
   than re-discovered as a bug.

No bugs were found in the deterministic engines themselves (gap,
priority, health, feasibility, progress) — their unit tests, including
the spec's own worked examples, passed on the first run and stayed
green through every later change.

---

## 12. What could not be verified in this sandbox

- **A real Anthropic API call's success path.** No credentials were
  available here, so `AnthropicClient.extractGoalFields` /
  `polishExplanation` are implemented against the current Messages API
  tool-use contract and covered by the *failure* path against the real
  API (§5), but the success path (a real model response parsed
  correctly) has not been exercised end-to-end. Worth a manual smoke
  test once you add a real key.
- **Integration against the real Features 1–43.** By construction (§1),
  everything upstream of Feature 44 is a documented mock. The contracts
  are real; the systems behind them are not.
- **Dev-tooling vulnerabilities.** `npm audit` reports 5 (3 moderate, 1
  high, 1 critical) — all transitive, all in `esbuild`/`vite`'s dev
  server via Vitest, none in production dependencies (`npm audit
  --omit=dev` reports zero). Fixing requires a Vitest major-version
  bump; left as a follow-up rather than risking the test suite this
  late, but worth doing before this sits untouched for long.

---

## 13. Delivery report

**Files created:** 29 backend TypeScript files (engines, services,
repositories, routes, integrations) + 6 SQL migrations + 2 DB scripts +
12 backend test files (65 tests) + 11 frontend files (6 components +
API client + types + entry point) + 1 frontend test (real end-to-end).

**Database:** 6 tables (`goals`, `goal_milestones`, `goal_snapshots`,
`goal_history_events`, plus `students`/`mock_capability_snapshots`
stand-ins), RLS on every student-owned table, applied and verified
against a live PostgreSQL 16 instance.

**API:** 17 REST endpoints under `/api`, validated with Zod, tested at
the HTTP layer against the actual compiled server.

**AI:** one Anthropic integration point for extraction, one for
explanation prose, both with tested deterministic fallbacks; zero LLM
involvement in any number, date, or state transition.

**Tests:** 65 backend (unit + live-Postgres integration + live-API
resilience) + 1 frontend (full real-stack end-to-end) = **66 passing**,
after finding and fixing the 6 real application/infrastructure bugs (plus
1 proactively avoided) listed in §11.

**Remaining risks:** the two items in §12, plus the general caveat that
this is a reference implementation built without your actual Features
1–43 — the integration seams (§9) are designed to make wiring the real
systems in a matter of swapping constructors at `src/server.ts`, but that
wiring itself is untested by definition until you do it.
