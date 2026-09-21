# CodeForge AI — Debugging Coach

A coaching intelligence layer that sits on top of an existing Debugging Mode /
execution engine. It does not run code, capture traces, or grade correctness —
it interprets evidence those systems already produced and answers one
question: **what's the most useful next debugging action for this student,
and why?**

## Why this exists / how it was built

This was built from a specification document, not from your actual
repository — no CodeForge AI codebase was available to inspect. Every
integration point with "Feature 22" (Debugging Mode) and Features 16–21 is a
best-guess interface based on the spec, not something read from real code.
Treat the shapes in `src/types.ts` as a proposal to reconcile with your
actual types, not ground truth.

**Stack assumption**, inferred from the spec's own mentions of Supabase,
PostgreSQL, RLS, Groq, and Gemini: Node/TypeScript, Supabase-flavored
Postgres, Next.js-style API route handlers. If your actual stack differs
(different language, different DB), the domain logic in `src/domain/` is the
most portable/valuable part — it's plain TypeScript with no framework
dependency and would translate directly to another language.

Every claim of "done" below was actually run in this environment (Node
scripts, `tsc`, `vitest`, and a real local Postgres 16 instance) — see
`ENGINEERING_REPORT.md` for exactly what was and wasn't verified, and how.

## Structure

```
src/
  types.ts                    Shared vocabulary (phases, actions, hypotheses, coach state)
  domain/                     Pure, deterministic logic — no AI, no I/O
    phase-model.ts            Phase transitions + canonical per-phase questions
    next-best-action.ts       THE central component: action ranking + information gain
    hypothesis-engine.ts      Quality scoring, refinement questions, lifecycle
    coaching-progression.ts   Trial-and-error detection, progressive hint ladder
    skill-signals.ts          Deterministic skill-signal aggregation
    postmortem.ts             Deterministic postmortem assembly
  ai/
    providers.ts              Groq / Gemini adapters + Fake (test) + Fallback
    prompts.ts                System/user prompt construction, injection defense
    output-schema.ts          Zod validation against the controlled action taxonomy
    orchestrator.ts           Glues deterministic engine <-> AI, enforces the AI boundary
  security/
    prompt-injection-guard.ts Detection + untrusted-content wrapping
    rate-limiter.ts           Interface + in-memory reference implementation
  db/
    migrations/001_debugging_coach_schema.sql   Schema + RLS, verified locally (see report)
    repository.ts              Repository interface + in-memory impl + Supabase adapter sketch
  api/
    handlers.ts                Framework-agnostic handler functions
  observability/
    metrics.ts                 Structured event shapes + sinks
frontend/
  DebuggingCoachPanel.tsx      React panel: phase rail, hypothesis board, coach callout
tests/                         115 tests, all passing (see ENGINEERING_REPORT.md)
```

## Integrating into your real repo

1. **Reconcile `src/types.ts` with your actual Feature 16–22 output shapes.**
   Search for `FailureEvidence`, `TraceEvent`, `ComplexityEvidence`,
   `QualityEvidence`, `UnderstandingEvidence` and adjust field names to match
   what your execution engine actually returns.
2. **Point the DB migration at your real schema.** Open
   `src/db/migrations/001_debugging_coach_schema.sql` and fix the
   `debugging_session_id` FK comment to reference your actual
   `debugging_sessions` table (or equivalent) instead of a bare UUID.
3. **Implement `SupabaseCoachRepository`** following the sketch at the bottom
   of `src/db/repository.ts`, using your project's existing Supabase client
   pattern (request-scoped, user token — not the service-role key).
4. **Wire `src/ai/providers.ts` into your existing AI provider abstraction**
   if one already exists (Section 2 of the spec explicitly says not to
   duplicate it) — these adapters exist so this module is testable
   standalone, not to become a second competing abstraction.
5. **Mount `src/api/handlers.ts`** behind your router of choice (Next.js
   Route Handlers, Express, etc.) — every function takes an explicit
   `HandlerContext` with `userId` derived from your real auth middleware,
   never from the request body.
6. **Drop `frontend/DebuggingCoachPanel.tsx`** into your components folder
   and feed it real state from `GET` coach-state.

## Environment variables

All left blank in `.env.example`, per instruction:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
DEBUGGING_COACH_ENABLED=true
DEBUGGING_COACH_AI_TIMEOUT_MS=8000
```

## Running it

```bash
npm install
npm test          # 115 tests
npm run typecheck  # tsc --noEmit
```

Neither `GroqProvider` nor `GeminiProvider` is called by the test suite — no
network egress to either host was available in the environment this was
built in, and both API keys are intentionally blank. All AI-path tests use
`FakeProvider`, a deterministic, network-free stand-in. Before relying on the
two real providers, smoke-test them against a live key; their request/response
shapes were written from documented API conventions, not exercised live.

## The one architectural rule everything else follows

The deterministic engine in `src/domain/next-best-action.ts` always computes
a ranked, safety-gated list of candidate actions first. The AI layer in
`src/ai/orchestrator.ts` is only ever allowed to (a) pick among that list and
(b) write the coaching language around the pick — never to invent an action,
never to exceed the coaching-mode's level ceiling, and its choice of *target*
is only trusted when it exactly matches a candidate the deterministic engine
actually offered. If the AI is slow, down, or returns anything that fails
validation, the session keeps working on the deterministic engine alone.
This is what Sections 38, 40, and 42 of the spec were asking for, and it's
exercised directly in `tests/orchestrator.test.ts` and both variants of
`tests/golden-scenario.test.ts` (one with a well-behaved fake AI, one with no
AI provider at all).
