# CodeForge AI — Technical Growth Intelligence & Skill Progression

A standalone, production-style implementation of the Growth Intelligence
system, built to be merged into the real CodeForge AI repository.

**No CodeForge repository was available in this environment** — nothing
was uploaded or connected, so none of this was written against your
actual file structure, skill taxonomy, user tables, or existing engines.
Every integration point that would normally come from "inspect the
existing repo first" is instead a small, explicit adapter you wire up
(see **Integrating this into CodeForge AI** below). Read
`IMPLEMENTATION_REPORT.md` for the honest, section-by-section account of
what's fully implemented, what's partial, and what's out of scope —
that file uses the exact report structure the build spec asked for.

## What's actually here

- A full evidence → skill-state → trajectory → regression/recovery →
  transfer/retention → events → milestones → snapshots pipeline, in
  `src/`, with real deterministic logic (no stubs, no hardcoded states).
- **50 automated tests, all passing**, including a complete run of the
  spec's own "Golden Scenario" (`src/__tests__/golden-scenario.integration.test.ts`)
  through the real pipeline. `npx vitest run` reproduces this.
- The whole `src/` and `frontend/` tree **type-checks clean**
  (`npx tsc --noEmit`) under `strict` + `noUncheckedIndexedAccess`.
- Postgres/Supabase migrations (schema + RLS) — written and reviewed,
  **not executed against a live database** (none is connected here).
- 5 React components (student dashboard, skill evolution view w/ a
  custom trajectory chart, growth timeline, milestone strip, instructor
  view) — type-checked, not visually rendered in a browser (no Next.js
  app is running in this sandbox).
- An AI insight layer with prompt-injection defense and hallucination
  validation that is genuinely exercised by tests (a fake "malicious"
  provider that tries to smuggle an invented skill/evidence id is caught
  and rejected — see `src/__tests__/prompt-injection.test.ts`).

## Stack assumption

TypeScript, Next.js App Router (route handlers), Supabase/Postgres with
RLS, Zod, Vitest, React. This was inferred from your own spec document
(which names Supabase, PostgreSQL, RLS, and a Groq/Gemini AI-provider
split) and from a prior CodeForge AI build in this same conversation
history. If your actual repo uses a different framework for the API
layer, `src/api/handlers.ts` is framework-agnostic — only
`src/api/next-routes.example.ts` needs rewriting for a different router.

## Directory structure

```
db/migrations/            SQL — schema (0001) and RLS policies (0002)
src/
  types/                  Evidence, SkillState, GrowthEvent, Milestone, Insight
  config/                 growth-rules.ts (every threshold, versioned, no magic numbers)
                          roles.ts (role → growth-category emphasis)
  evidence/                validate.ts, normalize.ts
  skill-state/             aggregate.ts, confidence.ts, state-machine.ts
  trajectory/               trajectory-engine.ts
  analysis/                 regression.ts, recovery.ts, transfer.ts, retention.ts,
                             strengths-weaknesses-bottlenecks.ts
  milestones/                milestone-engine.ts (5 evidence-gated definitions)
  events/                     growth-event-engine.ts
  insights/                   ai-provider.ts, prompt-injection-defense.ts,
                               insight-schema.ts, insight-engine.ts
  repository/                  growth-repository.ts (interface), in-memory + supabase impls
  orchestration/                growth-pipeline.ts — the whole loop, one entry point
  api/                           handlers.ts (9 ops), authorization.ts,
                                  next-routes.example.ts, request-context.ts
  observability/                  logger.ts, ids.ts
  __tests__/                      50 tests, incl. the golden scenario
frontend/
  lib/                     theme.ts (design tokens), format.ts (all UI copy),
                           fixtures/golden-scenario-fixture.ts (runs the real pipeline)
  components/              GrowthDashboard, SkillEvolutionView, GrowthTimeline,
                           MilestoneCard, InstructorGrowthView
  demo/page.tsx            Illustrative Next.js page wiring everything to the fixture
```

## Running it

```
npm install
npm run typecheck   # tsc --noEmit across src/ and frontend/
npm test            # vitest run — 50 tests, incl. the golden scenario
```

No environment variables are required for install/typecheck/test — the
engine runs fully offline against `InMemoryGrowthRepository` and
`MockAIProvider`.

## Integrating this into CodeForge AI

1. **Copy `src/` into your repo** under whatever domain-directory
   convention you actually use (the spec calls this out explicitly —
   extend existing structure, don't invent a new one). Copy `frontend/`
   the same way into your components tree.
2. **Point `skill_id` at your real skill taxonomy.** Every table and type
   here treats `skillId` as an opaque string on purpose — this package
   never redefines your skill hierarchy (section 10). If your skills
   table has a different key type, adjust `db/migrations/0001_growth_schema.sql`
   and `src/types/evidence.ts`.
3. **Point `student_id` at your real users table.** The migrations
   reference `auth.users(id)` (present in every Supabase project); if
   CodeForge keys students off a separate `public.users`/`public.students`
   table, repoint the foreign keys.
4. **Apply the migrations** via your normal tool (`supabase db push` or
   equivalent) against a staging project first, then run the verification
   query at the bottom of `0002_growth_rls_policies.sql` to confirm no
   write policy leaked in for `authenticated`.
5. **Implement `src/api/request-context.ts`** — it currently throws on
   purpose. Wire it to your real session/auth and construct a
   `SupabaseGrowthRepository` with your server-side Supabase client.
6. **Implement a real `AuthorizationProvider`** (`src/api/authorization.ts`)
   backed by your actual instructor/student assignment table, and pass it
   into the handlers instead of `DenyAllAuthorizationProvider`.
7. **Wire event ingestion.** Whatever emits `challenge_completed`,
   `submission_evaluated`, `debugging_completed`, etc. in your existing
   systems should call `processEvidenceBatch()`
   (`src/orchestration/growth-pipeline.ts`) with normalized
   `RawEvidenceInput[]` — see section 56/57 for why this stays
   event-driven rather than tightly coupled.
8. **Fill in `.env.example`** with real Supabase and (optionally) Groq or
   Gemini credentials, as `.env.local` or merged into your existing env
   file. Leave the AI keys blank if you want to ship without AI narration
   first — `generateGrowthInsight()` degrades to a deterministic summary
   automatically (see `IMPLEMENTATION_REPORT.md`, "AI failure").
9. **Split `next-routes.example.ts`** into the nine real route files at
   the paths named in its comments.
10. **Supply the two taxonomy adapters** that are deliberately optional
    right now: `debuggingSkillIds` (for the `SUSTAINED_DEBUGGING_IMPROVEMENT`
    milestone) and a `skillId -> GrowthCategory` `categorize` function
    (for role-aware growth views).

Everything above is a wiring step, not a rewrite — the engine underneath
(evidence → state → trajectory → events → milestones) doesn't change.
