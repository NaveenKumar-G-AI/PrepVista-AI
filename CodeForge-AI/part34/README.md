# CodeForge AI — Feature 34: Technical Interview Integration

A reference implementation of the Technical Interview Integration build
prompt: an **evidence-verification layer** that runs adaptive technical
interviews (project defense, code defense, debugging, architecture, skill
verification, etc.), evaluates responses through a strictly-grounded AI
pipeline, and feeds the result to CodeForge's existing intelligence engines
as structured evidence — never as a bare AI-generated score.

```
Question Context + Role Context + Student Evidence + Response
        ↓
Structured Evaluation → Skill Evidence
        ↓
Skill Signal Engine → Mastery → Growth Tracking → Role Skill Gap → Role
Readiness → Next Best Action
```

## Read this first: what this actually is

The build prompt's Phase 1–2 ask for repository discovery — inspecting the
real CodeForge codebase before writing anything, and reusing its existing
Skill Signal Engine, Mastery System, Growth Tracking, Role Skill Gap
Analysis, Role Readiness Engine, Next Best Action Engine, Debugging Coach,
Reasoning Verification, and Understanding Check.

**No CodeForge repository was provided to build against** — only the build
prompt itself. So instead of guessing at (or worse, quietly inventing) what
those systems look like, this implementation draws the boundary explicitly:
every one of those nine systems is an interface in
`src/integration/ports.ts`, with an in-memory or heuristic adapter behind
it for this repo to run and test standalone. **Integrating this for real
means writing one adapter file per port that calls your actual services —
nothing in `src/engine/` or `src/orchestration/` should need to change.**
See "Integrating into the real codebase" below.

Everything else — the domain model, the state machine, the eight interview
modes, question selection/generation/validation, the adaptive follow-up
engine, the evaluation pipeline, evidence extraction, the API, the DB
schema, and the frontend — is real, working, and tested against this
repository's own code, not described in prose.

As requested, all secrets/keys are left blank (see `.env.example`) for you
to fill in.

## Status

- **119 tests, 0 failures**, run repeatedly with zero flakiness (`npm test`)
- Full TypeScript strict mode, zero `any` outside two narrow, commented
  exceptions in test fixtures
- The Postgres migrations were **actually applied to a real PostgreSQL 16
  instance** during development — including empirically proving the Row
  Level Security tenant-isolation policies block cross-org reads (not just
  asserting the SQL parses)
- Every bug mentioned below was **found by running the code**, not by
  inspection — see "Bugs found and fixed during development" if you want
  the specifics; they're the most useful part of this README for
  understanding where the sharp edges were.

## Quick start

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 119 tests
npm run dev          # standalone server on :3034, deterministic fixture AI by default
```

Set `ANTHROPIC_API_KEY` (see `.env.example`) to use live question
generation/evaluation instead of the deterministic fixture — `npm run dev`
picks this up automatically.

## Directory map

```
src/
  domain/               Types, the session state machine, blueprint schema + builder
  domain/blueprints/     The 8 interview-mode factories (Phase 4) — all funnel through one builder
  engine/                Pure logic: question selection, generation, validation, follow-up,
                          coverage/completion, evidence extraction, summary
  engine/evaluation/      The evaluation pipeline: confidence, consistency, adaptive signal,
                          evidence-state derivation, raw-AI-output mapping
  integration/ports.ts   The seam to every existing CodeForge system — READ THIS FIRST
  integration/adapters/  In-memory/heuristic/real implementations of those ports
  orchestration/         Use cases: create/start/pause/resume/cancel/complete a session,
                          request the next question, submit a response, gap-verification flow
  db/repositories.ts     Repository interfaces; db/inMemory/ implements them for tests+dev
  db/migrations/          Real PostgreSQL schema + Row Level Security (see below)
  api/                   Express routes, request validation, response shaping (presenters.ts
                          strips scoring internals from student-facing responses)
tests/
  unit/                  Pure-function tests: state machine, blueprints, confidence, coverage,
                          question validation, follow-up decisions
  golden/                The 5 Phase 73 reference scenarios, run against the real pipeline
  integration/           Idempotency, the full evidence fan-out to all 6 downstream engines,
                          the gap-verification loop
  security/               Presenter-level leakage checks, cross-tenant/cross-user authorization
  api/                    Full HTTP-level happy path + tenant isolation via supertest
frontend/
  src/shared/             API client, design tokens, the EvidenceBadge/SkillCoverageRail
                          components used across all three UIs
  src/student/            Phase 57 — live interview UI
  src/summary/            Phase 58 — post-interview coverage map
  src/institutional/      Phase 59 — trainer/TPO aggregate dashboard
```

## Architecture decisions worth knowing about

**One engine, many blueprints (Phase 4).** All 8 interview modes
(`src/domain/blueprints/index.ts`) are thin default-sets over one
`buildBlueprint()` function. No mode has its own question-selection,
follow-up, or evaluation logic — that's all shared, in `src/engine/`.

**AI is never authoritative (Phase 40).** The evaluation pipeline
(`src/engine/evaluation/pipeline.ts`) turns an AI verdict into a
`SkillEvidence` signal and stops. Nothing in this codebase writes to
mastery, readiness, or gap state — those all live behind read-only or
notify-only ports that the real Skill Signal Engine etc. own.

**Grounding is enforced, not just requested (Phase 41).** Every AI prompt
is built from exactly what `buildGroundingContext()` assembles from the
student's real evidence — never the full student record. On the return
trip, `mapRawEvaluation()` checks that any evidence the AI claims to have
used was actually offered to it; a citation that wasn't is treated as a
grounding violation and routed to `EVALUATION_PENDING`, the same as a
provider outage (Phase 42) — never silently trusted.

**Consistency checking can't express an accusation (Phase 14).** The
`ConsistencyClass` type has exactly four values —
`CONSISTENT | PARTIALLY_CONSISTENT | UNCERTAIN | POTENTIAL_INCONSISTENCY` —
and that's enforced in the Postgres enum too. There's no "DISHONEST" value
for a caller to reach for even by mistake.

**Defense in depth on tenant isolation (Phase 60, 69).** Every
orchestration function checks `actor.orgId === resourceOrgId` before doing
anything (`src/orchestration/helpers.ts`), and the Postgres migration adds
Row Level Security as an independent second layer — see
`0002_row_level_security.sql`. This was tested against a real Postgres
instance with two simulated tenants; cross-tenant reads returned zero
rows, not an error that would confirm the data's existence.

**The student never sees scoring internals (Phase 57, 65).**
`src/api/presenters.ts` strips difficulty, grounding, confidence,
correctness, and the adaptive signal from every response a `STUDENT` actor
receives — trainers/admins get the full record. This is checked in
`tests/security/authorization.test.ts`, and again end-to-end at the HTTP
layer in `tests/api/interviews.api.test.ts`.

## What's real vs. what's a stand-in

| Piece | Status |
|---|---|
| Domain model, state machine, blueprints, engine logic | Real, fully tested |
| Evaluation pipeline, evidence extraction, summary generation | Real, fully tested |
| `AnthropicAIGatewayAdapter` | Real — calls the actual Anthropic API. Unconfigured until you set `ANTHROPIC_API_KEY` |
| `DeterministicFixtureAIGatewayAdapter` | A real, working rule-based adapter for tests/local dev — not a mock that always returns the same canned value regardless of input |
| Postgres schema + RLS | Real SQL, applied to and verified against a live Postgres 16 instance |
| In-memory repositories | Real, correct implementations of the repository interfaces — this is what tests run against |
| `FixtureRoleRequirementsAdapter`, `FixtureStudentEvidenceAdapter` | Return hardcoded example data (`src/integration/adapters/fixtures.ts`) — replace with real reads from your Role-Based Skill Model and technical evidence systems |
| `InMemorySkillSignalEngineAdapter` and the other 5 engine adapters | Record what was sent so tests can assert on it — replace with real calls to your existing engines |
| `HeuristicReasoningVerificationAdapter`, `HeuristicUnderstandingCheckAdapter` | Simple, transparent keyword-based heuristics — replace with your real Reasoning Verification / Understanding Check services |
| `FixtureDebuggingCoachAdapter` | Returns one hardcoded scenario — replace with your real Debugging Coach |
| `UnconfiguredVoiceAdapter` | Throws until you wire a real speech provider (Phase 33's safe-fallback-to-text path already handles this throwing) |
| `DefaultAuthzAdapter` | A reasonable default role/action matrix — replace with your real authorization system (Phase 61 says reuse, not rebuild) |
| Frontend | Real, working React components against the real API — no backend framework assumed, uses plain `fetch` |

## Integrating into the real codebase

1. **Phase 1–2, for real this time.** Inspect your actual CodeForge repo for
   the nine systems listed in `ports.ts`. Map each one's real API onto the
   corresponding port interface.
2. Write one adapter file per port under `src/integration/adapters/`,
   implementing the real calls. Delete or ignore the fixture/heuristic ones.
3. Swap them in `src/orchestration/container.ts` — that file is the *only*
   place concrete adapters are chosen. Everything else depends on the
   interfaces.
4. Swap `src/db/inMemory/repositories.ts` for real Postgres repositories
   implementing `src/db/repositories.ts`'s interfaces, backed by the schema
   in `src/db/migrations/`.
5. Replace `src/api/middleware/actor.ts`'s header-based actor resolution
   with your real auth middleware — every route only depends on
   `req.actor: ActorContext` and `req.orgId: OrgId`.
6. Mount `buildInterviewRouter(container)` onto your existing Express app
   instead of running `src/api/server.ts` standalone.
7. Re-run `npm test` after each adapter swap — the test suite is written
   against the interfaces, so it should keep passing (aside from the
   fixture-specific assertions in `tests/integration/fullFlow.test.ts` that
   check what the in-memory adapters recorded, which you'd replace with
   assertions against your real systems, likely as integration tests that
   live in the main codebase instead of here).

## Bugs found and fixed during development

Kept here deliberately, not scrubbed from history — each was a real defect
caught by actually running the code, and each fix is still visible in the
relevant file's comments:

- **Tenant-strip bug in the session repository.** `InterviewSession` is the
  one domain type that carries its own `orgId` field; the generic
  tenant-scoping helper used for every other repository stripped it on
  every read anyway, silently breaking every read-transition-write cycle in
  the system (start, pause, resume, cancel, complete). Found because
  `startSession` returned 409 on a fresh session. Fixed in
  `src/db/inMemory/repositories.ts`.
- **Non-collision-resistant question IDs.** Question IDs were built from
  `Date.now()` plus a small attempt counter — fine with real AI latency,
  but this pipeline runs fast enough in-memory that two questions
  legitimately generated in the same millisecond got identical IDs,
  silently overwriting one question's record with another's and making
  response-to-question lookups ambiguous. Found via a five-run determinism
  check that kept producing different results from identical inputs. Fixed
  by switching to `randomUUID()` in `src/engine/questionGeneration.ts`.
- **One-response-per-question wasn't enforced.** A second, distinct
  response submitted to a question that already had one (different
  idempotency key) was silently accepted, creating two independent
  `Response`/`Evaluation` records for one question — later lookups would
  pick whichever came first, inconsistently. Fixed in
  `src/orchestration/submitResponse.ts`, and independently re-enforced at
  the database layer via a unique index in the Postgres migration (proven
  empirically, not just written).
- **A safety regex depended on word order.** `/\bpassword\b.*\bshare\b/i`
  matched "password ... share" but not the natural phrasing "share your
  password" — silently letting an unsafe pattern through. Fixed with
  order-independent lookaheads in `src/engine/questionValidation.ts`.
- **`pickRelevantExcerpt` fell back to an arbitrary code excerpt** when
  nothing was actually tagged relevant to the skill being asked about —
  which is exactly the kind of ungrounded claim Phase 41 prohibits. Fixed
  to return no code-grounding rather than a fabricated relationship in
  `src/engine/grounding.ts`.
- **A redundant `completeSession` call from the frontend.** The initial
  `InterviewSummaryView` design called `completeSession` again on mount,
  which throws once a session is already `COMPLETED`. Added a dedicated
  read-only `getInterviewSummary` query and `/summary` endpoint instead —
  safe to call any number of times, unlike the state-mutating
  `completeSession`.

## What would need more work before this ships

Said plainly, not buried:

- The nine fixture/heuristic adapters listed above are the real integration
  work — this repo can't do that part without your actual codebase.
- Voice is entirely unconfigured (Phase 31 architecture is in place; no
  speech provider is wired in).
- The regression suite in Phase 76 ("run the complete existing CodeForge
  test suite... confirm Feature 34 does not break...") can't be run here —
  there is no existing CodeForge test suite in this environment to run it
  against. Once integrated, that's a real step to do in the main repo.
- Anti-gaming (Phase 54) is handled structurally — follow-ups, applied/
  scenario framing, code-grounded questions, and short/keyword-only
  answers scoring low on `responseQuality` — rather than via a dedicated ML
  detector, which would be a much larger, separately-scoped effort.
