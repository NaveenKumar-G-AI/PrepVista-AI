# CodeForge — Code Correctness Analysis Engine

A deterministic-evidence-first correctness engine: it classifies a submission
from real compiler/test evidence, runs real static analysis, and only then
asks an AI provider for an *explanation* — never a *verdict*. See
`../ENGINEERING_REPORT.md` (one level up, alongside this package) for the
full write-up, architecture notes, and known limitations.

## Why this is a standalone package, not "inside" an existing app

No CodeForge repository was present to extend (see the Known Limitations
section of the engineering report). This is built as a self-contained
package with clean interfaces (`CorrectnessRepository`, `AIProvider`,
`SubmissionOwnershipLookup`, the `executionEvidence` / `submissionSource` /
`requirements` adapters in `src/api/handlers.ts`) so it can be dropped into
an existing monorepo (e.g. `packages/correctness-engine`) and wired to real
auth, real submission storage, and a real execution engine without
duplicating any of them.

## Install

```bash
npm install
```

## Run tests

```bash
npm test              # full suite (vitest run)
npm run typecheck      # tsc --noEmit
```

80 tests across deterministic classification, requirement coverage,
regression/delta detection, static analysis (real gcc/g++/javac/CPython
ast/acorn), AI response validation, prompt-injection defense, hidden-test
protection, authorization, idempotency, and concurrency, plus one golden
end-to-end fixture.

## Verify Row Level Security against a real Postgres database

This actually stands up Postgres, applies the real migrations, and proves
cross-user isolation with live queries — it does not just read the SQL and
assert it looks right.

```bash
# requires postgresql to be installed and the service running
bash db-verification/run_rls_verification.sh
```

## Environment variables

None of these are set in this repository — set them in your deployment
environment. No secret values are present anywhere in this codebase.

| Variable | Required for | Notes |
|---|---|---|
| `GROQ_API_KEY` | `GroqProvider` | Server-side only. Never sent to the client. |
| `GEMINI_API_KEY` | `GeminiProvider` | Server-side only. Never sent to the client. |
| `SUPABASE_URL` | `SupabaseCorrectnessRepository` | Your project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | `SupabaseCorrectnessRepository` | **Service role**, not the anon/public key — writes must bypass RLS because the server derives `user_id`/`status`, not the client. Never expose this key to the browser. |

Construct providers/repository like:

```ts
import { GroqProvider } from "./src/ai/providers/groq.js";
import { GeminiProvider } from "./src/ai/providers/gemini.js";
import { createClient } from "@supabase/supabase-js";
import { SupabaseCorrectnessRepository } from "./src/persistence/supabaseRepository.js";

const aiProvider = process.env.GROQ_API_KEY
  ? new GroqProvider(process.env.GROQ_API_KEY)
  : process.env.GEMINI_API_KEY
    ? new GeminiProvider(process.env.GEMINI_API_KEY)
    : null; // engine still fully functions deterministically with no provider at all

const repo = new SupabaseCorrectnessRepository(
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
);
```

## Apply database migrations

Run the files in `src/persistence/migrations/` in order (0001 → 0004)
against your real Supabase project's SQL editor or migration tool. Do **not**
run anything under `db-verification/` against real Supabase — those files
are a local-only shim that recreates Supabase's `auth.uid()`/roles on a bare
Postgres instance purely so RLS can be verified in an environment that
doesn't have real Supabase.

## Wire into your app

1. Implement `SubmissionOwnershipLookup`, the `executionEvidence` adapter,
   `submissionSource` adapter, and `requirements` adapter in
   `src/api/handlers.ts` against your actual submissions/execution/problem
   tables.
2. Register routes (`src/api/exampleExpressRoutes.ts` is illustrative —
   adapt to your actual router).
3. Call `toCodeCoachSignal(assessment)` / `toHintLadderFindings(assessment)`
   from `src/integrations/` wherever your existing Code Coach / Hint Ladder
   currently consume submission results.
4. Drop `frontend/CorrectnessReport.tsx` into your UI and re-point the
   `tokens` object at the top of the file to your real design system.
