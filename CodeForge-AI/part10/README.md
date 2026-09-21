# Engineering Simulator — Integration Package

A working vertical slice of the Engineering Simulator spec, built the same
way CodeForge's diagnostic and PrepVista's Part 8/16 were: zero-dependency
JS core, demo-verified against fixture scenarios, one React view, a SQL
schema, and an honest truth table — not a 1,300-line prompt turned into
1,300 lines of unverified scaffolding.

Run the proof yourself before reading anything else:

```
node tests/demo.test.mjs
```

18/18 passing — the full requirement → submission → evaluation → evidence
→ revision loop, exercised against named fixtures pulled from the spec's
own Phase 68 critical-test list.

## Why one slice, not all 84 phases

Phase 0 of the brief asks for repository discovery — inspect the real
CodeForge/PrepVista codebase before writing anything. That literally can't
run in this chat: no repo connector is attached here, the container is
ephemeral, and it has no network access. Rather than guess at your actual
architecture and hand you 84 phases of code that might not compile against
your real schema, this builds one project type (Backend Service) all the
way through — real requirement, real rubric, real hidden tests, real
evaluation, real evidence — with the schema shaped to extend to the other
14 project types later. What's real is tested. What isn't is labeled, not
faked. See `TRUTH_REPORT.md`.

## Where this sits relative to what you've already built

CodeForge's diagnostic already produces a `technical_baseline`, and
PrepVista's Part 8 already does readiness/skill-gap scoring. The spec's
repeated "reuse the existing Mastery Engine, never duplicate it" (Phase 33)
almost certainly means *those* systems. Nothing here computes mastery,
readiness, or a skill level — `evidenceEngine.js` only emits signal
(`project_evidence` rows, `consumed_by_mastery_engine` flag included) for
whatever already turns evidence into a baseline. Point that consumer at
this table; don't build a second one.

The AI evaluation contract follows the same pattern used for CodeForge's
diagnostic: a schema-validated response shape, with a deterministic,
hand-authored reviewer (`demoAIReviewer.js`) standing in for a live
Groq/Gemini call so the full loop is provable without network access here.
Swap in `aiProvider.js` (real Groq/Gemini clients, same contract) when
you're ready to go live — `evaluationEngine.js` doesn't change either way.

## Architecture

```
Requirement (JSON)  ──►  Project Workspace UI  ──►  Submission
                                                          │
                                            ┌─────────────┴──────────────┐
                                            ▼                            ▼
                                   ExecutionEngineAdapter        AI Provider / Demo Reviewer
                                   (→ YOUR sandbox)              (→ schema-validated + grounded)
                                            │                            │
                                            └─────────────┬──────────────┘
                                                           ▼
                                                 evaluationEngine.js
                                              (deterministic always runs;
                                               AI only adds qualitative layer)
                                                           │
                                              ┌────────────┼────────────┐
                                              ▼            ▼            ▼
                                      rubricEngine   evidenceEngine  revisionEngine
                                     (weighted score) (→ YOUR mastery  (improvement
                                                        /readiness engine)  delta)
```

## Stack assumptions

TypeScript-friendly Supabase/Postgres, Groq + Gemini as AI providers,
Next.js-style client component for the workspace — consistent with the
rest of CodeForge/PrepVista. If your real repo differs (different DB,
different AI providers, no Next.js), say so and the relevant files can be
re-targeted; the engine layer (`src/engine/`, `src/validation/`) has zero
framework dependencies either way.

## Why the engine is plain JS, not TypeScript

Every file in `src/engine/`, `src/validation/`, and `src/ai/` is
dependency-free JavaScript with JSDoc types — not TypeScript. That's a
deliberate choice, not a shortcut: it's what let every deterministic piece
of this package actually run and get verified in this sandbox, with no
build step and no network install. `src/types.ts` mirrors the same shapes
in real TypeScript for anywhere in your stack that wants compiler-checked
types against this package (API routes, the frontend). Port the engine
files to `.ts` freely — nothing about the logic depends on staying JS.

## File guide

| File | What it is |
|---|---|
| `db/schema.sql` | Core tables + RLS for sessions, submissions, evaluations, evidence, revisions, decisions |
| `src/types.ts` | TypeScript reference types |
| `src/validation/projectSchema.js` | Project definition validation + publish quality gate (Phase 69) |
| `src/engine/rubricEngine.js` | Weighted scoring, renormalizes around whatever was actually assessed |
| `src/engine/evaluationEngine.js` | Orchestrates deterministic + AI evaluation, with fallback (Phase 43) |
| `src/engine/evidenceEngine.js` | Evaluation → evidence records for your mastery engine |
| `src/engine/revisionEngine.js` | Revision links + improvement-delta computation (Phase 38) |
| `src/engine/executionAdapter.js` | The seam to your real sandbox, + a non-secure local-only mock |
| `src/ai/aiContract.js` | AI response shape + the anti-hallucination grounding check (Phase 21) |
| `src/ai/aiProvider.js` | Real Groq/Gemini clients — reference code, not executed here |
| `src/ai/demoAIReviewer.js` | Deterministic AI stand-in, grounded in a real fixture submission |
| `src/seed/sample-project.notification-service.json` | One fully worked project definition |
| `frontend/ProjectWorkspace.tsx` | The workspace shell (Phase 45/46) |
| `tests/demo.test.mjs` | The 18-assertion proof — run it |

## Three integration seams to wire

1. **`ExecutionEngineAdapter.runTests` / `runSecurityChecks`** — point these
   at your existing sandbox. Never the mock in `executionAdapter.js`, and
   never raw execution on the app host (Phase 58).
2. **AI provider keys** — if CodeForge already has an AI-provider
   abstraction elsewhere in the codebase, wire `evaluationEngine.js`'s
   `aiReview` dependency to *that* instead of `aiProvider.js` (Phase 41 says
   reuse, don't duplicate).
3. **`is_authorized_tpo_viewer()` in `schema.sql`** — this guesses at a
   `profiles` table with `role`/`college_id` columns. Point it at your real
   auth helper if PrepVista already has a TPO-role check.

## Suggested next slice

Debugging simulation (Phase 17) is the next-highest-leverage piece — it
reuses everything built here (rubric, evaluation, evidence, revision) and
only needs a new project-type payload shape (a starter repo with a planted
defect) plus one new deterministic check (was the regression test actually
added). Say the word and that's next.
