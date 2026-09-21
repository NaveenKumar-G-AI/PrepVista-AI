# CodeForge Architecture

## What this is

A standalone reference implementation of the CodeForge personalized coding
challenge engine — the same pattern already used for PrepVista's Part 6 and
Part 13 (see the project's own history): built without access to the real
PrepVista repository, designed to be integrated into it, not deployed as-is.
See `docs/IMPLEMENTATION_MANIFEST.md` for exactly what that does and doesn't
cover.

## The loop this implements

```
Student Technical Profile  →  src/domain/types.ts (StudentProfile)
Skill/Gaps                 →  src/engine/skillGapAnalyzer.ts
Challenge Selection        →  src/engine/challengeSelector.ts
Coding Challenge           →  src/data/seedChallenges.ts (or src/generation/*)
Real Code Execution        →  src/execution/executor.ts
Evaluation                 →  src/evaluation/evaluationService.ts
Mistake/Evidence Extraction→  src/engine/mistakeClassifier.ts
Profile Update             →  src/service/codeforgeService.ts (updateProfileFromAttempt)
Next Challenge             →  back to Challenge Selection
```

`src/service/codeforgeService.ts` is the one module that knows about every step —
everything else is independently testable and (mostly) independently
understandable. `src/demo/runDemo.ts` runs the whole loop for real; it's the
fastest way to see how the pieces fit together.

## Module map

| Path | Responsibility | Calls out to AI? |
|---|---|---|
| `src/domain/` | Types, enums, skill taxonomy. No logic. | No |
| `src/data/seedChallenges.ts` | Hand-authored challenge content | No |
| `src/execution/` | Sandboxed subprocess execution of student code | No |
| `src/engine/skillGapAnalyzer.ts` | Turns profile + misconceptions into ranked gaps | No |
| `src/engine/challengeSelector.ts` | Weighted, interpretable ranking (§11) | No |
| `src/engine/difficultyPolicy.ts` | Explicit next-difficulty rules (§14) | No |
| `src/engine/mistakeClassifier.ts` | Rule-based mistake taxonomy + misconceptions | No |
| `src/engine/hintService.ts` | Progressive hint retrieval | No |
| `src/evaluation/evaluationService.ts` | Deterministic eval (final) + AI eval (advisory) | Yes — AI side only |
| `src/ai/` | Provider abstraction, Groq/Gemini adapters, resilience chain | Yes |
| `src/generation/generationPipeline.ts` | AI draft → independent validation → REVIEW | Yes — draft only |
| `src/service/codeforgeService.ts` | Orchestrates everything; the §46 API surface | Indirectly |
| `src/store/store.ts` | In-memory repository (swap for Supabase — see below) | No |
| `src/api/server.ts` | Dependency-free HTTP layer over the service (§46) | No |
| `src/web/index.html` | Framework-free coding workspace UI (§40, §47-49) | No |

**The rule that shapes this table:** every row that touches AI is also a row
whose output something *else* checks. `challengeSelector.ts` never calls AI —
its ranking is a plain weighted sum, fully described in
`docs/CODEFORGE_CHALLENGE_ADAPTATION_AND_EVALUATION.md`. `generationPipeline.ts`
calls AI exactly once (the draft) and spends the rest of its logic verifying that
draft against the same execution engine that grades students. This is the direct
implementation of §11 ("do not let an LLM arbitrarily decide") and §17 ("AI must
not certify its own answer") — not a policy statement, a structural one.

## Why the store is an interface, not a Postgres client

`InMemoryStore` (`src/store/store.ts`) implements every method
`CodeForgeService` needs, backed by plain `Map`s. `db/migrations/0001_init.sql`
is the Postgres/Supabase shape the same data would take in production. Nothing
in `src/engine` or `src/service` imports a database client directly — swapping
`InMemoryStore` for a `SupabaseStore` with the same method signatures is the
entire integration step for persistence. This split is what makes "build it
standalone, integrate it yourselves" actually feasible instead of aspirational.

## Why execution is a single narrow interface

`runTestCase()` (`src/execution/executor.ts`) is the *only* function anywhere in
this codebase that shells out to run untrusted code. Everything above it —
`evaluationService.ts`, `generationPipeline.ts`, tests — calls it the same way,
whether the code under test is a student's submission or an AI-drafted reference
solution. If the real PrepVista repository already has an execution/sandbox
service (§21 explicitly says to reuse one if it exists, not duplicate it), this
is the one file to redirect — swap the subprocess call for a call to that
service, keep the `(language, code, entryFunction, testCase) → ExecutionResult`
contract, and nothing upstream changes. See
`docs/CODEFORGE_CHALLENGE_SECURITY.md` for exactly what this prototype's
version does and does not isolate.

## Integration checklist (for whoever wires this into the real repo)

1. Point `students(id)` references in `db/migrations/0001_init.sql` at the real
   students table (§2 — do not create a duplicate).
2. Decide where `InMemoryStore` gets replaced — likely a thin `SupabaseStore`
   implementing the same methods against the tables in that migration.
3. Decide whether `src/execution/executor.ts`'s subprocess approach is
   acceptable for a first deployment, or whether it should be redirected at an
   existing/hardened execution service first (see the security doc — this
   matters more than anything else on this list).
4. Set `GROQ_API_KEY` and/or `GEMINI_API_KEY`; `buildDefaultProviderChain()`
   (`src/ai/providers.ts`) picks them up automatically and falls back to the
   offline provider if neither is set, so the system degrades rather than
   breaking if a key is missing.
5. `src/api/server.ts` already exposes `src/service/codeforgeService.ts` over
   HTTP (`npm run serve`) — swap its hand-rolled routing for whatever
   framework the rest of PrepVista already uses (Express/Next API
   routes/etc.) if one exists; every route body is just "call a service
   method, serialize JSON," so there's no framework-specific logic to port.
6. `src/web/index.html` is a real, working starting point for the student
   UI (§40, §47-49) — open it directly in a browser (it works standalone,
   no server needed) or point its "Use live API" toggle at `npm run serve`.
   It was never loaded in a real browser during this build (see the
   manifest) — that's the first thing to do with it, before anything else
   on this list.

