# CodeForge AI — Debugging Coach — Final Engineering Report

Every line in this report describes something actually run in this session
(commands, test output, a live local Postgres instance) — not something
inferred or assumed. Where something couldn't be verified, it's marked
BLOCKED or PARTIALLY IMPLEMENTED and the reason is stated plainly.

## Status summary

**IMPLEMENTED** — next-best-action engine, information gain, hypothesis
engine (quality scoring, refinement, lifecycle), phase model, trial-and-error
detection, progressive coaching ladder with server-enforced ceiling, AI
provider abstraction + prompt templates + output-schema validation,
AI/deterministic boundary enforcement, prompt-injection detection, rate
limiting, DB schema + RLS (verified live), repository layer with ownership
enforcement, API handler layer, postmortem generation, skill-signal
aggregation, observability event shapes, frontend panel component, unit +
integration + end-to-end tests, AI-unavailable fallback path.

**PARTIALLY IMPLEMENTED** — experiment-quality coaching (the cycle is
captured structurally; design-quality scoring per Section 16's criteria
isn't automated), root-cause/fix coaching depth (preconditions are enforced;
the multi-step Socratic ladders in Sections 24/26 aren't separately modeled
beyond the phase's canonical question), student-skill adaptation (a ranking
nudge exists; there's no logic that updates skill level from accumulated
signals over time — deferred per Section 32's own instruction not to build
the Skill Signal Engine), hidden-information protection and prompt-injection
resistance (the defenses are implemented and unit-tested; there was no live
model to red-team against), security testing (RLS/IDOR verified live;
several Section 51 attack categories aren't applicable or testable without
real infra — see Known Limitations).

**BLOCKED** — inspecting/integrating the actual CodeForge AI repository,
Feature 22 integration, Features 16–21 integration, live Groq/Gemini
verification. All blocked by the same root cause: no repository, credentials,
or live infrastructure were available in this environment (confirmed by
listing `/mnt/user-data/uploads`, which was empty).

**NOT IMPLEMENTED** — overfitting detection (Section 29 — needs a hidden-test
evidence channel this module was never given a real source for), any logic
that actually mutates `studentSkill.level` over sessions, multi-language
runtime-specific handling (nothing here is language-specific, so there was
nothing to restrict, but nothing was verified across languages either), the
future Skill Signal Engine itself (explicitly out of scope per Section 32).

## Architecture discovered

None. Step 2 of the spec ("inspect the actual codebase") could not be
performed — there was no CodeForge AI repository attached to this
conversation.

## Architecture implemented

A layered TypeScript package, framework-agnostic at the edges:

- **`domain/`** — pure, deterministic, no I/O. This is where Sections 4–36's
  actual logic lives: phase transitions, the next-best-action ranking
  algorithm, hypothesis quality/lifecycle, trial-and-error detection, the
  progressive coaching ladder, skill signals, postmortem assembly.
- **`ai/`** — the only layer that talks to an LLM. Enforces the boundary from
  Sections 38/40: the deterministic engine always computes a ranked,
  safety-gated candidate list first; the AI can only pick among it and write
  the coaching language, never invent an action, never exceed the
  coaching-mode's level ceiling.
- **`security/`** — prompt-injection detection/wrapping, rate limiting.
- **`db/`** — SQL migration + a repository interface (ports-and-adapters) so
  domain/API code never touches a specific database client directly.
- **`api/`** — framework-agnostic handler functions enforcing ownership,
  rate limits, and the hard preconditions the spec calls out explicitly
  (e.g., a root cause requires a supported hypothesis; a fix requires a root
  cause; a postmortem requires the session actually being RESOLVED).
- **`frontend/`** — one React panel component.

## Files created

34 files, 0 modified (fresh project — nothing existed to modify).

```
src/types.ts                                     387 lines
src/domain/phase-model.ts                        152 lines
src/domain/next-best-action.ts                   335 lines
src/domain/hypothesis-engine.ts                  181 lines
src/domain/coaching-progression.ts               124 lines
src/domain/skill-signals.ts                       87 lines
src/domain/postmortem.ts                          87 lines
src/ai/output-schema.ts                           68 lines
src/ai/providers.ts                              128 lines
src/ai/prompts.ts                                 89 lines
src/ai/orchestrator.ts                           151 lines
src/security/prompt-injection-guard.ts            55 lines
src/security/rate-limiter.ts                      60 lines
src/db/migrations/001_debugging_coach_schema.sql 223 lines
src/db/repository.ts                             136 lines
src/api/handlers.ts                              434 lines
src/observability/metrics.ts                      52 lines
frontend/DebuggingCoachPanel.tsx                 546 lines
tests/*.ts (12 files)                          1,506 lines total
README.md, ENGINEERING_REPORT.md, package.json, tsconfig.json,
vitest.config.ts, .env.example, .gitignore

src/ total: 2,526 lines
```

## Database changes

`src/db/migrations/001_debugging_coach_schema.sql`: 6 new tables
(`debugging_coach_state`, `_hypotheses`, `_experiments`, `_events`,
`_recommendations`, `_reflections`), indexes on every foreign key and on
commonly-filtered columns, an `updated_at` trigger on the two mutable
tables, and RLS policies on all six. Ownership lives only on
`debugging_coach_state.user_id`; every child table's policy checks ownership
via a join back to the parent rather than trusting a `user_id` column of its
own (there isn't one to spoof).

**This was actually run against a live PostgreSQL 16 instance** installed in
this sandbox for the purpose (`apt-get install postgresql`), with a minimal
stub of Supabase's `auth.uid()`/`auth.users` so the RLS policies could be
tested the way they'd really run. Verified, in order:

1. The migration applies cleanly with `psql -v ON_ERROR_STOP=1`.
2. A student can create their own coach-state row.
3. A student **cannot** insert a row claiming another user's `user_id` (RLS
   `with check` rejects it).
4. A second student's `SELECT` on the table returns **zero rows** of the
   first student's data.
5. The superuser view confirms the row genuinely exists (RLS is hiding it,
   not the data being absent).
6. A student can attach a hypothesis to their own coach-state.
7. A second student's attempt to attach a hypothesis to the first student's
   coach-state — **using the real UUID directly**, not discovered through a
   filtered query — is rejected by the child table's own `with check`
   policy. This specifically exercises the IDOR scenario Section 51 calls
   out by name.

All seven checks passed. The test database was dropped afterward; nothing
persists from this verification.

## APIs

Framework-agnostic handler functions in `src/api/handlers.ts`:
`getCoachState`, `getCoachHistory`, `initCoachSession`, `recordEvidence`,
`recordStudentAction`, `submitHypothesis`, `updateHypothesisStatus`,
`recordExperiment`, `recordRootCause`, `proposeFix`, `markFixApplied`,
`recordRegressionResult`, `requestGuidance`, `requestPostmortem`. Every
handler takes `userId` from an explicit `HandlerContext`, never from a
request body.

## Frontend changes

One component, `frontend/DebuggingCoachPanel.tsx`: a vertical phase rail (a
real sequence, so positional markers are earned per the design skill's own
caution against decorative numbering), a hypothesis board with status chips,
and a coach callout showing the current question/reason/recommended action.
Two accent colors intentionally separate "evidence" (amber) from
"hypothesis" (cyan) so the color coding teaches the mental model rather than
decorating it. Accessible (visible focus rings, `aria-live` on the coach
callout, `aria-current` on the active phase, `prefers-reduced-motion`
respected) and responsive down to mobile (rail collapses to a horizontal
strip under 720px). Type-checked against real `@types/react` — see Tests.
Sample data included for standalone preview; real usage means feeding it
state from `GET` coach-state and wiring the two callback props to
`submitHypothesis`/`requestGuidance`.

## AI integration

`GroqProvider` and `GeminiProvider` (OpenAI-compatible chat-completions
shape for Groq, `generateContent` REST shape for Gemini), a `FakeProvider`
for tests, and a `FallbackProvider` that tries providers in order. System
prompt encodes the closed action taxonomy, the injection-defense rule, and
the required JSON output shape; user prompt sends only compact structured
context (current phase, live hypotheses, recent experiments, top-ranked
candidates) — never the whole repository or session. Output is validated
with Zod against the exact action taxonomy; anything that fails validation,
recommends an action outside what was offered, or throws/times out falls
back to the deterministic engine's own top pick with a templated question.

## Next-best-action engine

`src/domain/next-best-action.ts` — the component the spec calls "central."
Scores every candidate action on information gain, evidence availability,
phase fit, cost, and a small skill-level adjustment, minus a repetition
penalty for anything recently recommended without new evidence. Hard safety
gates (not just down-ranking) block `APPLY_FIX` before a root cause or
supported hypothesis exists, and `RUN_REGRESSION` before a fix is proposed.
A real bug was caught and fixed here during testing: `ISOLATE_FUNCTION` was
originally in both the "high information gain" set and the "broad/low
information gain" set, so the high-gain branch always won and the low-gain
branch was unreachable dead code — see `next-best-action.test.ts`.

## Hypothesis engine

`src/domain/hypothesis-engine.ts` — a deterministic quality heuristic
(specificity, testability, evidence connection, falsifiability) tested
directly against the spec's own worked examples ("Something is wrong with
the loop" scores below 0.45; "The loop terminates before the final valid
element" scores meaningfully higher). A full lifecycle state machine
(`PROPOSED → TESTING → {SUPPORTED, REJECTED, INCONCLUSIVE, ABANDONED}`), a
`wasGoodFaithRejection` helper so a well-formed hypothesis disproven by real
evidence isn't penalized (Section 11), and `selectDistinguishingTarget` for
choosing an experiment that separates competing hypotheses (Section 13).

## Experiment engine

Captured as the `Experiment` type + `recordExperiment` handler + the
`debugging_coach_experiments` table — the
hypothesis→expected-observation→actual-observation→interpretation cycle from
Section 15. What's *not* automated: judging experiment design quality
against Section 16's criteria (isolates one variable, minimizes unrelated
changes) — that's presently only an implicit side effect of which actions
the ranking engine surfaces, not a separate scored check.

## Security controls

- **Prompt injection**: pattern-based detection (`scanForInjection`) plus
  explicit untrusted-content wrapping (`wrapUntrusted`) used in every prompt
  that includes student text. Tested against real injection phrasing and
  against ordinary debugging sentences that share vocabulary with those
  patterns ("the file system call", "ignore the edge case") to check for
  false positives.
- **Rate limiting**: interface + in-memory reference implementation (explicitly
  documented as dev/test-only — swap for your project's real, likely
  Redis-backed limiter in production). A real bug was caught here too: the
  original implementation always admitted the first request in a fresh
  window regardless of the configured limit, so `limit=0` incorrectly
  allowed one request through. Fixed and covered by a regression test.
- **Ownership**: enforced independently at two layers — the in-memory
  repository throws `ForbiddenError` on cross-user access (unit-tested), and
  Postgres RLS enforces the same boundary at the database layer (verified
  live, see Database changes).

## RLS

See Database changes above — this is the one piece of the spec verified
against real infrastructure rather than only unit-tested.

## Observability

`src/observability/metrics.ts`: typed event shapes (`coach_request_latency`,
`ai_latency`, `provider_failure`, `action_selected`, `hint_escalation`,
`hypothesis_refinement`, `resolution`, `regression_detected`,
`session_completion`) plus a console sink and an in-memory sink for tests.
Every event is identifiers/counts/enums only — no source code, hypothesis
text, or coaching-question content, per Section 47.

## Tests

**115 tests, 12 files, all passing**, run in this session (not claimed from
memory):

```
tests/handlers.test.ts                    19 tests
tests/golden-scenario.test.ts              2 tests
tests/hypothesis-engine.test.ts           16 tests
tests/skill-signals-and-postmortem.test.ts 8 tests
tests/next-best-action.test.ts             8 tests
tests/phase-model.test.ts                 15 tests
tests/orchestrator.test.ts                 8 tests
tests/coaching-progression.test.ts        12 tests
tests/repository.test.ts                   9 tests
tests/security.test.ts                     8 tests
tests/output-schema.test.ts                7 tests
tests/observability.test.ts                3 tests
```

Also run clean: `tsc --noEmit` on the full backend (strict mode,
`noUncheckedIndexedAccess`), and a separate real `tsc --noEmit` + `esbuild`
pass on the React component with actual `@types/react` installed (not just a
syntax check). Three genuine bugs were found and fixed by these checks, not
by inspection — noted throughout this report and in code comments at each
fix site.

## Security tests

From Section 51's attack list — tested live: **RLS bypass, IDOR**. Tested
via unit tests: **prompt injection**, **action-taxonomy manipulation** (AI
recommending an out-of-taxonomy or out-of-candidate action),
**oversized/hallucinated target injection** (AI proposing a target that
doesn't match any real candidate). Not applicable to this module or not
testable without live infra: session takeover (owned by your auth layer, not
this module), hidden-test/reference-solution extraction (no such data exists
in this module to extract — the system prompt refuses to discuss it, but
there was no live model to adversarially confirm that against), AI-provider
abuse, oversized context, malicious code comments, sandbox abuse (all
properties of Feature 22's execution sandbox, outside this module's
boundary per Section 1).

## End-to-end tests

`tests/golden-scenario.test.ts` runs Section 50's full scenario twice through
the real handler/repository/orchestrator stack: once with a scripted
well-behaved fake AI, once with **no AI provider at all**, confirming the
session still reaches `RESOLVED` and produces a complete postmortem on the
deterministic engine alone.

## Environment variables

All blank per instruction, in `.env.example`: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `DEBUGGING_COACH_ENABLED`, `DEBUGGING_COACH_AI_TIMEOUT_MS`.

## Run commands

```bash
npm install
npm test          # 115 tests
npm run typecheck  # tsc --noEmit
```

## Known limitations

- **No real repository was integrated against.** Every Feature 16–22
  interface in `src/types.ts` is a best-guess reconstruction from the spec
  text, not verified against real code. Reconciling field names with your
  actual systems is the first real integration step, not optional cleanup.
- **Groq/Gemini were never called live.** Both adapters are implemented
  against each provider's documented REST shape, not exercised against a
  live endpoint — no network route to either host existed in this sandbox,
  and both keys are intentionally blank. Smoke-test both before depending on
  them.
- **Overfitting detection (Section 29) isn't implemented** — it needs
  visibility into hidden-test results this module was never given a real
  evidence channel for.
- **Fix-quality and root-cause-ladder coaching are shallower than the spec's
  narrative examples.** Preconditions are enforced (can't propose a fix
  without a root cause, can't declare a root cause without a supported
  hypothesis), but the multi-step Socratic progressions Sections 24 and 26
  describe in prose aren't separately modeled as distinct guided flows
  beyond the phase's canonical question — the AI layer is expected to
  supply that texture, unverified against a live model here.
- **No load, latency, or concurrency testing.** Everything above is
  correctness testing, not performance testing.
- **The in-memory rate limiter is explicitly not production-safe** across
  multiple server instances — the code comments say so; don't deploy it
  as-is behind more than one process.
