# ACEAPT — Feature 20: Adaptive Real-World Aptitude Simulation & Pressure Intelligence Engine

A standalone, full-stack reference implementation of Feature 20 from the ACEAPT
build spec: a realistic, timed, mixed-difficulty aptitude simulation that
measures not just *what a student knows* but *how they perform under real
test conditions* — question selection, time allocation, recovery after
mistakes, and performance drift across the test — then turns the worst gap
into a targeted drill and measures the before/after.

No existing ACEAPT repository was available to extend, so this ships as a
standalone module with its own backend, database schema, and frontend — the
same pattern used for the earlier Feature 8 and CodeForge AI builds in this
project. Wiring it into the main ACEAPT codebase means pointing its
`students` table (or the calls that reference `student_id`) at your real
user/auth system; everything else is designed to drop in as-is.

## Why it's a real backend, not just a frontend demo

The spec is explicit (§55, §59) that scoring must never depend on an LLM and
that answer keys must not be exposed during the exam. Both of those are only
actually enforceable with a server in the loop:

- **Scoring, the timer deadline, and TIME_EXPIRED vs SUBMITTED are all
  decided server-side**, from the database-recorded `started_at` timestamp —
  never from a client-reported total. A client cannot claim more time than
  the wall clock allowed. This is exercised directly in the live-replay test
  (see below): a session is backdated 20 minutes in the database and the
  server still correctly clamps it to the 18-minute budget and flags it
  expired.
- **Concept, difficulty, the correct answer, and the explanation are
  withheld from every API response until after submission.** A purely
  client-side build can't actually keep a curious student from opening
  devtools and reading the answer key out of the page's JS.

Everything else — the analytics engine, the drill selector, the state
machine — is plain deterministic TypeScript with no I/O, so it's unit
tested directly.

## Architecture

```
backend/
  src/
    domain/           question bank (hand-verified), blueprint config, tunable thresholds
    engine/            scoring, analytics, decision classifier, drill selector, state machine
                        — pure functions, no DB/AI, fully unit tested
    db/                schema.sql, migration/seed scripts, connection pool
    routes/            sessionService.ts (orchestration) + repository.ts (SQL) + api.ts (Express)
    ai/                Anthropic adapter (narrative + coaching) with a deterministic fallback
    tests/             vitest unit tests (45 tests)
  scripts/
    liveReplay.ts      full HTTP replay against a real running server + Postgres (31 checks)
frontend/
  src/
    components/        IntroScreen, TestRunner, ProcessingScreen, ReportScreen,
                        DrillIntroScreen, ImprovementScreen
    lib/                typed API client, shared types, formatting helpers
```

### The core loop this implements

`Intro → 15Q/18min simulation (timer, palette, skip/mark/review) → Processing
→ Performance Intelligence report (score, accuracy, speed/selection profile,
biggest time leak with an opportunity-cost estimate, segment-by-segment
accuracy chart, question-by-question post-mortem, AI coaching Q&A) → a
targeted 4-question drill chosen from that specific evidence → Improvement
comparison.` This is the spec's §45/§65 "one excellent vertical slice," not
the full 69-section architecture — see **Scope decisions** below for what
was deliberately left out and why.

## Running it

Requires Node 20+ and a Postgres 14+ server.

```bash
# 1. Database
createdb aceapt_feature20   # or: psql -c "CREATE DATABASE aceapt_feature20;"

# 2. Backend
cd backend
cp .env.example .env        # fill in DATABASE_URL at minimum
npm install
npm run migrate             # applies schema.sql
npm run seed                # loads the 15 main + 10 drill questions, one demo student, the main blueprint
npm run dev                 # http://localhost:4020

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and take the simulation.

**ANTHROPIC_API_KEY is intentionally left blank in `.env.example`, as
requested.** The AI-generated "Test Story" narrative and the coaching Q&A
both work with no key at all — they fall back automatically to the
deterministic templates in `src/ai/fallbackNarratives.ts`, which are built
entirely from the same evidence object and are never empty or broken. Add a
real key later to switch on the actual model-generated narrative; nothing
else needs to change.

## Testing

```bash
cd backend
npm run test        # 45 unit tests — scoring, analytics, decision classifier,
                     # drill selector, state machine, AI-adapter fallback path.
                     # No DB or network needed.

npm run test:live   # Full HTTP replay against a REAL running server + Postgres.
                     # Requires `npm run dev` (or `npm start`) running in another
                     # terminal, migrated and seeded.
```

`test:live` scripts an entire realistic session by hand — a strong start,
one badly overinvested question (220s on a single hard question, mirroring
the spec's own "3m42s on one question" example), two more misses each
followed by a full recovery, one question deliberately never reached, then
a drill and an improvement comparison — and asserts against **numbers
hand-derived independently before the script was run** (worked through in
the file's comments): exact score (9.25/15), accuracy (77%), which question
gets flagged as overinvested, the exact "two questions consumed 41% of your
total test time" headline, a 100% recovery rate, 80% post-error accuracy,
which segment shows the mid-test dip, and the one deliberate navigation
jump. It also directly backdates a
session's `started_at` in the database to prove server-side expiry can't be
bypassed by the client. All 31 checks pass against the live stack.

## Scope decisions (read this before extending)

Being upfront about what's real, what's a placeholder, and what's out of
scope on purpose:

- **Reasoning, Retention, and Transfer scores are not included anywhere in
  this evidence object**, even though the spec's own example judge screen
  (§47) shows them alongside this feature's metrics. That data comes from
  Features 18 and 19, which don't exist in this standalone build — showing
  a "Reasoning: Strong" badge with nothing real behind it would be exactly
  the fabricated-evidence problem the spec repeatedly warns against (§32,
  §56, §57). The evidence schema and the AI system prompts are written so
  those fields can be added later without restructuring anything.
- **The question bank is a hand-authored, hand-verified 15+10 seed set**,
  not Feature 17's generation engine. Every answer key was independently
  worked through before being encoded (see comments in
  `domain/questionBank.ts`) and cross-checked again by the live-replay
  test's hand-derived expected values. Swap `seed.ts` for a call into
  Feature 17 when that exists.
- **Auth is a single demo `students` row**, not a real user system — every
  session ties to `student_id`, so pointing that at your real users is a
  narrow, mechanical change (see `getOrCreateDemoStudent` in
  `db/repository.ts`).
- **Adaptive difficulty (spec §25) is not implemented.** The blueprint is
  fixed, matching the explicit prototype scope in §45/§64 ("prioritize one
  extremely polished experience"). The blueprint schema already supports
  multiple named blueprints, so a harder/easier variant is a data change,
  not a code change.
- **The "top-two-time-share" selection-quality thresholds are calibrated for
  the 15-question main blueprint specifically** (documented in
  `domain/constants.ts` and directly covered by a unit test) — they're not
  meaningful at a very different question count, which is why drills don't
  reuse those particular fields.
- Client-reported per-question time (which question a student is actively
  looking at) is, like any browser-based test platform, inherently
  client-observed — only the overall deadline and the correctness-based
  score are strictly server-enforced and un-gameable.

## API summary

`POST /api/sessions` start · `GET /api/sessions/:id` resume state ·
`POST /api/sessions/:id/{navigate,answer,clear,mark}` exam actions ·
`POST /api/sessions/:id/submit` finalize (server-clock authoritative) ·
`GET /api/sessions/:id/report` evidence + narrative + question review ·
`POST /api/sessions/:id/coach` grounded Q&A · `POST /api/sessions/:id/drill`
spawn a targeted drill · `GET /api/sessions/:id/improvement` drill vs.
original comparison · `GET /api/mock-history` longitudinal trend (spec §35).
