# ACEAPT Feature 46 — Socratic Teaching Mode

A stateful, evidence-driven Socratic tutoring engine: it asks the smallest useful
question, evaluates the *reasoning* behind a student's answer (not just whether
the final number is right), escalates help only as needed, and requires an
independent, novel verification before it calls anything "understood."

**Read this first — how this build was scoped.** The master prompt for this
feature assumes an existing ACEAPT codebase with Features 1–45/48 already
built (skill graph, hint intelligence, mistake intelligence, mastery, guided
solving, etc.) and asks Feature 46 to integrate with them. No such codebase
was provided in this session — there was nothing to inspect, map, or reuse.
So rather than fabricate integrations with systems that don't exist, this
ships as a **standalone, fully-working engine** with a clean adapter
("port") interface at every one of those integration points, backed by a
small local/mock implementation so the product runs end-to-end today. Swap
one file (`src/integrations/index.ts`) once you have the real services —
nothing else in the codebase needs to change. Every place this applies is
called out below and in code comments; nothing pretends to be more
integrated than it is.

## Quick start

```bash
npm install
cp .env.example .env       # everything can stay blank to start
npm run build && npm start # production
# or, for local dev with auto-reload:
npm run dev
```

Open `http://localhost:3000`. No API key, database, or auth provider is
required to try it — it runs entirely on deterministic templates until you
add an `ANTHROPIC_API_KEY`.

Run the test suite:

```bash
npm test
```

## Configuration (`.env`)

| Key | Purpose | Blank behavior |
|---|---|---|
| `PORT` | HTTP port | defaults to 3000 |
| `AUTH_MODE` | `dev` or `jwt` | `dev` reads `x-student-id` header, no real auth — **local/testing only** |
| `JWT_SECRET` | HMAC secret for `AUTH_MODE=jwt` | required only in `jwt` mode |
| `ANTHROPIC_API_KEY` | enables AI-assisted message rephrasing + teach-back second opinions | blank → deterministic templates only, nothing breaks |
| `ANTHROPIC_MODEL` | model id for the above | check `docs.claude.com` for the current id before deploying |
| `DATA_DIR` | where the reference file-backed store writes `store.json` | defaults to `./data` |
| `MAX_HINT_LEVEL` / `MAX_TURNS_PER_STATE` / `MAX_LOOP_BACKS` | teaching-policy tuning knobs | sensible defaults provided |

## How it works

```
STUDENT RESPONSE
      │
      ▼
DETERMINISTIC CLASSIFICATION  ──▶  CORRECT_REASONING / CORRECT_GUESS / PARTIALLY_CORRECT
      │                            MISCONCEPTION / INCORRECT / UNSURE / NO_RESPONSE …
      ▼
STATE MACHINE (pure function)  ──▶  next teaching state, with hard turn/loop caps
      │
      ▼
TEACHING POLICY  ──▶  ASK / HINT / EXPLAIN / VERIFY / REFLECT / COMPLETE / ESCALATE
      │
      ▼
CONTENT BUILDER  ──▶  deterministic message, optionally polished by AI
      │
      ▼
TUTOR TURN → student
```

A correct final number is **never** treated as understanding by itself
(sections 23–26 of the spec): a bare correct guess routes to
`GUIDED_REASONING` to elicit *why*, and only genuine reasoning, a passed
teach-back, and an independent + transfer verification mark a session
`COMPLETED`.

The one fully-worked domain is percentage base-value identification
(`QUANT.PERCENTAGES` — "which number is the original value"), including the
canonical "a % increase and % decrease cancel out" misconception, resolved
through a live contradiction experiment rather than being told it's wrong
(section 27/130). Additional objectives/skills can be registered by adding
new generators to `src/domain/questionBank.ts` following the same shape.

### Design choice: what the AI is allowed to decide

Every classification, state transition, and teaching-action decision in this
engine is **100% deterministic** (`src/domain/*.ts` — no network calls, fully
unit-testable). When `ANTHROPIC_API_KEY` is set, the AI is used for exactly
two narrow, validated things (`src/ai/client.ts`):

1. Rephrasing an already-decided tutor message so it reads more naturally —
   it must echo back the same `action`; any mismatch or malformed JSON is
   discarded in favor of the deterministic message.
2. A second, *only-more-generous* opinion on a teach-back answer — it can add
   criteria the keyword check missed, never remove one it caught.

This was a deliberate scoping decision, not a shortcut: it means the core
teaching logic behaves identically and testably whether or not AI is
configured, and an AI outage or bad response degrades to "slightly plainer
wording," never to "wrong pedagogy" (sections 66/67/93 of the spec).

## Where to plug in the real ACEAPT systems

All of these are interfaces in `src/integrations/adapters.ts` with a mock
implementation, wired up in `src/integrations/index.ts`:

| Spec feature | Port interface | What it should do for real |
|---|---|---|
| 45 — Aptitude Skill Graph | `SkillGraphPort` | prerequisite lookup + student skill state |
| 42 — Diagnostics | `DiagnosticsPort` | accuracy/speed profile |
| 43 — Adaptive Assessment | `AdaptiveAssessmentPort` | current difficulty |
| 44 — Goals | `GoalsPort` | active goal / priority skills |
| Mistake Intelligence | `MistakeIntelligencePort` | receives `misconception_detected:*` signals |
| 48 — Hint Intelligence | `HintIntelligencePort` | formal hint escalation (local hint ladder used until wired) |
| 36/37 — Mastery | `MasteryPort` | receives evidence on `COMPLETED`; **this engine never declares mastery itself** |
| Learning Path | `LearningPathPort` | priority updates |
| Daily Mission | `DailyMissionPort` | completion notifications |

## API

All routes are under `/api/socratic` and require the `authMiddleware` (see
Configuration). The active problem's answer is never included in the JSON
response while a session is `active` — only once it's `completed`,
`escalated`, or `abandoned`.

| Method & path | Purpose |
|---|---|
| `POST /sessions` | start a session |
| `GET /sessions/:id` | fetch a session + its turns (used to resume after a refresh) |
| `POST /sessions/:id/respond` | submit a free-text answer |
| `POST /sessions/:id/hint` | request the next hint level |
| `POST /sessions/:id/explain` | "just explain it" |
| `POST /sessions/:id/simplify` | a gentler restatement of the current problem |
| `POST /sessions/:id/solve-independently` | skip straight to an independent attempt |
| `POST /sessions/new-question` | start over with a fresh problem |
| `POST /sessions/:id/complete` | end early (marks `abandoned` if not already resolved) |

## Testing

```
tests/stateMachine.test.ts        pure state-transition logic, loop/cap guards
tests/responseClassifier.test.ts  deterministic classification, incl. prompt-injection text
tests/misconceptionLab.test.ts    the contradiction-experiment step machine
tests/hintEscalation.test.ts      the 0–6 hint ladder
tests/aiOutputValidator.test.ts   malformed/fenced/out-of-range AI output is safely rejected
tests/sessionEngine.test.ts       full worked sessions, misconception routing, anti-dependency,
                                   direct-explanation fallback, AI-unavailable fallback,
                                   ownership/security, optimistic-concurrency conflicts
```

38 tests, all passing. Beyond the automated suite, the full flow (including
the misconception experiment, direct-explanation path, hint ladder, and
every control endpoint) was also driven end-to-end against a real running
server over HTTP during development — that's how three real bugs were
caught and fixed before this was handed to you: a misconception detected
while in the `HINT` state used to be silently misrouted, the `CHECKPOINT`
pass-through state could get persisted instead of cascading forward, and a
multi-number reasoning sentence was graded against only the first number in
the text.

**Lighter coverage, by design:** the rate limiter and JWT auth path are
implemented and reviewed but not unit-tested (they're standard, well-known
patterns); true multi-instance concurrency (this reference store uses an
in-process write queue, not real DB transactions) is a known limitation, not
a tested guarantee.

## What's implemented vs. intentionally deferred

**P0 (section 114) — implemented:** session engine, explicit learning
objective, deterministic response analysis, purpose-tagged questioning
(`intent`/`targetStep` on every turn), adaptive hint/explain/simplify
escalation, misconception handling via contradiction experiment,
partial-understanding targeting without restarting, direct-explanation
fallback, embedded + final teach-back, independent verification, novel
transfer verification, secure ownership checks + optimistic concurrency,
mobile-responsive + accessible UI, AI fallback, automated tests.

**Interface-ready, backed by a mock (see table above):** Feature 45/42/43/44
integration, mistake/mastery/learning-path/daily-mission handoffs.

**P1/P2 (sections 115–116):** deliberately not built — transfer intelligence
beyond the one shipped domain, learning-style preferences, longitudinal
misconception graphs, voice/whiteboard modes, etc. The spec itself says not
to build speculative functionality for appearance; the adapter interfaces
above exist so P1 items can be layered on without restructuring anything.

## Known limitations

- One fully-worked skill domain (percentage base-value identification).
  Adding another means writing its own problem generator + misconception
  patterns, following `questionBank.ts` / `responseClassifier.ts` as a
  template — the state machine and policy layer are already skill-agnostic.
- The teach-back grader is a conservative keyword check; a correct
  explanation phrased very differently than expected may need the AI
  second-opinion path (or a retry) to be recognized.
- File-backed persistence is a correctness-safe reference implementation
  for one Node process, not a production database — see `db/schema.sql`
  for the intended relational shape and swap `SocraticRepository`.
- Rate limiting is in-memory per instance; use a shared store (e.g. Redis)
  once you run more than one instance.
