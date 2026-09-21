# ACEAPT Feature 47 — Guided Solving Engine

A step-by-step, evidence-driven guided-solving system: a student works a problem one step
at a time, every step is validated deterministically, a first mistake is distinguished from
the mistakes it causes downstream, help escalates only as needed and fades as the student
improves, and a "show me the solution" request is always followed by a reconstruction check
and an independent, unaided verification problem — never counted as mastery on its own.

## Before anything else: what this actually is

The implementation prompt this was built from assumes an existing ACEAPT codebase — existing
Question/Student/Skill/Mistake/Hint services, an existing frontend design system, Features
42–46 already built — and instructs inspecting and reusing all of it. **No such codebase was
provided or exists in this environment.** Rather than fabricate an inspection report about
code that isn't there, this was built as a **standalone, integration-ready module**: every
place the spec assumes an existing system, this code defines a small, explicit interface
("port") for it, with a working stand-in implementation, so the real system can be dropped in
later by replacing one class in one file — never by touching the engine, the API, or the UI.

Everything below is real: it's written, it typechecks, it's covered by 84 passing tests, and
it has been run end-to-end (backend + frontend + a live HTTP session) while building this.
Nothing is a mockup.

## Quickstart

```bash
# Backend
cd backend
cp .env.example .env      # leave ANTHROPIC_API_KEY blank to run on deterministic fallback
npm install
npm run build && npm start    # or: npm run dev (auto-reload)
# -> http://localhost:4000/health

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
# -> http://localhost:5173
```

Open the frontend, pick a problem, and solve it. The frontend bootstraps a throwaway demo
identity against the backend's dev-only token route automatically (see **Auth**, below) — no
login step is needed to try it.

To exercise everything backend-only, without a browser:

```bash
cd backend && npm test
```

## The core mechanic: first-error localization and cascading errors

This is the part of the spec ("Sections 18-19") that most changes what a "guided solving
engine" actually has to do, so it's worth calling out on its own. When a student gets a later
step wrong, the engine has to tell two situations apart:

1. **A brand new mistake.** The student's answer doesn't follow from anything, including
   their own earlier work.
2. **A carried-forward mistake.** The student's earlier answer was already wrong, and their
   later answer is exactly what you'd get by working *correctly* from that wrong earlier
   number. Their reasoning at *this* step is fine — the problem happened one step ago.

Every step template can define `deriveExpectedGivenPriorAttempts`: given the student's own
(possibly wrong) numeric values from earlier steps, what would this step's answer be if we
credited their earlier work? `domain/engine/errorLocalization.ts` uses this to walk the whole
attempt history once and produce, per step: `CORRECT`, `FIRST_ERROR`, `AFFECTED_BY_PRIOR_ERROR`,
`INDEPENDENT_ERROR`, `SKIPPED`, or `PENDING`. The UI's solving rail renders these differently
(a muted "carried from above" tag vs. a hard error tag), so a student who made one mistake
sees one mistake, not a wall of red. See `backend/tests/errorLocalization.test.ts` for the
exact 100-vs-120 example from the spec, reproduced as a test, plus the same logic wired
through the real speed/distance/time problem.

## Architecture

```
backend/
  src/
    domain/
      problemBank/        Problem + step type definitions, and 4 worked problems
                           (speed/distance/time, probability, percentage, linear algebra),
                           each with a transfer variant for independent verification.
      engine/              Pure, deterministic logic: validators (numeric, unit-aware,
                           multiple-choice, algebraic-equivalence via substitution testing,
                           structured-field, answer-key), the first-error/cascading-error
                           classifier, the 0-7 help-level escalation policy, the assistance-
                           type classifier, adaptive-fading heuristics, and the session/step
                           state machines.
      ai/                  Anthropic API client + prompt/context builder with explicit
                           prompt-injection defenses + zod-validated output contract +
                           deterministic fallback generator. AI never grades anything.
      integrations/        Ports (interfaces) for Skill Graph, Mistake Intelligence,
                           Formula Intelligence, and Mastery, each with a logging/no-op
                           stand-in implementation. Swap the implementation, not the
                           interface, when wiring into real ACEAPT services.
    repositories/          Repository interfaces + a zero-dependency, atomic JSON-file-backed
                           implementation of each (see "Persistence" below).
    services/              GuidedSolvingService - the orchestrator. Owns session lifecycle,
                           wires the engine to persistence and to the AI layer, and is the
                           enforcement point for per-student ownership.
    api/                   Express routes/controllers/middleware (thin - no business logic).
  tests/                   84 tests across the engine, the service, and the HTTP layer.
  docs/schema-reference.prisma   Reference Postgres schema for when you migrate off the
                           bundled JSON-file store (see "Persistence").

frontend/
  src/
    api/                   Typed fetch client + view types mirroring the backend contracts.
    state/useGuidedSession.ts   The one state hook driving the whole workspace.
    components/            ProblemPicker, ProblemPanel, SolvingPath (the step-progress
                           "rail" - see design note below), CurrentStepCard + AnswerInput,
                           HelpBar, GuidancePanel, FullSolutionPanel, SessionSummaryCard,
                           VerificationBanner, GuidedWorkspace (the layout).
```

### Design note on the frontend

This is deliberately not styled like a chat product — Section 47 is explicit that it
shouldn't be. The one bold visual element is the **solving rail**: a vertical trace of step
nodes (a horizontal strip on mobile) styled after a lab-instrument/circuit readout, because
the product's actual job is making a multi-step *path* legible, including exactly where a
mistake first happened and whether a later red node is a fresh problem or just carrying the
first one forward. Everything else — cards, type, spacing — stays quiet on purpose so the
rail is what draws the eye. Type is the IBM Plex family throughout (Sans for UI, Mono for
step numbers, data, and units), chosen because it's a family actually designed for technical
computing contexts, which is what this product is.

### Persistence

There's no database server available in this environment, and no guarantee that a native
database driver would even install cleanly in an arbitrary sandbox. So instead of taking on
that risk, persistence is behind five small repository **interfaces**
(`GuidedSessionRepository`, `GuidedStepStateRepository`, `GuidedAttemptRepository`,
`GuidedAssistanceRepository`, `GuidedOutcomeRepository`), each with one concrete
implementation: an atomic, write-to-temp-then-rename JSON file store
(`repositories/jsonCollectionStore.ts`). It has zero runtime dependencies, needs zero setup,
and is what makes `npm test` and `npm run dev` work with nothing else installed.

**This is a genuine, working implementation, not a mock** — state really does survive a
server restart (proven in `tests/guidedSolvingService.test.ts`'s "resume after refresh" test,
which constructs a brand new service instance against the same directory and reads the same
session back). It is not a claim of multi-instance production safety. To move to Postgres (or
whatever ACEAPT already runs): implement the five repository interfaces against
`docs/schema-reference.prisma`'s shape, and change five lines in `src/app.ts`'s composition
root. Nothing else in the codebase — not the engine, not the service, not the API — knows or
cares which implementation is behind the interface.

### Auth

ACEAPT already has real authentication. This module ships a **stub** (`api/middleware/auth.ts`)
that verifies a bearer JWT signed with `AUTH_STUB_SECRET` and trusts its `sub` claim as the
student id — nothing more. A single dev-only route, `POST /api/dev/token { studentId }`
(`api/routes/dev.routes.ts`), issues one; it's gated off whenever `NODE_ENV=production` and is
meant to be deleted entirely once real auth is wired in. Ownership is still enforced properly
in the meantime: every service method takes the authenticated caller's id and refuses access
to another student's session (`services/guidedSolvingService.ts`'s `requireOwnedSession`,
tested at the HTTP layer in `tests/api.security.test.ts` — the exact "Student A requests
Student B session → denied" scenario from the spec).

### AI

Leave `ANTHROPIC_API_KEY` blank in `backend/.env` and the product is fully functional: hints,
explanations, and the "show next step" preview all come from the deterministic fallback layer
(`domain/ai/fallback.ts`) — hand-authored hint ladders and explanations from the problem bank
itself, not a placeholder string. Add a key and the same call sites start asking
`claude-haiku-4-5-20251001` (configurable) to phrase the hint instead, constrained to a
strict JSON output contract validated with zod (`domain/ai/outputSchema.ts`) — anything
malformed, or any network failure or timeout, silently falls back to the same deterministic
path. The AI is never on the path that decides whether an answer is right (that's
`domain/engine/validation`, entirely deterministic — substitution-tested algebra, unit-aware
numeric comparison, etc.) and it never touches auth, persistence, or scoring truth. Student
input, question text, and any other untrusted content are wrapped in labeled
`<student_provided_content>` tags in the prompt with explicit instructions to treat them as
data, never commands (`domain/ai/prompts.ts`).

## API

All routes below are mounted at `/api/guided` and require `Authorization: Bearer <token>`.

| Method | Path | Spec concept |
|---|---|---|
| GET | `/problems` | (demo helper — stands in for ACEAPT's own question picker) |
| POST | `/sessions` | `startGuidedSession` |
| GET | `/sessions/:id` | `getGuidedSession` |
| GET | `/sessions/:id/current-step` | `getCurrentStep` |
| POST | `/sessions/:id/steps/:stepId/submit` | `submitStep` |
| POST | `/sessions/:id/steps/:stepId/retry` | `retryStep` |
| POST | `/sessions/:id/steps/:stepId/skip` | `skipStep` |
| POST | `/sessions/:id/steps/:stepId/guidance` | `requestGuidance` (hint) |
| POST | `/sessions/:id/steps/:stepId/explain` | `requestExplanation` |
| POST | `/sessions/:id/show-next-step` | `showNextStep` |
| POST | `/sessions/:id/reveal-solution` | full solution reveal (Section 28) |
| POST | `/sessions/:id/reconstruction` | solution reconstruction (Section 29) |
| POST | `/sessions/:id/complete` | `completeGuidedSession` |
| POST | `/sessions/:id/verification` | `startVerification` |
| GET | `/sessions/:id/summary` | `getGuidedSummary` |
| POST | `/sessions/:id/feedback` | student feedback (Section 85) |
| POST | `/sessions/:id/abandon` | session lifecycle (Section 8) |

`submitStep` accepts an optional `expectedVersion` (optimistic-concurrency check — a stale
version returns `409 VERSION_CONFLICT` instead of silently overwriting) and an optional
`clientRequestId` (a repeated submission with the same key is a safe no-op, so a network
retry can never double-advance a session — see Sections 93/107 and
`tests/guidedSolvingService.test.ts`).

## What was built (P0/P1/P2 status)

**P0 — all implemented and tested:** guided session with full lifecycle (start / active /
pause-capable / resume / abandon / complete), structured per-problem decomposition, the step
model and current-step interaction, deterministic step validation across 6 validator types,
partial correctness as a first-class result (not collapsed to pass/fail), first-error
localization, cascading-error handling, retry/recovery, the 0-7 assistance-level ladder with
auto-escalation and decay, manual help (hint/explain/next-step), full-solution reveal +
mandatory reconstruction, independent-verification handoff with guidance disabled, integration
seams for Skill Graph / Mistake Intelligence / Formula Intelligence / Mastery, secure
JSON-file persistence with resume proven by test, mobile-first responsive layout,
baseline accessibility (semantic landmarks, aria-live feedback, visible focus, reduced-motion
handling, keyboard-operable controls throughout), AI fallback, and a 84-test suite.

**P1 — implemented:** dynamic initial help-level suggestion from recent history
(`recommendNextHelpLevel`), evidence-based guidance-dependency signal (LOW/MODERATE/HIGH,
phrased as a signal never a verdict), assistance-type classification (CONCEPT / STRATEGY /
FORMULA / CALCULATION / INTERPRETATION / UNIT / LOGIC / VERIFICATION), multiple-solution-method
data model (`alternateMethods` on a problem template, demonstrated on the algebra problem),
transfer/verification intelligence, and per-attempt timing capture as a seam for future speed
classification.

**P1 — partial, documented rather than pretended:** a full student "guidance profile"
aggregated across many sessions and skills (Section 79) is not built; `getSummary` returns the
single session's outcome and a same-history-based next-help-level suggestion, which covers
the fading loop but not a durable cross-skill profile object. Alternate-method *grading* only
has one worked example (the algebra problem) rather than depth across all four problems.

**P2 — architected for, not built,** exactly as the spec asks: `expectedInputType` is a closed
type today (`TEXT | NUMERIC | CHOICE | UNIT_VALUE | STRUCTURED_FIELDS`) but the validator
dispatch is a single switch in one file (`domain/engine/validation/index.ts`), so adding
`VOICE`/`HANDWRITING`/`DIAGRAM` input types later is additive, not a rewrite. No speculative
code for these was added now.

## Known limitations

- **Content breadth.** Four fully-worked problems across four problem types
  (arithmetic/speed-time-distance, probability, percentage, algebra), not all thirteen types
  listed in the spec. The engine itself is type-agnostic — adding a fifth problem is authoring
  a new file in `domain/problemBank/`, not touching the engine.
- **Transfer/structural-similarity checking is simple.** "Transfer success" is currently
  defined as solving the variant fully independently; it does not (yet) verify that the
  student used the *same solving structure*, just that they got a correct, unaided result.
- **`node_modules` are not included in the delivered archive** (see below) to keep the
  download reasonable — run `npm install` in each of `backend/` and `frontend/` first.
- **Dev-dependency advisories:** `npm audit` reports one moderate esbuild advisory in Vite's
  dev-server tooling (a dev-only, not-exposed-to-the-internet concern) in both projects. The
  one high/critical advisory that appeared during setup (in `mathjs`) has been patched to a
  fixed version; `uuid` was removed entirely in favor of Node's built-in `crypto.randomUUID()`.
- **No browser-driven UI test suite.** Backend logic (the part with real risk — grading,
  state transitions, security) has 84 automated tests; the frontend was verified by a real
  build + typecheck + manual, deliberate logic review + live end-to-end smoke testing (server
  + browser bundle both booted and exercised via HTTP during development), but there is no
  Playwright/Testing-Library suite yet.

## Integrating into real ACEAPT

1. Replace `api/middleware/auth.ts`'s `requireAuth` with ACEAPT's real session verification;
   delete `api/routes/dev.routes.ts`.
2. Implement the five repository interfaces in `src/repositories/*.ts` against ACEAPT's real
   database, using `docs/schema-reference.prisma` as the starting shape; wire them in at
   `src/app.ts`'s `createGuidedSolvingService()`.
3. Replace `InMemoryProblemBank` (`domain/problemBank/index.ts`) with an adapter over
   ACEAPT's real Question/Solution service — it only needs to satisfy `ProblemBankPort`
   (`getById`, `list`).
4. Implement the four integration ports in `domain/integrations/` against the real Skill
   Graph, Mistake Intelligence, Formula Intelligence, and Mastery services.
5. Point `ANALYTICS` (`domain/integrations/analytics.ts`'s `AnalyticsSink`) at ACEAPT's real
   pipeline instead of console output.
6. Drop `frontend/src/components/*` into ACEAPT's existing design system/component library,
   swapping the bespoke CSS for ACEAPT's own tokens if desired — the components only depend on
   the typed view models in `api/types.ts`, not on any of this app's specific styling.
