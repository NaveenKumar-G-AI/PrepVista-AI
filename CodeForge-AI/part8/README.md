# CodeForge Technical Interview Simulation Engine — core implementation

## What this actually is

This chat had no connection to your CodeForge/PrepVista repository — nothing
was uploaded besides the spec itself. So this isn't "Phase 0 repository
discovery followed by integration." It's a standalone, real, tested **core
engine** for the technical interview simulation the spec describes, built
so you (or Claude Code, pointed at your actual repo) can wire it in.

Every integration point where this engine depends on a system your spec
says already exists — code execution, the challenge bank, the mastery
engine, the roadmap engine, auth — is an explicit TypeScript interface in
`src/integration/adapters.ts`, not a guess at your internals. Implement
those against your real systems; don't let this engine grow a second
version of any of them.

Nothing in here is a mock standing in for "done." Where something is
genuinely unbuilt, the status table below says so plainly.

## Stack and assumptions

TypeScript (Node ≥18), PostgreSQL/Supabase, Groq + Gemini — the spec's own
"preferred/existing" stack (Phase 61). Specific assumptions, called out in
code comments too:

- `auth.users(id uuid)` exists (Supabase default).
- A `public.profiles(id, role, institution_id)` table exists or will be
  added for TPO/role checks. If your real table differs,
  `is_tpo_for_student()` in the migration is the *only* place that
  assumption lives — edit it there.
- Your challenge bank's table name is unknown, so
  `interview_problems.challenge_id` has no FK yet. Add
  `references public.challenges(id)` once you know the table.

## Architecture

```
technical_interviews (aggregate root, owns the state machine + timer)
  ├─ interview_sessions      (one active client connection at a time)
  ├─ interview_problems      (selected from YOUR challenge bank)
  ├─ interview_events        (append-only; replay + evidence source of truth)
  ├─ interview_responses     (clarification / restatement / approach / follow-up text)
  ├─ interview_submissions   (real code runs, from YOUR execution sandbox)
  └─ interview_evaluations / interview_skill_results / interview_readiness_results / interview_reports
```

```
src/
  types/domain.ts                 shared enums + entity shapes
  state-machine/                  server-enforced transitions (Phase 9/10)
  ai/                              provider abstraction, Groq + Gemini, retry/fallback, zod schemas
  interviewer/                    orchestration: follow-ups, hints, clarification, restatement
  evaluation/                     deterministic evidence + structured (non-averaged) evaluation
  reports/                        PHASE 28 report builder (evidence-grounded) + HTML renderer
  replay/                         PHASE 30 timeline builder (real timestamps only) + HTML renderer
  shared/                         HTML escaping used by both renderers
  integration/adapters.ts         the ports your real systems implement
  integration/mockAdapters.ts     in-memory fakes — TEST ONLY
  services/                       session lifecycle, problem selection, report persistence port
  api/interviewRoutes.example.ts  illustrative HTTP layer
  examples/generateSampleReport.ts  demo script — produces real HTML from PHASE 64's own scenario
db/migrations/0001_...sql         the schema, with RLS
db/local-dev/                     LOCAL TESTING ONLY — never run against real Supabase
```

## What's real vs. what's an integration seam

Phase 66's own audit format, filled in honestly.

| Capability | Status | Location | Verification |
|---|---|---|---|
| Domain model / schema | IMPLEMENTED | `db/migrations/0001_...sql` | Ran clean against a real local Postgres 16 |
| Row Level Security | IMPLEMENTED | same migration | Smoke-tested live — cross-student read correctly denied |
| Interview state machine | IMPLEMENTED | `src/state-machine` | 6 unit tests |
| Server-authoritative timer | IMPLEMENTED | `src/services/interviewSessionService.ts` | Unit tested (expiry blocks transitions even when the graph would allow them) |
| Idempotent creation & submission | IMPLEMENTED | same | Unit tested (duplicate idempotency key ⇒ code is not re-executed) |
| Role/exposure-aware problem selection | IMPLEMENTED (algorithm) | `src/services/problemSelectionService.ts` | Unit tested | Needs your real `ChallengeRepository` / `ExposureRepository` |
| Exposure tracking (PROBLEM_VIEWED etc.) | NOT_IMPLEMENTED | — | This engine only *reads* exposure via the adapter — if nothing writes it yet in CodeForge, that's a real gap |
| Real code execution | INTERFACE ONLY, by design | `adapters.ts: CodeExecutionAdapter` | Phase 11 forbids a second execution system — must be your existing sandbox |
| AI interviewer (follow-up, hint, clarification, restatement) | IMPLEMENTED | `src/interviewer` | Unit tested with scripted fake providers | Needs real `GROQ_API_KEY` / `GEMINI_API_KEY` |
| AI output validation + retry + fallback | IMPLEMENTED | `src/ai` | 5 unit tests: success, malformed-JSON retry, fenced-JSON, provider fallback, full-failure deterministic fallback |
| Deterministic evidence engine | IMPLEMENTED | `src/evaluation/evidenceEngine.ts` | — |
| Structured, non-averaged evaluation | IMPLEMENTED | `src/evaluation/evaluationEngine.ts` | 6 unit tests, incl. Phase 51 and Phase 52 by name |
| Interview readiness *contribution* | IMPLEMENTED | same | Feeds your existing readiness engine — does not replace it |
| Mastery integration | INTERFACE ONLY | `adapters.ts: MasteryEvidenceSink` | Implement against your real mastery engine |
| Roadmap integration | INTERFACE ONLY | `adapters.ts: RoadmapService` | Implement against your real roadmap engine |
| **Interview report (Phase 28)** | **IMPLEMENTED** | `src/reports/` | 7 unit tests + a real generated sample (`sample-report.html`) reproducing Phase 64's own scenario end to end |
| **Report HTML rendering** | **IMPLEMENTED** | `src/reports/renderReportHtml.ts` | Tested incl. an explicit XSS-escaping check on student-authored evidence text |
| **Interview replay timeline (Phase 30)** | **IMPLEMENTED** | `src/replay/` | 5 unit tests — real timestamps only, chronological, no fabricated entries |
| Report PDF export | NOT_IMPLEMENTED | — | HTML output can be piped through any HTML→PDF tool (e.g. a headless browser) in your stack |
| Student dashboard | NOT_IMPLEMENTED | — | Surface `interview_readiness_results` in your existing CodeForge dashboard |
| TPO / batch aggregation | PARTIALLY_IMPLEMENTED | schema + RLS exist (`interview_batches`, `is_tpo_for_student`) | No aggregation queries or UI yet |
| Security (ownership, expiry, idempotency) | IMPLEMENTED | services | Unit tested |
| AI failure recovery | IMPLEMENTED | `src/ai` | Unit tested |
| Observability | NOT_IMPLEMENTED | — | Hook into your existing logging |
| Linting | NOT_IMPLEMENTED | — | Only `tsc --strict` has been run; no eslint/prettier pass |
| Unit tests | IMPLEMENTED | `*.test.ts` | **39/39 passing** |
| Integration / E2E tests | NOT_IMPLEMENTED | — | Needs your real DB/execution/AI to run against |

## What actually got verified, not just written

- `npx tsc` — clean compile, strict mode, zero errors, both this round and the previous one.
- `node --test` — **39/39 unit tests passing**, including:
  - **Phase 51** — strong coding but developing complexity reasoning resolves
    to `APPROACHING_READY`, never `READY`, regardless of practice-mode history.
  - **Phase 52** — a dimension nothing was ever asked about resolves to
    `INSUFFICIENT_EVIDENCE`, never silently to `WEAK`.
  - **XSS escaping** — a `<img src=x onerror=...>` payload placed in a
    dimension's evidence text (i.e. text that traces back to something a
    student or the AI wrote) is confirmed absent, unescaped, from the
    rendered report HTML.
- The migration ran against a **real local Postgres 16**;
  `db/local-dev/supabase_stubs.sql` stands in for what Supabase already
  provides so the real migration could run unmodified. The RLS smoke test
  then proved live: student A sees their own interview (1 row), student B
  sees none of it (0 rows), a TPO in the same institution sees it (1 row),
  and `authenticated` has neither UPDATE nor DELETE on `interview_events`.
  That process caught a real bug — `is_tpo_for_student()` needed
  `SECURITY DEFINER` — now fixed in the migration itself.
- **`src/examples/generateSampleReport.ts` was actually run.** It replays
  Phase 64's own end-to-end demonstration scenario (strong coding,
  debugging, and adaptability; developing complexity reasoning) through the
  real evaluation → report → replay pipeline and writes `sample-report.html`.
  The real output: `APPROACHING_READY` at `MEDIUM` confidence, reason
  *"Implementation performance is strong, but TIME_COMPLEXITY,
  SPACE_COMPLEXITY needs additional evidence,"* next recommended action
  *"Complexity-focused technical interview practice"* — matching Phase 64's
  own narrative, produced by the actual code rather than copied from the spec.

## Integrating this into your real repo

1. Point Claude Code (or your own read of the codebase) at the real
   CodeForge repo and do the Phase 0 discovery this spec asks for — find
   your actual execution sandbox, challenge bank, mastery engine, roadmap
   engine, and auth/profile tables.
2. Implement `src/integration/adapters.ts` and
   `src/services/reportPersistence.ts` against them. Nothing else in `src/`
   needs to change to do this — that's the point of the seam.
3. Edit `is_tpo_for_student()` in the migration if your role/institution
   table doesn't look like `public.profiles`; add the FK on
   `interview_problems.challenge_id` once you know the table name.
4. Run the migration in a Supabase branch/staging project first — this was
   validated against plain Postgres with a Supabase stand-in, not against
   Supabase itself.
5. Wire `src/api/interviewRoutes.example.ts`'s pattern into your actual
   framework (Next.js/Express/Fastify/Edge Functions).
6. Set `GROQ_API_KEY` / `GEMINI_API_KEY` (and optionally `GROQ_MODEL` /
   `GEMINI_MODEL` — check current model names against each provider's docs).
7. If you want PDF reports rather than HTML, pipe `renderReportHtml()`'s
   output through whatever HTML→PDF tool already exists in your stack
   (e.g. a headless-browser print-to-PDF call) — the data/rendering split
   means that's a rendering-layer choice, not a change to `reportBuilder.ts`.

## Running this project standalone

```bash
npm install
npm run build                              # tsc, strict mode
npm test                                   # build + run all *.test.js with node --test
node dist/examples/generateSampleReport.js # regenerate sample-report.html
```

## Design decisions worth knowing about

- **`event_type` is a TypeScript allow-list, not a DB CHECK constraint** —
  new event types shouldn't need a migration.
- **Readiness is a per-interview *contribution*, not a competing engine** —
  computed only from this interview's own dimension results, never boosted
  by outside mastery data (Phase 25/51).
- **All writes to `interview_*` tables happen server-side, via the service
  role** — the RLS policies are read-only for `authenticated`; every
  mutation goes through `interviewSessionService`, which enforces
  ownership, expiry, and the state machine first.
- **The AI is never asked to decide `INSUFFICIENT_EVIDENCE`** — that's
  decided deterministically before the AI is even called for that
  dimension (`rateDimension()` in `evaluationEngine.ts`).
- **Code execution is an interface, not an implementation** — Phase 11 is
  explicit that a second execution system would be a duplicate one.
- **Report feedback is generated from persisted facts, not stored as an AI
  paragraph** — `reportBuilder.ts` only ever rephrases a
  `dimensionResult.evidenceSummary` or a provided event; it never invents a
  new claim (Phase 29/54).
- **All rendered HTML escapes dynamic text** — reports and timelines
  include student- and AI-authored strings, and this output is viewed by
  TPOs, so every interpolation goes through `escapeHtml()`.

## Honest gaps

Still genuinely **NOT_IMPLEMENTED**: TPO dashboard UI, PDF export, batch
aggregation UI, exposure-tracking writers, observability wiring, a lint
pass, and E2E tests against your live stack. All either need your actual
component library/UI framework (which this chat can't see) or your actual
running systems (execution sandbox, AI provider network access, a live
Supabase project) to be more than more mock-backed code. That's the right
next job for an agentic coding tool with your real repo open.
