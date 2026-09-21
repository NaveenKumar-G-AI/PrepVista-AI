# AI Code Coach — standalone reference engine (for CodeForge AI)

## What this is

A standalone, tested implementation of the evidence-grounded AI Code Coach
engine described in the product spec, built to be dropped into an existing
CodeForge codebase. **No CodeForge repository was present in the build
environment** this was created in, so it ships as an integration-ready
package rather than a diff against real code. See `ENGINEERING_REPORT.md`
for the honest, section-by-section status of every requirement in the spec.

Stack assumed (stated, not confirmed — nothing here could verify it):
TypeScript, Next.js App Router API routes, Supabase/Postgres with RLS,
Groq + Gemini as LLM providers. The `src/` engine itself is framework-free;
only `examples/` assumes Next.js and React.

## Layout

- `src/` — the engine: types, Zod-validated structured output, layered
  prompt construction, provider abstraction (Groq/Gemini + a test-only
  mock), context assembly with hidden-data stripping, grounding/injection/
  policy guards, anti-repetition, deterministic attempt comparison,
  telemetry, rate limiting, and a Supabase-shaped repository. Framework-free,
  type-checked, unit-tested.
- `src/__tests__/` — 23 tests across 7 files, including the exact
  8/12 → 10/12 → 12/12 end-to-end learning scenario from the spec.
- `db/migrations/` — Postgres schema + row-level security for coach
  sessions, messages, observations, and state.
- `examples/` — a Next.js route file and a React coaching panel. Both are
  illustrative and clearly mark the seams that need your real auth/db/
  execution code; neither is type-checked as part of `src/`.
- `.env.example` — provider keys, left blank on purpose.

## Run it

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Last run in this build: **typecheck clean, 23/23 tests passing.**

## Wiring it into CodeForge

1. Copy `src/`, `db/migrations/`, and `.env.example` into your repo.
2. Set real `GROQ_API_KEY` / `GEMINI_API_KEY` in your deployment environment.
3. In `db/migrations/0001_create_coach_tables.sql`, point the two TODO'd
   spots at your actual `problems` table and user table, then run it.
4. In `examples/nextjs-api-routes.example.ts`, replace the commented-out
   imports with your real Supabase server client, problem lookup, and
   execution-result lookup, then split the three exported functions into
   real `route.ts` files at the paths noted in that file's header comment.
5. Drop `examples/CoachPanel.example.tsx` into your workspace layout and
   restyle the `--coach-*` tokens to match CodeForge's real design system.
6. Wire `onNavigate` in the panel to your editor's actual jump-to-line API.

## Why this isn't wired into "the real thing"

There's no CodeForge repository in the build environment to inspect, so
nothing here claims to reuse your actual auth, execution pipeline, or
schema — doing that honestly requires your actual code. Upload it (a zip)
or share a public GitHub URL and this becomes a real integration instead of
a reference package.
