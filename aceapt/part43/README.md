# ACEAPT Feature 43 — Adaptive Diagnostic Engine

A standalone, tested reference implementation of the Adaptive Diagnostic
Engine described in the Feature 43 build prompt.

## Why this is standalone, and how that satisfies "don't duplicate"

The build prompt's non-negotiable rule is: **reuse existing student /
question / skill / scoring / assessment systems — extend, never duplicate.**
This session didn't have access to the real ACEAPT codebase to inspect and
extend directly. Building against an *assumed* schema or framework would
risk creating exactly the parallel system the spec forbids.

Instead, this engine is built with a **ports-and-adapters (hexagonal)
architecture**: `src/domain/ports.ts` defines the interfaces the engine
needs (`StudentRepository`, `QuestionRepository`, `SkillRepository`,
`DiagnosticSessionRepository`, `AnalyticsEventPublisher`) and the engine
(`src/engine/`) depends on nothing else — no Express, no ORM, no concrete
database. You implement thin adapters over your *real* Student, Question,
Skill, and Response models that satisfy these interfaces. Nothing about the
student, question, or scoring systems gets rebuilt; this is purely the new
adaptive-decision layer sitting on top, exactly as the spec describes it
("the adaptive intelligence layer sitting between student evidence and
personalized learning").

`src/infra/repositories/InMemoryRepositories.ts` implements every port for
local development and the test suite. **Grading also isn't duplicated**:
`submitResponse` takes `isCorrect` as an input, already computed by your
existing scoring system — this engine never grades an answer itself.

## Quick start

```bash
npm install
cp .env.example .env        # everything in it is intentionally blank
npm run dev                 # demo server on :4000, in-memory data
npm test                    # 42 tests, all passing
npm run build && npm start  # compiled build
```

The demo server has no real auth wired in — `src/api/middleware/auth.ts`
accepts an `x-student-id` header for local testing only. Try it:

```bash
curl -X POST localhost:4000/api/adaptive-diagnostics \
  -H "Content-Type: application/json" -H "x-student-id: demo" \
  -d '{"requiredDomains":["Quant","Verbal"],"minQuestionsPerDomain":1,"minQuestions":5,"maxQuestions":8}'
```

## Directory structure

```
src/
  domain/       types.ts, state.ts, ports.ts, dto.ts   - no framework/DB dependency anywhere in here
  engine/       the adaptive engine itself (see below)
  infra/        in-memory reference adapters + seed data - REPLACE for production
  api/          thin Express layer over the engine
  index.ts      demo server bootstrap
tests/
  unit/         direct tests of engine submodules
  integration/  full start->question->response->result loop tests
prisma/
  schema.prisma  the only new tables this feature should need
frontend/       reference React components for the student-facing loop
```

### engine/ files

| File | Responsibility |
|---|---|
| `constants.ts` | Every tunable threshold, named and commented — nothing is a magic number |
| `evidence.ts` | Capability model (ability/uncertainty update), response-time classification, per-response evidence updates |
| `informationValue.ts` | Fisher-information scoring of candidate questions |
| `signals.ts` | Coverage guardrails, exposure tracking, fatigue detection |
| `modeSelector.ts` | Decides Explore / Investigate / Verify / Challenge / Transfer and the target skill |
| `candidatePipeline.ts` | Pulls, filters, scores, and ranks candidate questions |
| `stoppingCriteria.ts` | Early / normal / extended / diminishing-returns stopping |
| `insights.ts` | The "Why" explanation and next-best-action generation |
| `AdaptiveDiagnosticEngine.ts` | The orchestrator — the only class the API layer calls |

## Integration checklist

To wire this into the real ACEAPT codebase:

1. **Implement the four repository ports** (`src/domain/ports.ts`) against
   your real Student, Question, Skill, and session-storage tables. Do this
   one at a time — you don't need to replace all of `InMemoryRepositories.ts`
   at once.
2. **Replace `src/api/middleware/auth.ts`** with your existing auth
   middleware. Delete the `x-student-id` header check before this goes
   anywhere near production.
3. **Decide what `Question.content` looks like** for your system — it's a
   deliberately opaque passthrough field (see `domain/types.ts`) that the
   engine never reads, only forwards, so your existing question-rendering
   UI keeps owning question content and rendering.
4. **Add the tables in `prisma/schema.prisma`** *if* your existing
   Assessment/Response models don't already cover them — check first; the
   schema's header comment calls this out explicitly.
5. **Fill in `.env`** as needed — every value in `.env.example` is blank on
   purpose.
6. **Restyle `frontend/`** against your real design system — see
   `frontend/README.md`.

## The capability model, honestly described

The engine uses a **simplified Rasch-derived (1-parameter IRT) online
update** (`src/engine/evidence.ts`), not a full Bayesian posterior or
3-parameter IRT model, and not a black box. Each response updates a
student's ability estimate by an amount proportional to how "surprising"
the outcome was (actual vs. predicted probability of success) and the
current uncertainty. The same model gives a closed-form, genuine notion of
**information value** — Fisher information, `p·(1-p)`, maximized exactly
when a question's difficulty matches the student's current ability — which
is what "prefer questions that meaningfully reduce uncertainty" (spec
section 17) actually means mathematically, not just as a slogan.

This was a deliberate scope decision. Spec section 99 explicitly warns
against implementing complex statistical machinery "because it sounds
impressive" without validating it first. A 1PL/Rasch-style model is
genuinely defensible with only a handful of interpretable constants (all in
`constants.ts`), while a full 2PL/3PL IRT fit or a proper Bayesian
posterior needs a real item-calibration dataset this session doesn't have.
**Upgrade path**: `evidence.ts` is the only file that would need to change —
everything else consumes `estimate` and `uncertainty` as opaque numbers
plus derived labels (`capabilityLabel`, `confidenceLabel`).

Capability and confidence are always reported as **labels**
(`unknown` / `emerging` / `developing` / `proficient` / `advanced`, and
`low` / `moderate` / `high` confidence), never as fake-precision percentages
like "63.72%" (spec section 36) — the underlying numbers exist internally
for ranking, but nothing external-facing claims that level of precision.

## The five modes

`modeSelector.ts` picks a mode and a single target skill per question, in
this priority order, with the reasoning for each documented in the file:

1. **Coverage guardrail** (hard constraint) — forces an under-covered
   required domain once the question budget is running out.
2. **Verify** — a skill with contradictory evidence gets resolved before
   any further conclusion is drawn about it.
3. **Explore** — a skill with zero evidence is investigated, never assumed
   weak.
4. **Challenge** — only once a skill has a confirmed, high-confidence,
   sustained correct streak *and* fluency isn't still an open question
   (see `needsSpeedCheck` below) does the engine push the difficulty
   boundary.
5. **Transfer** — a skill that's strong and confident on familiar items,
   but untested (or ambiguously tested) in an unfamiliar context.
6. **Investigate** (fallback) — whichever in-scope skill is furthest from
   the target evidence confidence, or has an open speed/rush/calibration
   flag, gets probed next.

A worked nuance from the spec (section 27): "correct but slow" doesn't
immediately confirm mastery. The engine flags `needsSpeedCheck` and routes
to **investigate** with one controlled-timing follow-up question — and
that flag blocks *both* challenge and transfer until it's resolved, since
neither "push harder" nor "test transfer" makes sense while fluency itself
is still in question.

## API reference

All routes are mounted under `/api` by `src/index.ts`; rename the base path
or the route strings in `src/api/routes.ts` to match your actual REST
conventions if they differ — nothing in `engine/` depends on this file's
shape.

| Spec operation | Method & path |
|---|---|
| `startAdaptiveDiagnostic` | `POST /adaptive-diagnostics` |
| `getNextAdaptiveQuestion` | `GET /adaptive-diagnostics/:sessionId/next-question` |
| `submitAdaptiveResponse` | `POST /adaptive-diagnostics/:sessionId/responses` |
| `getAdaptiveState` | `GET /adaptive-diagnostics/:sessionId/state` |
| `pauseAdaptiveDiagnostic` | `POST /adaptive-diagnostics/:sessionId/pause` |
| `resumeAdaptiveDiagnostic` | `POST /adaptive-diagnostics/:sessionId/resume` |
| `completeAdaptiveDiagnostic` | `POST /adaptive-diagnostics/:sessionId/complete` |
| `getAdaptiveResult` | `GET /adaptive-diagnostics/:sessionId/result` |
| *(addition)* explain a skill ("Why?", section 52) | `GET /adaptive-diagnostics/:sessionId/why/:skillId` |

Ownership/tenant isolation (spec section 67) is enforced **inside the
engine**, not just at the HTTP layer — every method after `startSession`
takes the requesting student's id and throws `EngineError('FORBIDDEN', ...)`
if it doesn't match the session's owner, regardless of which route called
it.

## What's tested (42 tests, 11 suites, all passing)

- **Unit**: the capability model's update rule and instability detection;
  every one of the spec's own worked examples for mode selection (sections
  75–80: the unknown-mixed-skill case, the all-correct-streak-triggers-
  challenge case, the alternating-answers-triggers-verify case, the
  correct-but-slow-blocks-challenge case, and a coverage-guardrail case);
  Fisher-information scoring and its mode/exposure/quality adjustments;
  stopping criteria (early, extended, diminishing-returns, fatigue-does-
  not-force-a-stop); coverage bookkeeping; fatigue detection.
- **Integration**: **the core adaptivity test from spec section 89** — two
  identically-seeded sessions diverge in their next question after a
  correct vs. an incorrect response, and the harder/easier direction is
  correct; determinism (spec section 90) — identical scripted responses
  produce an identical question sequence; a full start-to-result smoke
  test; the coverage guardrail holding under a tight question budget; bad-
  question exclusion (section 91) and non-immediate re-exposure (section
  92); and security/integrity (cross-student access rejected, stale/
  mismatched response submissions rejected, invalid pause/resume
  transitions rejected).

Run `npm test` to see all of it pass. The full API loop was also smoke-
tested over real HTTP (start → next-question → submit-response, plus the
401/403 checks) against the compiled build, not just through the test
harness.

## What's deliberately not built (and why)

Per spec sections 98–99 (P1/P2) and the explicit warning against
over-engineering: full IRT/Bayesian capability estimation, autonomous
diagnostic planning, and cross-session longitudinal intelligence are **not**
implemented. The architecture leaves room for all three (see "capability
model" above), but building them without real calibration data or usage
history to validate against would be exactly the "implement it because it
sounds impressive" mistake section 99 warns about. `historicalLabel` /
`initializedFromHistory` on `SkillEvidence` are the seam where cross-session
history plugs in once Feature 42 (or a real history store) is wired through
`StudentRepository`.

The frontend (`frontend/`) is a working reference for the loop, not a
finished, on-brand UI — see `frontend/README.md`.
