# CodeForge AI — Understanding Check

Evidence-driven assessment of whether a student *genuinely understands* the
solution they submitted — decoupled from whether their code is correct.

> **Important scoping note.** The original spec assumes this is built *inside*
> an existing CodeForge repository ("Phase 0 — Repository Intelligence:
> inspect the entire existing CodeForge repository..."). No such repository
> was provided — this package was built standalone. It is a complete,
> genuinely working, tested system, structured so the engines/AI/API layers
> drop into an existing Next.js + Postgres/Supabase codebase with minimal
> glue (see "Integration guide" below). Nothing here is a mockup: every
> module listed below is real logic, and the 55 automated tests actually
> execute it.

## Quick start

```bash
npm install
cp .env.example .env      # fill in GROQ_API_KEY and/or GEMINI_API_KEY — left blank on purpose
npm run typecheck
npm test
```

All engine logic and API controllers run and are tested with **zero API
keys** via a dependency-injected mock AI provider (`src/ai/mockProvider.ts`).
Keys are only needed to make real Groq/Gemini calls at runtime.

## Integration guide (for your actual CodeForge repo)

1. Copy `src/`, `db/migrations/0001_understanding_check.sql` into your repo.
2. Implement `AssessmentRepository` (`src/api/controllers.ts`) against
   Postgres/Supabase, matching the migration's tables. `InMemoryRepository`
   in the same file is a complete reference implementation — copy its
   method shapes 1:1, swap `Map`s for queries.
3. Wire `src/api/adapters/nextjs-routes.example.ts` into real
   `app/api/understanding/**/route.ts` files — swap the three stub
   declarations (`getCurrentUser`, `getRepository`) for your real session
   and DB code.
4. Drop `defaultProviderChain()` (`src/ai/provider.ts`) in wherever
   CodeForge already builds its Groq/Gemini clients, or replace it with
   CodeForge's existing provider abstraction if one exists — every engine
   here depends only on the `AIProvider` interface, not on Groq/Gemini
   directly.
5. Render `VisualUnderstandingProfile` / `EvidenceExplorer` wherever a
   submission's result page lives; both are self-contained (design tokens
   via inline CSS vars) and only need `IBM Plex Mono` / `IBM Plex Sans`
   loaded in your root layout to look as designed (they degrade to
   system fonts otherwise).
6. If CodeForge already has complexity/quality/reasoning-consistency
   analyzers, pass their output via `StudentSubmission.existingAnalysis` —
   `mentalModel.ts` is written to treat that as ground truth and never
   re-derive it.

---

## Architecture decisions

- **Deterministic core, AI at the edges.** Scoring, confidence, evidence
  weighting, dimension status, result classification, and adaptive probe
  *selection* (which dimension/rung/type to ask next) are 100% deterministic
  pure functions (`src/understanding/scoringEngine.ts`,
  `evidenceEngine.ts`, `probeEngine.ts`, `resultClassification.ts`). AI is
  used only where deterministic logic genuinely can't do the job: reading
  the student's code/prose (mental-model extraction, probe question
  generation, response evaluation). This is what makes the scoring model
  explainable and unit-testable without any network access, per the spec's
  "document and test the scoring model" requirement.
- **Framework-agnostic controllers, thin adapters.** `src/api/controllers.ts`
  takes/returns plain objects and depends on a `AssessmentRepository`
  interface, not a specific DB client. No Next.js app was scaffolded (no
  existing repo to integrate with) — instead there's one adapter file
  showing the exact Next.js App Router mapping, safe to split into real
  route files once dropped into your app.
- **Provider abstraction with real fallback.** `src/ai/provider.ts`
  implements actual `GroqProvider`/`GeminiProvider` classes (real `fetch`
  calls, real request shapes) behind a common `AIProvider` interface and a
  `ProviderChain` that falls through on failure. `structuredCall.ts` adds
  schema validation (zod) with one repair-retry before giving up —
  matching "malformed output must trigger safe retry/fallback behavior."
- **Security is structural, not just a filter.** Student content is never
  concatenated into a system prompt; every prompt builder in `ai/prompts.ts`
  fences student text with explicit markers and an isolation notice telling
  the model that fenced content is data, not instructions (see
  `security/index.ts`). The pattern-based injection detector is a *second*,
  defense-in-depth layer that damps confidence — it never decides
  correctness by itself.
- **Debugging probes never touch the student's real submission.** The
  mutation engine (`generators/transformationProbes.ts`) operates on a
  copy of the source string; the mutation's answer-adjacent description is
  folded into the server-only `expected_evidence` field and deliberately
  kept out of `ProbeGrounding`, so `toPublicProbe()` can't leak it even by
  accident.
- **Procedural vs. conceptual are structurally independent.** Procedural
  leans on deterministic execution evidence (test pass rate) plus the four
  "can you describe what you built" dimensions; conceptual is the
  weighted-by-role average of the nine deeper dimensions. They are computed
  from disjoint dimension sets, so one can genuinely be 94 while the other
  is 61, as the spec requires.

## Files created

```
db/migrations/0001_understanding_check.sql   6 new tables + RLS policies (additive only)
src/types/index.ts                           shared domain types (13 dimensions, 12 probe types, etc.)
src/security/index.ts                        prompt-injection isolation, ownership checks, sanitization
src/ai/{provider,schemas,prompts,structuredCall,mockProvider}.ts
src/understanding/{mentalModel,evidenceEngine,scoringEngine,probeEngine,
                    resultClassification,recommendationEngine}.ts
src/understanding/generators/{executionProbes,reasoningProbes,transformationProbes,index}.ts
src/api/controllers.ts                       createAssessment / generateProbe / submitResponse /
                                              getResult / getHistory + InMemoryRepository
src/api/adapters/nextjs-routes.example.ts    reference HTTP wiring (not part of the build/test path)
src/components/{VisualUnderstandingProfile,DimensionCard,EvidenceExplorer}.tsx
src/observability/metrics.ts                 structured event emitter, vendor-agnostic
tests/{engines,security,scenarios}.test.ts + fixtures.ts    55 tests
```

## Files modified

None — no existing repository was available to modify (see scoping note above).

## Database changes

New, additive-only migration: `understanding_assessments`, `understanding_dimensions`,
`understanding_probes`, `understanding_responses`, `understanding_evidence`,
`understanding_history`. Indexes on every foreign key + status/time lookups
used by the API; RLS policies restrict students to their own rows;
`understanding_probes` deliberately has **no** client-facing RLS select
policy (it's served exclusively through `toPublicProbe()`, which strips
`expected_evidence`). Foreign keys assume `users`, `challenges`,
`submissions` tables exist already — adjust names to match your real schema.

## API changes

Five controller functions (`src/api/controllers.ts`), each independently
authorized and validated: `createAssessment`, `generateProbe`,
`submitResponse`, `getResult`, `getHistory`. Reference Next.js route mapping
in `src/api/adapters/nextjs-routes.example.ts`.

## Frontend changes

Three components, diagnostic-console visual language (see
`frontend-design` rationale in `DimensionCard.tsx`'s header comment): score +
confidence + evidence-strength badge + an **evidence thread** — a literal
row of marks, one per probe, colored by result — so a score is never shown
without its trail. `EvidenceExplorer` renders the full
concept→probe→response→expected→observed→assessment→recommendation chain
the spec requires, nothing hidden behind a single number.

## AI changes

`GroqProvider` + `GeminiProvider` behind `AIProvider`, tried in that order
via `ProviderChain`. Every AI call is schema-validated (zod →
`structuredCall`), gets one repair-retry, then degrades to an honest
"insufficient evidence" / template fallback rather than fabricating a
result. Mental-model extraction treats any existing CodeForge
complexity/quality analysis as ground truth and only asks AI to fill in
what deterministic analysis can't (algorithm steps, invariants, variable
meanings).

## Security changes

- Structural prompt-injection isolation (student text always fenced,
  system prompt explicitly names it as untrusted data) — `ai/prompts.ts`.
- Pattern-based injection detector as defense-in-depth, damping (not just
  flagging) confidence when triggered — `security/index.ts`,
  wired into `submitResponse`.
- Ownership checks (`assertOwnership`) on every read/write controller.
- Debugging-probe answer isolation (mutation description never reaches
  `ProbeGrounding`, only `expected_evidence`, which `toPublicProbe()` strips).
- Input length capping (4000 chars) before anything reaches a prompt.

## Tests executed

```
npm test
 ✓ tests/scenarios.test.ts (21 tests)
 ✓ tests/engines.test.ts   (22 tests)
 ✓ tests/security.test.ts  (12 tests)
 Test Files  3 passed (3)
      Tests  55 passed (55)
```

Coverage includes every scenario the spec's Testing + Adversarial Testing
sections name: strong understanding, explanation-only/memorization-resistant
pattern (asserted to never contain accusatory language), a single-dimension
gap (invariant), complexity ground-truth handling, debugging via code
mutation (with public-leak check), transfer-probe distinctness, ambiguous →
clarifying follow-up, imperfect-English fairness, AI failure at each of the
three call sites (mental model / probe generation / evaluation) with
verified graceful fallback, missing-execution confidence damping,
prompt-injection containment, short/long adversarial input, cross-student
authorization, structured-output repair-retry and degrade, provider-chain
fallover, and a full end-to-end "judge demonstration" run (gap surfaces
under probing → targeted reassessment → profile updates).

## Test results

**55/55 passing.** Every numeric assertion in `tests/engines.test.ts` is
hand-derived from the documented formulas in code comments, then verified
against the actual implementation (not just asserted against whatever the
code happened to output).

## Performance considerations

- Mental-model extraction and complexity/quality reuse avoid redundant AI
  calls (`mentalModel.ts` only asks AI for fields deterministic analysis
  doesn't provide).
- Probe generation context is scoped to the target dimension's own prior
  evidence (`summarizePriorEvidence`, last 6 items), not the whole
  assessment history.
- `MAX_PROBES_PER_DIMENSION = 3` and a configurable `maxProbes` budget
  bound worst-case AI calls per assessment.
- All AI calls have a 20s timeout (`provider.ts`) so a stalled request can't
  hang a request indefinitely.
- `observability/metrics.ts` is a zero-dependency in-process emitter —
  wire a real sink at startup; a broken sink can't break the request path
  (`try/catch` around every sink call).

## Known limitations

- No live network test against real Groq/Gemini in this environment (the
  sandbox has no route to those APIs and no keys) — verified instead via
  `MockAIProvider`, which implements the exact same interface, so the
  integration point is real even though this session couldn't dial out to
  it live.
- `InMemoryRepository` is a reference implementation for tests/local use,
  not production persistence — see the migration + interface for the
  contract a real adapter must satisfy.
- The Next.js route adapter is illustrative (excluded from
  typecheck/build/test on purpose) since no Next.js app exists here to
  compile it against.
- Role-aware emphasis (`evidenceEngine.ts`'s `DEFAULT_ROLE_EMPHASIS`) is a
  reasonable default mapping, not a real role taxonomy — pass your own
  `RoleContext.dimensionEmphasis` to override it per the spec's "consume
  existing role context" instruction.
- Project-/repository-level understanding (multi-file architecture
  questions) is not implemented — the dimension/evidence model generalizes
  to it, but there's no real multi-file CodeForge project system here to
  ground it against.
- No CI config, no queue/background-job infra, no specific observability
  vendor wiring — these are genuinely repo-specific and were left as clean
  extension points rather than guessed at.

## Remaining work

1. Swap `InMemoryRepository` for a Postgres/Supabase adapter.
2. Wire real session/auth into `getCurrentUser` in the route adapter.
3. Fill in `.env` with real Groq/Gemini keys and confirm a live call.
4. Load `IBM Plex Mono` / `IBM Plex Sans` in the host app for the components
   to render as designed.
5. If CodeForge has an existing role-selection system, pass its output
   through `RoleContext` rather than relying on the built-in defaults.
