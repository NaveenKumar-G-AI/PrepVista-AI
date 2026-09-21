# CodeForge AI — Submission System

Immutable submission snapshots → queue → worker → secure execution → public/hidden
evaluation → deterministic verdict → role-aware results. See `ENGINEERING_REPORT.md`
for the full account of what's implemented, what's tested, and what's blocked in this
environment.

## Quickstart

```bash
npm test          # runs all 14 test files (138 checks), ~60-90s
npm run typecheck  # tsc --noEmit across the whole project
```

No `npm install` is required to run any of the above — every file under `src/` and
`tests/` runs on Node built-ins only. `npx tsc`, `npx tsx` work because TypeScript/tsx
are already available in this environment; see "Why zero-dependency" in the report.

## Layout

```
db/migrations/     Postgres/Supabase schema, RLS policies, SECURITY DEFINER functions
src/domain/        enums, types, the state machine, config (single source of limits)
src/services/      validation, hashing, idempotency-aware orchestration, result
                    aggregation/verdict classification, rate limiting, DTOs, sanitization
src/execution/     ExecutionProvider interface + the dev/test reference sandbox
src/repository/    SubmissionRepository interface + in-memory (tested) and
                    Supabase (written, unexecuted here) implementations
src/worker/        the worker loop, stuck-job sweeper, problem/test-data resolver seam
src/api/           framework-agnostic HTTP handlers
src/frontend/      React components for the coding workspace
tests/             14 files, 138 checks — see ENGINEERING_REPORT.md for what each proves
```

## Wiring this into the real CodeForge repo

1. `npm install @supabase/supabase-js` and fill in `.env` from `.env.example` (every
   value ships blank on purpose).
2. Run the migrations in `db/migrations/` in order against your Supabase project.
   `0004_optional_external_fk_hooks.sql` is commented out until you confirm your real
   `problems`/`assessments` table names — see that file.
3. Point `0003_rls_policies.sql`'s `current_app_role()`, `is_problem_author()`, and
   `is_interviewer_for_attempt()` functions at your real role/authorship/interview-panel
   tables (they fail closed until then, so nothing is insecure in the meantime — student
   own-row access works regardless).
4. Swap `InMemorySubmissionRepository` for `SupabaseSubmissionRepository` wherever a
   `SubmissionRepository` is constructed (worker entrypoint, API route setup).
5. Implement `ProblemDataResolver` (`src/worker/problemDataResolver.ts`) against your
   real problem/test-suite/checker tables — `FixtureProblemDataResolver` is demo-only.
6. Implement `ExecutionProvider` (`src/execution/executionProvider.ts`) against
   CodeForge's real, existing secure sandbox. **Do not use
   `LocalProcessExecutionProvider` in production** — its file header explains exactly
   why, including a real incident found while testing it (see the report).
7. Wire `src/api/handlers.ts` into your actual HTTP layer — the integration note at the
   bottom of that file shows the adapter shape for a Next.js route handler.
