# Testing

## How to run

```bash
cd codeforge-eval-engine
pip install -r requirements.txt
python3 -m pytest -v
```

Result as of this build: **56 passed, 0 failed** (Python suite), stable
across repeated runs, plus a separate real-DOM frontend verification
(see "Frontend verification" below) that is not part of `pytest` but is
just as real (see `CODEFORGE_FINAL_REPORT.md` for the full bug log — 8
real bugs were caught and fixed during development across three rounds
of work, not filed away).

## Coverage by layer

| File | Covers |
|---|---|
| `tests/test_execution_and_evaluation.py` | Real subprocess execution, syntax-error detection, timeout enforcement, runtime-error capture, deterministic pass/fail, compilation short-circuit, unsupported-language fail-closed behavior |
| `tests/test_analysis_and_mistakes.py` | AST-based static analysis, complexity basis labeling, deterministic mistake classification, direct reproduction of the Phase 43 frequency-counter bug caught by real execution |
| `tests/test_evidence_and_skill.py` | Evidence not generated on SYSTEM_ERROR, evidence strength rules, skill score is not a plain average, repeated-mistake detection requires 3+ *independent* attempts, prerequisite-weakness lookup |
| `tests/test_ai_layer.py` | Diagnosis/feedback fall back cleanly with no provider configured, stub-provider path produces hedged inferences, provider-outage handling |
| `tests/test_explanation_and_complexity_ai.py` | Explanation evaluation (not-provided / no-provider / provider-present paths), AI-assisted complexity refinement (not attempted for simple code, pending without a provider, never promoted to OBSERVED), and the regression test for the "confident wrong O(1) for pure recursion" bug |
| `tests/test_provider_factory_and_new_providers.py` | Provider-selection priority and explicit override, Groq/Gemini request construction and response parsing against their documented API shapes (mocked HTTP — see `CODEFORGE_AI_EVALUATION.md` for why these can't be live-tested here) |
| `tests/test_integration_e2e.py` | Full HTTP pipeline via FastAPI `TestClient`: buggy→fixed retry flow, background-analysis polling, idempotent double-submit, cross-student ownership (403), missing-auth rejection, malicious infinite-loop submission, student report endpoint, oversized-submission rejection (422), rate limiting (429), explanation-provided vs. not-provided evidence paths |
| `tests/test_reporting_and_dev_endpoints.py` | Dev-token issuance and role-signing (including a direct role-tampering attack attempt), challenge listing and its difficulty ordering, staff-only enforcement on all four cohort reports, and that those reports never leak `student_id` or raw `evidence_text` |

## Frontend verification (not pytest — a separate, equally real check)

`frontend/drive_frontend.mjs` loads the actual `frontend/index.html` into
a real jsdom DOM (`runScripts: "dangerously"`), wires in Node's real
`fetch`, and drives it like a user would — filling the connect form,
clicking buttons, waiting out the real polling loop — against an actual
running instance of the API. This is not a mock: it exercises the literal
file that would be opened in a browser, hitting the literal HTTP
endpoints the Python test suite also hits. It caught a real bug
(`GET /challenges` sorting `difficulty` alphabetically, so `"ADVANCED"`
loaded as the default challenge instead of `"EASY"`) that a JS syntax
check alone never would have. See `frontend/README.md` for how to re-run
it, and its own section in `CODEFORGE_FINAL_REPORT.md` for what this
verification method does and doesn't prove.

## What "integration" and "end-to-end" mean in this build

- `test_integration_e2e.py` goes through the real HTTP layer (FastAPI
  `TestClient`), real SQLite persistence, real subprocess execution of
  submitted Python code, and a **real FastAPI `BackgroundTasks`
  scheduling boundary** (not mocked) — it is not testing against mocks.
- Separate manual smoke tests were run against an actual `uvicorn`
  process bound to a real TCP port and hit with real HTTP requests (the
  `requests` library, not `TestClient`), including one that explicitly
  measured wall-clock time to prove the background analysis genuinely
  continues *after* the HTTP response has already been returned to the
  client — see `CODEFORGE_FINAL_REPORT.md` for the timing numbers.

## Static analysis / lint

```bash
python3 -m ruff check app tests --line-length 120
```
Result: **All checks passed.**

## Real bugs this test suite caught during development

Full writeups in `CODEFORGE_FINAL_REPORT.md` §10. Summary: a global
(rather than per-challenge) test-ID primary key that silently dropped
seed rows; a repeated-mistake test that didn't actually test the
"independent attempts" rule; a race between the CPU `rlimit` and the
wall-clock timeout that intermittently misclassified `TIMEOUT` as
`RUNTIME_ERROR`; a `FOREIGN KEY` crash for a legitimately-authenticated
but unseeded student, which cascaded into `database is locked` errors for
the rest of the process because of SQLite's default implicit-transaction
behavior; and a complexity heuristic that reported a confident-looking
`O(1)` for purely recursive code even while its own reasoning said that
number was unreliable.

## Not implemented

- No `mypy`/type-checking gate wired into CI.
- No load/performance testing.
- No test against a real Postgres/Supabase instance (SQLite only).
- Groq/Gemini providers are unit-tested against their documented API
  shapes with mocked HTTP, not against the live APIs (no network route,
  no credentials in this sandbox).
