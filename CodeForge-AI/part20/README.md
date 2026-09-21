# CodeForge Code-Reasoning Consistency Engine

## What this actually is

This was built **without access to your CodeForge repository** — none was
attached to the conversation that produced it. The original spec's first
step ("inspect the existing codebase") wasn't possible, so this is a
**standalone, real, tested TypeScript module**, not a patch applied to your
real app. It's designed so integrating it is mostly wiring, not rewriting:
one file (`src/evidence/adapters.ts`) is the entire seam between this engine
and your actual database, execution engine, complexity analyzer, and
reasoning-verification system.

Everything in here actually runs: `npm install && npm run typecheck && npm test`
all pass in a clean environment with **zero API keys set** — the AI layer has
a deterministic fallback path specifically so the pipeline is verifiable
without live provider access (see "AI provider" below).

## What's real vs. what's a stub

**Real, tested, dimension-specific logic (7 of 12 dimensions):**
`ALGORITHM_ALIGNMENT`, `DATA_STRUCTURE_ALIGNMENT`, `STATE_ALIGNMENT`,
`COMPLEXITY_ALIGNMENT`, `SPACE_ALIGNMENT`, `EDGE_CASE_ALIGNMENT`,
`CORRECTNESS_ALIGNMENT`. Each has deterministic comparison logic plus an
AI-assisted semantic-equivalence fallback for free-text claims.

**Pipeline-complete but evidence-stubbed (5 of 12 dimensions):**
`PROBLEM_ALIGNMENT`, `CONTROL_FLOW_ALIGNMENT`, `BEHAVIOUR_ALIGNMENT`,
`IMPLEMENTATION_DECISION_ALIGNMENT`, `OPTIMIZATION_ALIGNMENT`. These flow
correctly through the graph, scoring, and reconciliation machinery, but this
build has no dedicated fact source for them yet, so they honestly report
`INSUFFICIENT_EVIDENCE` instead of guessing from a claim with nothing to
check it against. See `src/engine/dimensionComparators/genericComparator.ts`
— give each of these its own comparator (same pattern as `complexity.ts`)
once you have a real fact source to compare against.

**Not built in this pass, and why:**
- **Frontend (heatmap, claim explorer).** The spec says to reuse your
  existing design system; none was available to inspect, and building a
  generic UI would misrepresent that instruction. The API responses
  (`ConsistencyAnalysisResult`) have everything a UI needs.
- **Live AI calls.** No keys were provided (per your instructions), and this
  build's sandbox network doesn't reach `api.groq.com` /
  `generativelanguage.googleapis.com` anyway. The Groq/Gemini adapters in
  `src/ai/providers.ts` are structurally complete but untested against a live
  API — verify endpoint/param names against current provider docs.
- **Live Supabase deployment.** The migration in `db/migrations/` was never
  run against a real database.
- **Actual repo integration.** Table names, auth, and adapter internals are
  written against reasonable assumptions (Next.js + Supabase), not your real
  schema, because that schema wasn't available.

## Architecture

```
src/types/          Domain types shared by everything else
src/config/          Centralized weights/thresholds (scoring.config.ts)
src/security/        Ownership checks + prompt-injection observability flags
src/ai/               provider.ts (interface + NullAIProvider)
                      providers.ts (illustrative Groq/Gemini adapters)
                      promptTemplates.ts (injection-safe prompt construction)
                      semanticEquivalence.ts (AI + deterministic fallback)
src/evidence/         adapters.ts — THE INTEGRATION SEAM (see below)
src/engine/           scoring.ts, claimGraph.ts, modelBuilders.ts,
                      reconciliation.ts, consistencyEngine.ts (orchestrator)
src/engine/dimensionComparators/   one file per dimension
db/migrations/        Postgres/Supabase schema + RLS (not yet applied anywhere)
api/routes.ts         Illustrative Next.js route handlers
tests/                 Real vitest suite, runs with zero external dependencies
```

## The integration seam: `src/evidence/adapters.ts`

The engine never touches your database, execution sandbox, AST parser, or
reasoning-verification system directly — it only calls the five methods on
`EvidenceAdapters`. To integrate:

1. Implement `EvidenceAdapters` in your repo, delegating each method to the
   system that already produces that evidence (your execution engine, your
   complexity analyzer, your reasoning-verification output, your AST/static
   analysis).
2. Return `null` / `[]` wherever real evidence genuinely isn't available —
   every comparator is written to degrade to `UNKNOWN` /
   `INSUFFICIENT_EVIDENCE` rather than guess.
3. Pass your implementation into `runConsistencyAnalysis({ ..., adapters })`.

This is also the reason the "never fabricate evidence" rule is actually
enforceable here: there's exactly one place evidence enters the system.

## AI provider

`src/ai/provider.ts` defines the `AIProvider` interface. `NullAIProvider`
(used when no key is configured) always returns `NOT_CONFIGURED`, and every
call site is required to fall back to a deterministic heuristic — this is
what lets `npm test` pass with zero keys. `src/ai/providers.ts` has
illustrative Groq/Gemini adapters; the spec asks you to reuse your *existing*
provider abstraction instead of a new one, so treat these as a reference for
the `AIProvider` contract and either adapt your existing client to implement
it, or swap `getConfiguredAIProvider()` for your own.

## Running it

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run — all pass with zero env vars set
```

## Environment variables

See `.env.example`. All blank by default, as requested:

- `GROQ_API_KEY`, `GROQ_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODEL`

## Database

`db/migrations/001_consistency_tables.sql` adds `consistency_analysis`,
`consistency_finding`, `consistency_relationship`, and
`reconciliation_response`, with RLS policies assuming Supabase-style
`auth.uid()` and an existing `submissions(id, user_id)` table. **Check every
table/column name against your real schema before running it.**

## Known simplifications worth knowing about

- **Claim-graph contradiction propagation is symmetric**, not strictly
  directional (see the comment in `src/engine/claimGraph.ts`). It treats
  `SUPPORTS`/`DEPENDS_ON`/`IMPLIES`/`CAUSES`/`IMPLEMENTS`/`REQUIRES` as
  reliance links in both directions, favoring "flag a possibly-affected
  claim" over silently missing one. Tighten this once real claim-relationship
  data shows which direction matters in practice.
- **Algorithm/data-structure pattern detection** is a small keyword +
  required-signal registry (`PATTERNS` in `algorithm.ts`), not a general
  program-understanding system. Extend the registry with your own
  repo-specific patterns as you see false negatives.
- **`SPACE_ALIGNMENT`** only verifies the "claimed constant, actually grows"
  case deeply; non-constant space claims get low-confidence partial credit
  rather than a fully verified verdict.
