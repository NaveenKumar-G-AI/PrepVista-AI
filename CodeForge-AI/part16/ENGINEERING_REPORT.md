# Final Engineering Report — Code Correctness Analysis Engine

## Architecture discovered

None. This environment contains no CodeForge repository, no uploaded
files beyond the spec itself, and no external repo URL — confirmed by
directly inspecting `/mnt/user-data/uploads` and the working filesystem
before writing any code. The spec's instructions to "inspect the existing
codebase," reuse existing auth/submissions/execution/Code Coach/Hint
Ladder implementations, and "search before creating" therefore could not
be literally followed — there was nothing to search.

Rather than inventing a fictional CodeForge codebase and presenting it as
discovered, this was built as a **self-contained package with explicit
interfaces at every integration point** (`CorrectnessRepository`,
`AIProvider`, `SubmissionOwnershipLookup`, and the `executionEvidence` /
`submissionSource` / `requirements` adapters), sized to drop into an
existing monorepo (e.g. `packages/correctness-engine`) and wire up to real
auth, real submission storage, and a real execution engine in an
afternoon, without duplicating any of them.

## Implementation

62 files, ~4,500 lines of TypeScript + 248 lines of SQL. Full tree in
`README.md`. Highlights: `src/deterministic/*` (classification, failure
clustering, requirement coverage, regression), `src/staticAnalysis/*`
(real per-language analyzers), `src/ai/*` (providers, prompt building,
response validation, orchestration), `src/persistence/*` (repository +
migrations), `src/security/*`, `src/api/*`, `src/integrations/*`,
`frontend/CorrectnessReport.tsx`.

## Database

Three tables (`src/persistence/migrations/0001`–`0003`): `correctness_assessments`
(structured columns for indexing/filtering + a `raw` jsonb blob for
full-fidelity retrieval), `correctness_findings`, `requirement_checks`.
Primary keys, foreign keys with `ON DELETE CASCADE`, a `UNIQUE(submission_id,
submission_version)` constraint (the idempotency backstop), and indexes for
the user/history/submission access patterns. RLS policies in `0004`.

These four files are written to run unmodified against a real Supabase
project. They were **not** just written and trusted — see Security below.

## Backend

- `classify()` — pure deterministic function, zero AI, the single source
  of truth for `status`.
- `clusterFailures()` — groups failing tests by shared metadata tags into
  hypothesis-worded (never fact-worded) clusters.
- `computeRequirementCoverage()` — joins structured requirements against
  test evidence by tag intersection.
- `computeDelta()` — regression/improvement detection between two
  evidence snapshots, compared at the individual test-id level.
- Static analysis (`src/staticAnalysis/`) uses **real tooling**, not a
  hand-rolled approximation: real CPython `ast.parse` (via subprocess),
  real `acorn` AST parsing for JS, real `gcc`/`g++ -fsyntax-only`
  diagnostics for C/C++, real `javac` diagnostics for Java. A JDK was
  installed specifically so Java wouldn't fall back to a weaker
  regex-based heuristic.

## AI

`GroqProvider` and `GeminiProvider` implement one shared `AIProvider`
interface. Both request/response shapes were confirmed against current
provider documentation via web search rather than written from memory —
Groq's OpenAI-compatible `chat/completions` with `response_format:
json_schema`, Gemini's `generateContent` with `responseSchema` (a
converter adapts one shared JSON Schema into Gemini's uppercase-typed
subset, so the contract is authored once).

Structured output is strict-validated with Zod (`src/domain/schema.ts`).
Evidence grounding goes further than schema validation: any AI finding
citing an evidence id that was never offered to the model is **dropped**,
not surfaced with a caveat; findings that mix real and fabricated ids have
their confidence forcibly downgraded rather than trusting the model's own
confidence claim.

## Correctness Engine

- **States**: `UNKNOWN`, `LIKELY_CORRECT`, `PARTIALLY_VALIDATED`,
  `LIKELY_INCORRECT`, `DEFINITIVELY_INCORRECT`, `ACCEPTED` — matching the
  spec's suggested names, since there was no existing repository
  convention to defer to instead.
- **Evidence hierarchy enforcement**: `assembleCorrectnessAssessment()` in
  `src/index.ts` sets `status`/`confidence` *only* from the deterministic
  verdict. The AI layer's opinion (`ai.result.statusAssessment`) has no
  code path into that field — not "usually respected," structurally
  absent. Proven adversarially in
  `test/ai/promptInjection.test.ts`: a provider that is fully compromised
  and returns `ACCEPTED` for genuinely failing code does not change
  `assessment.status`.
- **Failure classification / confidence / regression**: see Backend above.
- **Root cause**: AI-only capability (algorithm vs. implementation vs.
  specification-misunderstanding), always evidence-linked, never
  authoritative over status.

## Frontend

`frontend/CorrectnessReport.tsx` — structurally separates the "Verified"
block (deterministic only) from the "Analysis" block (AI only) in the
component tree itself, not just by label, so an AI-derived value can't
render inside the verified section by a future editing mistake. Design
tokens are centralized in one object for easy re-theming into a real
design system, per the spec's "do not create a disconnected page"
instruction. A live-rendered preview using the same evidence data as the
golden fixture was shown above.

## Security

- **Authorization**: `assertOwnsSubmission()` derives ownership
  server-side via an injected lookup and refuses on mismatch *or*
  nonexistence, with the same error either way (no existence leak). A
  second, independent check in `requestAnalysis()` compares the loaded
  evidence's own `userId` as defense in depth. 6 tests in
  `test/security/authorization.test.ts`.
- **RLS**: not just written — **empirically proven** against a real,
  locally-installed Postgres 16 instance running the actual migration
  files. `db-verification/run_rls_verification.sh` seeds two students,
  then reconnects as a distinct non-superuser login role and demonstrates
  live: Alice sees only her row, Bob sees only his, a session with no JWT
  claims sees zero rows (fails closed), Alice's `INSERT`/`UPDATE` attempts
  are rejected outright, and a direct-by-id lookup of Bob's row returns
  empty rather than a permission error (confirming row-level filtering,
  not just statement-level denial). Full transcript available by running
  the script.
- **Prompt injection**: student source code is delimited and the system
  prompt instructs the model to treat it as inert data — but the
  adversarial test assumes that defense *fails* and the model is fully
  manipulated anyway, then proves the authoritative status is still
  unaffected. Defense-in-depth, not defense-only.
- **Hidden test protection**: structural, not procedural — the
  `TestResult` type has no field for raw hidden input/output in the first
  place. `test/ai/hiddenTestProtection.test.ts` additionally proves that
  even a value attached to an object via a property outside the type
  (simulating a future bug) never reaches the built prompt, because
  `buildPrompt()` only ever reads the known-safe fields.
- **Rate limiting**: pluggable `RateLimiter` interface with a working
  in-memory token-bucket implementation; designed to be swapped for a
  host app's existing infra rather than this engine inventing a second
  one.

## Testing

**80/80 tests passing, 15 files, run just now — not from memory:**
13 deterministic classification, 5 requirement coverage, 4 regression/delta,
20 static analysis (against real gcc/g++/javac/CPython/acorn), 12
orchestrator (cost-control skipping, timeout/HTTP/rate-limit degradation,
malformed-response retry), 9 response-validator/evidence-grounding, 2
adversarial prompt-injection, 3 hidden-test-protection, 6 authorization, 3
idempotency, 2 concurrency, 1 golden end-to-end (the exact 6/10 → 9/10 →
10/10 fixture from the spec). Plus the independent, live RLS verification
above. The test suite caught and this report is not hiding one real
defect during development — an early version of the delta/regression
wiring accidentally compared a submission's test results against
themselves instead of against the true previous version; the golden e2e
test failed, the bug was fixed in `src/api/handlers.ts`, and the suite was
re-run clean.

## Environment

See `README.md` for the full table. No secret values are present
anywhere in this codebase — `GROQ_API_KEY`, `GEMINI_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are all read from
`process.env` and left for you to set.

## Execution

```bash
npm install
npm test                                    # 80 tests
npm run typecheck
bash db-verification/run_rls_verification.sh # live RLS proof (needs local postgres)
```

## Known limitations

**IMPLEMENTED** (real, tested, verified in this session):
deterministic classification for every scenario the spec lists (correct,
wrong answer, compile error, runtime error, timeout, memory failure,
boundary/duplicate/negative-value bugs, partial correctness, regression,
improvement); failure clustering; requirement coverage; static analysis
via real compilers/parsers for C, C++, Java, JavaScript, Python; AI
provider integrations coded against current, web-verified API contracts;
strict schema validation + evidence grounding; the evidence-hierarchy
guarantee (adversarially tested); prompt-injection defense
(adversarially tested); structural hidden-test protection; DB schema +
RLS (empirically proven against live Postgres); authorization;
idempotency; concurrency isolation; rate limiting; observability hooks;
Code Coach / Hint Ladder integration adapters; the golden e2e fixture;
the frontend report component.

**PARTIALLY IMPLEMENTED**:
Static analysis is real but intentionally modest in rule count (a handful
of well-known, defensible checks per language, not an exhaustive linter)
— extending it is additive work, not a redesign. Requirement *extraction*
from free-form problem-statement text is not automated (the coverage
*computation* given structured requirements is fully implemented and
tested; producing those structured requirements from prose today needs a
one-time authoring step or an LLM-assisted extraction pass this repo
doesn't include).

**BLOCKED** (specifically because of the sandbox, not a design gap):
live end-to-end calls to the real Groq/Gemini APIs — this sandbox's
network egress allowlist doesn't include their domains and no API keys
were provided (correctly, since none should be pasted into a chat). The
provider code is real and is exercised by tests against a fully in-memory
fake provider (the standard, correct way to test this boundary without
paying for or depending on a live API in CI). The persistence layer's
`SupabaseCorrectnessRepository` is real, type-checked code but was not
run against a live Supabase project (no project/credentials exist here);
the RLS *policies* it depends on were instead verified against a real,
locally-installed Postgres — the closest verification achievable without
an actual Supabase project.

**NOT IMPLEMENTED**:
Anything that only makes sense wired to a real host app: the actual
Express/Next.js server process, real submission/execution-engine adapters
(only their interfaces + test fakes exist), and restyling the frontend
component to an actual existing design system (it currently uses a
reasonable placeholder token set, documented as the one place to edit).
