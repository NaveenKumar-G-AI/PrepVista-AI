# CodeForge AI — Hint Ladder

An adaptive, evidence-grounded progressive-assistance engine: it decides how
much help a student needs, generates it, checks whether it actually worked,
and escalates intelligently when it didn't.

## Why this is a standalone project, not a patch to an existing repo

No existing CodeForge AI repository was present in the environment this was
built in (checked `/mnt/user-data/uploads` and the working directory before
writing any code — see the engineering report for the exact verification).
Rather than fabricate a fake "existing codebase" to patch, this is a
complete, coherent, runnable reference implementation built against the
stack the original spec's own vocabulary implies (Supabase, PostgreSQL, RLS,
Groq, Gemini, a coaching-session-based AI Code Coach) — Next.js 15 (App
Router) + TypeScript + Supabase/Postgres. It's structured so the real
Hint Ladder code (`src/lib/hint-ladder/*`, the migration, the tests) can be
copied directly into a real CodeForge repo with minimal adaptation.

## What's the real deliverable vs. what's a stand-in

**The deliverable** (production-depth, fully tested):
- `src/lib/hint-ladder/*` — state machine, policy engine, evidence
  analysis, root-issue modeling, anti-repetition, prompt construction,
  output validation/guarding, provider abstraction, service orchestration.
- `supabase/migrations/0001_hint_ladder_schema.sql` — schema + RLS.
- `src/app/api/hint-ladder/*` — the three real API routes.
- `src/components/hint-ladder/*` — the real frontend panel.
- `tests/*` — 84 tests, all passing (see "Verification" below).

**Stand-ins** (exist only to make this runnable without a real CodeForge
backend attached — delete when merging into the real repo):
- `src/lib/stand-ins/existing-systems-adapter.ts` — a minimal, in-memory
  implementation of the `ExistingSystemsAdapter` interface the service
  layer depends on. In the real repo, implement this interface against the
  actual `problems` / `submissions` / `execution_results` /
  `coaching_sessions` tables and delete this file.
- `src/app/api/hint-ladder/demo-submit/route.ts` and the "Simulate
  submission" dropdown in the workspace page — stand in for the real
  execution pipeline, which this task correctly scoped as out-of-bounds to
  build (a sandboxed code execution system is a different, large piece of
  infrastructure). This route does **not** execute code; it lets you pick a
  verdict from a dropdown so the Hint Ladder has something real to react to.

## Architecture

```
student action (UI)
  -> POST /api/hint-ladder/request
    -> service.ts: handleHintRequest()
       1. auth (Supabase getClaims — verified JWT, not getSession)
       2. rate limit (sliding window)
       3. mode resolved server-side (never trusted from client)
       4. load/create session (repository, optimistic-concurrency retry loop)
       5. idempotency check (request id -> cached response)
       6. load problem/submission/execution from ExistingSystemsAdapter
       7. evidence-analyzer.ts: did the last hint help? (deterministic)
       8. policy-engine.ts: what should happen next? (deterministic)
       9. root-issue.ts + code-locator.ts: what's actually going on? (deterministic)
       10. [only if a hint must be generated]
           prompt-builder.ts -> providers/router.ts -> schema.ts (validate)
           -> output-guard.ts (independent policy enforcement)
           -> ai-hint-generator.ts orchestrates 9-10, with a deterministic
              fallback if every provider is unavailable
       11. persist (repository.applyTransition — versioned, transactional)
       12. cache response under the request id
```

The policy engine (step 8) decides the assistance **level** and hint
**type** before any AI call happens. The AI is only ever asked to phrase
content for a level it's already been told to target — it does not decide
how much to reveal. `output-guard.ts` independently re-enforces that
decision on the way out, so even a fully prompt-injected model response
cannot escalate past what the policy authorized (see
`tests/security/mode-and-injection-e2e.test.ts`, which simulates exactly
that worst case).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project + AI provider keys
# apply supabase/migrations/0001_hint_ladder_schema.sql to your Supabase project
npm run dev
```

Everything in `.env.example` is left blank as requested. With no AI provider
keys configured, hint generation automatically falls back to a
deterministic, evidence-grounded (but less personalized) hint rather than
erroring — see "Failure isolation" below. The app is otherwise fully
functional with blank keys.

### Environment variables

See `.env.example` for the full list with comments. Summary:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase project |
| `GROQ_API_KEY`, `GROQ_MODEL_FAST`, `GROQ_MODEL_STRONG` | Groq provider — model IDs intentionally not hardcoded in source |
| `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_STRONG` | Gemini provider |
| `HINT_LADDER_PRIMARY_PROVIDER` | `groq` or `gemini` — the other is the automatic fallback |
| `HINT_LADDER_MAX_LEVEL_{PRACTICE,ASSESSMENT,INTERVIEW}` | Server-enforced ceilings per mode |
| `HINT_LADDER_RATE_LIMIT_WINDOW_MS`, `HINT_LADDER_RATE_LIMIT_MAX_REQUESTS` | Rate limiting |

### Run commands

```bash
npm run test        # 84 tests (vitest run)
npm run typecheck   # tsc --noEmit
npm run build        # next build
npm run dev           # next dev
```

## Verification actually performed in this environment

Everything below was actually executed, not just written and assumed
correct — several genuine bugs were caught and fixed this way (see
"Known limitations" for what could NOT be verified here and why).

- **84/84 automated tests passing** (`npm run test`): unit tests for the
  policy engine, evidence analyzer, code locator, root-issue builder,
  anti-repetition tracker, provider router, and AI generation
  orchestration; integration tests including the exact golden end-to-end
  scenario from the spec (6/10 → 7/10 → 10/10, `tests/integration/golden-scenario.test.ts`)
  and concurrency/idempotency; security tests for solution-leakage,
  hidden-test-data scrubbing, prompt-injection (including a tag-breakout
  attempt and a simulated fully-compliant malicious model response),
  authorization/IDOR, and mode-policy bypass attempts.
- **`tsc --noEmit` clean** across the entire project, backend and frontend.
- **`next build` succeeds** — a real production build compiling all 7
  routes (this caught a genuine Next.js 15 API change: `params` is now a
  Promise in dynamic routes, fixed in `workspace/[problemId]/page.tsx`).
- **RLS verified against a real local Postgres 16 instance** (not just
  written and assumed correct): installed Postgres, applied the actual
  migration file, created a non-superuser role (RLS doesn't apply to
  superusers), and ran `supabase/rls_tests/rls_test.sql` — 10/10 checks
  passed: cross-student read/write isolation on both tables, student_id
  spoofing rejected, unauthenticated access sees nothing, and the DB-level
  idempotency constraint actually rejects duplicate request ids. Re-run it
  yourself with `supabase/rls_tests/run_rls_tests.sh`. Two real bugs were
  caught and fixed in the *test script itself* this way (documented in the
  script's header comment) — `SET LOCAL` outside an explicit transaction
  silently no-ops in psql's autocommit mode, and psql doesn't interpolate
  `:'var'` inside dollar-quoted `DO $$ ... $$` blocks.
- Two genuine application bugs were caught by the integration tests and
  fixed (not hypothetical — see git-style history in the engineering
  report): the "same issue, go deeper" continuity check was originally
  keyed on a coarse regex-based concept classifier that didn't recognize
  two differently-shaped boundary bugs as the same issue; and a real
  optimistic-concurrency race (double-tapping the hint button) originally
  surfaced a raw 409 instead of being retried transparently.

## Known limitations

- **No live AI provider calls were made** — no API keys were available
  (and none should be, per the instructions to leave them blank). The
  provider request/response shapes were verified against current Groq and
  Gemini API documentation, but an actual network round-trip against a
  live model was not exercised. `tests/unit/router.test.ts` and
  `tests/unit/ai-hint-generator.test.ts` exercise the full call/retry/
  fallback logic against a fake provider instead.
- **No live Supabase project** — the Supabase-backed repository
  (`repository/supabase-repository.ts`) is type-checked and structurally
  mirrors the in-memory repository the tests exercise, but was not run
  against a live Supabase instance (only local vanilla Postgres, for RLS).
- **`ExistingSystemsAdapter` is a stand-in** — see above. The real
  integration work (wiring this interface to CodeForge's actual
  problem/submission/execution/coaching-session tables) can't be done
  without that repository.
- **Institutional/staff RBAC is not modeled** — the real CodeForge
  authorization rules for staff/institutional access weren't available to
  inspect. RLS policies cover student-owns-own-row; an extension point and
  example policy for staff access is commented in the migration.
- **Rate limiting is in-memory** — fine for a single server process /
  local dev, explicitly documented as needing a shared backing store
  (Redis/Upstash, or whatever CodeForge's other rate limiting already
  uses) for a real multi-instance deployment.
- **No live load/concurrency testing at scale** — concurrency correctness
  is verified via `Promise.all` races in tests and the optimistic-
  concurrency retry loop, not a real load test.
- **React component rendering was not visually tested** in a browser
  (no display in this sandbox) — verified via `tsc --noEmit` and `next
  build` succeeding, not a rendered screenshot.
