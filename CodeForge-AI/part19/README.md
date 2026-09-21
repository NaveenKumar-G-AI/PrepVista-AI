# CodeForge Reasoning Verification Engine

Answers one question with evidence instead of vibes: **does the student's
explanation of their code actually match what the code does?**

This module was built with no access to the CodeForge repository itself —
there was no upload and nothing connected. So instead of the "inspect the
existing repo, reuse its infrastructure" flow the original spec calls for,
this is a **standalone, integration-ready engine** with explicit adapter
interfaces at every point that should really be your existing systems
(execution sandbox, complexity analyzer, AI provider, database). Wire those
in; don't run this as a second, competing system next to what you already
have.

Every claim in this README about what works is backed by a test you can
run yourself — see [Verifying this yourself](#verifying-this-yourself).

## Quickstart

```bash
npm install
npm test          # 52 tests, real AST parsing + real (mocked) HTTP shape checks
npm run typecheck # strict TS, zero `any` leaks in the public API
```

No API key, database, or sandbox is required for any of the above. The
default `AI_PROVIDER=mock` and the built-in complexity heuristic mean the
whole pipeline runs standalone.

## How it actually works

```
source code ──► astAnalyzer ──► patternDetector ──► complexityEstimator
                    │                  │                    │
                    └────────────┬─────┴────────────────────┘
                                 ▼
reasoning text ──► claimExtractor (rule-based, then AI-assisted)
                                 │
                                 ▼
                        verificationEngine ──► contradictionDetector
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              scorer      questionGenerator  reportBuilder ──► ReasoningReport
```

- **`src/analysis/astAnalyzer.ts`** parses JavaScript with `acorn` and
  extracts structural facts: loop nesting depth, data-structure usage
  (Map/Set/Array/Object + which operations run on them), recursion,
  memoization signals, branches, and guard clauses. Real parsing, real
  facts — nothing here is inferred from text.
- **`src/analysis/patternDetector.ts`** matches those facts against
  structural shapes for hashing, sliding-window, binary-search, BFS, DFS,
  sorting, recursion (plain and memoized), and nested iteration. It falls
  back to a less-specific-but-still-evidenced label rather than guessing —
  see `tests/patternDetector.test.ts` for what's covered and what isn't.
- **`src/analysis/complexityEstimator.ts`** is a **heuristic fallback**,
  not a real complexity analyzer. The spec is explicit that this engine
  should consume CodeForge's own trusted complexity result — do that via
  `ComplexityAnalyzerAdapter` (see below). This estimator exists purely so
  the module runs standalone.
- **`src/claims/claimExtractor.ts`** runs a deterministic, regex-based
  first pass (works with zero AI calls), then optionally refines it
  through your `AIProvider`. If the AI call fails, it degrades to the
  rule-based claims rather than failing the request.
- **`src/verification/*`** compares each claim against the deterministic
  evidence and returns `SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED |
  UNVERIFIED` with confidence, evidence, and a plain-English explanation —
  never a bare verdict. `contradictionDetector.ts` turns the bad ones into
  taxonomy-tagged records with severity.
- **`src/scoring/scorer.ts`** is one centralized, deterministic scoring
  config — no scoring numbers are hard-coded anywhere else.
- **`src/followup/questionGenerator.ts`** turns contradictions (and
  entirely-missing CORE claim types) into targeted questions — never "can
  you explain more?".
- **`src/pipeline.ts`** is the one function your backend actually calls:
  `runReasoningVerification(...)`, plus `reVerifyWithFollowUp(...)` for the
  "student answers the follow-up" loop.

## What's real vs. what's a seam for your systems

| Piece | Status |
|---|---|
| AST analysis, pattern detection, claim extraction, verification, contradiction detection, scoring, follow-up questions, report building | **Implemented and tested** — 52 passing tests, deterministic, no network required |
| Prompt-injection handling | **Implemented and tested** — student text is always a separate, clearly-delimited data block; an override attempt is flagged for observability but has zero effect on scoring (`tests/e2ePipeline.test.ts`, the injection-resistance case) |
| Groq / Gemini provider code | **Implemented, not live-tested** — no API key exists in this environment. Request/response shape is verified with a mocked `fetch` (`tests/aiProviders.test.ts`); confirm against a real key before shipping |
| Complexity analysis | **Heuristic fallback only.** Replace via `ComplexityAnalyzerAdapter` with CodeForge's real analyzer |
| Execution-backed edge-case verification | **Interface only, no default implementation.** Deliberately not stubbed with a naive `eval`-based runner — that would be exactly the "bypass sandbox security" the spec rules out. Wire `ExecutionAdapter` to your real sandbox |
| Database | **Schema only** (`db/schema.sql`), written in Supabase/Postgres conventions, never applied to a real database — there isn't one here |
| Report UI | One component (`ui/ReasoningReport.tsx`), self-contained React + Tailwind, no icon-library dependency. The full Claim Explorer drill-down, source-location editor jump, and multi-attempt history view from the spec are not built — this covers the single report screen |
| Multi-language support | **JavaScript only.** The adapter pattern (`analyzeSource(source, language)`) is ready to take a second language analyzer; none is implemented |
| Role/project context, cohort dashboards, interview integration | **Not implemented.** The report's `claims`/`verifications` are machine-readable and meant to feed those systems, not reimplement them |

## Wiring this into CodeForge

```ts
import { runReasoningVerification, GroqProvider } from "./src/index.js";
// import YourRealComplexityAnalyzerAdapter from "..."; // implement ComplexityAnalyzerAdapter

const report = await runReasoningVerification({
  submissionId: submission.id,
  sourceCode: submission.code,
  reasoningText: submission.reasoningText,
  problem: toProblemSpec(existingProblem), // map your problem row to ProblemSpec (src/types.ts)
  adapters: {
    ai: new GroqProvider(), // reads GROQ_API_KEY / GROQ_MODEL from env
    complexity: new YourRealComplexityAnalyzerAdapter(),
    // execution: new YourSandboxAdapter(),   // optional — enables direct edge-case verification
    // codeQuality: new YourQualityAdapter(), // optional
  },
});

if (!report.ok) {
  // report.reason is one of the FAILURE_REASONS in src/types.ts — a
  // real, typed state, not a thrown exception to catch-all around.
}
```

Persist `report.value` against `db/schema.sql` (adapted to your actual
table/column conventions and admin RLS policies — see the TODO at the
bottom of that file).

## Environment variables

See `.env.example` — every value is left blank. `AI_PROVIDER` defaults to
`mock` so nothing here requires a key to run.

## Verifying this yourself

Don't take the table above on faith:

```bash
npm test -- --reporter=verbose   # see all 52 test names and what each asserts
npm run typecheck                # strict mode, no `any` in the public surface
```

The flagship scenario from the original spec — student claims `O(n)`,
implementation is actually `O(n^2)` — is `tests/e2ePipeline.test.ts`,
`"end-to-end: flagship mismatch"`. The prompt-injection resistance case is
right below it in the same file.

## Known limitations (read before you demo this)

- Pattern detection is shape-based over common idioms. Unusual code style
  will under-detect (falls back to `UNVERIFIED`/`linear-scan`, never a
  fabricated guess) rather than mis-detect confidently.
- `CORRECTNESS`, `OPTIMIZATION`, `TRADEOFF`, and `BEHAVIOR` claim types
  don't have a deterministic verifier yet — they resolve `UNVERIFIED` with
  an honest explanation. `PROBLEM_UNDERSTANDING` and `INVARIANT` have
  partial coverage. Extend `src/verification/verifiers.ts`.
- The rule-based claim extractor works at sentence granularity. A single
  sentence that states two different Big-O values (a sub-claim, then a
  conclusion) resolves to the *last* one mentioned — reasonable for how
  people actually write conclusions, but worth knowing about.
- Data-structure detection covers Map/Set/Array/Object plus push+pop
  (stack) and push+shift (queue) shapes. Trees, graphs, and linked lists
  have no structural detector yet — claims about them resolve
  `UNVERIFIED`, not a false negative.
