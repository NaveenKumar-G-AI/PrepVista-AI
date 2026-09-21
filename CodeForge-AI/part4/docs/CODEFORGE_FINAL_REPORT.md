# CodeForge Evaluation Engine — Final Report

This is a living document across three rounds of work in this
environment: the initial build, a follow-up pass that closed most of the
gaps the initial truth table flagged, and a third pass that added the two
phases (management reporting, frontend) that had no code at all. All
three rounds are reported honestly below.

## 1. What was discovered in the existing architecture

Nothing — there is no existing CodeForge repository in this environment.
`/mnt/user-data/uploads` was empty, no `.git` directory exists anywhere on
disk. This sandbox's network egress is restricted to package registries
(PyPI, npm, GitHub, crates.io) plus `api.anthropic.com` — there is no
route to Groq's, Google's, or Supabase's APIs even with credentials.

Given that, Phase 0/1 ("inspect the existing repository, integrate with
the existing challenge system") could not be performed as literally
specified. This report treats that honestly rather than fabricating a
discovery process or pretending an integration happened.

## 2. What was implemented

**Round 1** built the core pipeline: immutable attempts, real sandboxed
Python execution, deterministic evaluation with failure classification,
AST-based static analysis, static complexity estimation, rule-based
mistake taxonomy, an Anthropic-backed AI provider abstraction (inactive
without a key, correctly falling back), an evidence engine, a weighted
skill model, a feedback engine, retry comparison, and a next-challenge
handoff point.

**Round 2**, per the instruction to keep all provider keys empty (the
person will add them separately) and continue until genuinely done,
added: real Groq and Gemini provider implementations (code-complete,
verified against each API's published request/response shape, but not
live-called — see §7); a provider-selection factory; two more of the
eight AI responsibilities from Phase 10 (explanation evaluation,
AI-assisted complexity reasoning); genuine Phase 35 background processing
using FastAPI `BackgroundTasks` (not synchronous-in-request anymore);
per-student rate limiting; `feedback_level` exposed on the public API;
and a `students` FK auto-provisioning fix plus a SQLite concurrency
hardening fix that a newly-multi-threaded request/background-task split
exposed.

**Round 3**, per the instruction to keep going without stopping until the
codebase is genuinely complete, closed the two phases that had *no* code
at all: Phase 29 (management/aggregate reporting for TPO/college use —
role-based auth, four cohort-level report endpoints, tested against
role-forgery attempts) and Phase 38 (frontend — a real, JS-syntax-checked,
and **actually DOM-executed** reference UI verified against a live
running server via jsdom, not just inspected by eye).

## 3. Files created

**Round 1:** DB layer, all core services (execution, evaluation, static
analysis, complexity, mistakes, diagnosis, evidence, skill, feedback,
next-challenge), Anthropic provider, seed data, initial test suite, all
11 requested docs — see `CODEFORGE_EVALUATION_ARCHITECTURE.md` for the
full module map.

**Round 2:**
```
migrations/002_background_and_explanation.sql
app/rate_limit.py
app/services/explanation_service.py
app/services/ai/groq_provider.py
app/services/ai/gemini_provider.py
app/services/ai/provider_factory.py
tests/test_explanation_and_complexity_ai.py
tests/test_provider_factory_and_new_providers.py
```

**Round 3:**
```
app/services/reporting_service.py
tests/test_reporting_and_dev_endpoints.py
frontend/index.html
frontend/README.md
frontend/drive_frontend.mjs
frontend/package.json
```

## 4. Files modified

**Round 2:** `app/main.py` (rewritten for background processing),
`app/db.py` (WAL + autocommit hardening), `app/models/schemas.py`
(`feedback_level`, `ExplanationEvaluation`, `ComplexityAIRefinement`),
`app/services/complexity_service.py` (`refine_with_ai` + the
pure-recursion honesty fix), `app/services/evidence_service.py`
(`build_explanation_evidence`), `app/services/ai/prompts.py` (two new
prompts), `tests/test_integration_e2e.py` (rewritten for the
poll-for-completion contract).

**Round 3:** `app/auth.py` (role-aware, signed tokens), `app/main.py`
(`/dev/token`, `GET /challenges`, four `/reports/cohort/*` routes),
`app/models/schemas.py` (`DevTokenRequest`).

All `docs/*.md` updated across all three rounds to stay accurate to the
current code, not left describing an earlier state.

## 5. Database migrations created
`migrations/001_init.sql` (Round 1, 18 tables) +
`migrations/002_background_and_explanation.sql` (Round 2: `analysis_status`
column, `complexity_analysis.ai_status`/`ai_reasoning` columns,
`explanation_evaluations` table). Both apply idempotently via
`app/db.py::run_migrations`, verified to apply cleanly in sequence. No
Round 3 migration was needed — the reporting endpoints only read
existing tables.

## 6. APIs created/changed

Round 1 endpoints: `GET /health`, `GET /challenges/{id}`,
`POST /attempts`, `GET /attempts/{id}`, `GET /students/{id}/skills`,
`GET /students/{id}/report/{attempt_id}`.

Round 2 changed `POST /attempts`'s contract: it now returns fast with
deterministic results only, and diagnosis/evidence/skill/feedback are
polled for via `GET /attempts/{id}` and its `analysis_status` field.
`feedback_level` added to the request body.

Round 3 added: `POST /dev/token`, `GET /challenges` (list), and four
staff-only `GET /reports/cohort/*` endpoints. Full detail in
`CODEFORGE_API.md`.

## 7. AI providers integrated

| Provider | Status |
|---|---|
| Anthropic | Real, was already live-verifiable (network route present), no key configured here → correctly inactive |
| Groq | Real, code-complete, request/response shape verified against Groq's published API reference via web search before writing. **Not live-called**: `api.groq.com` is outside this sandbox's egress allowlist and no `GROQ_API_KEY` is set. Verified instead via unit tests with a mocked HTTP layer matching that documented shape. |
| Gemini | Same situation as Groq: real, code-complete, shape verified against Google's published reference, not live-called (`generativelanguage.googleapis.com` not on the allowlist, no key). Mocked-HTTP unit tests. |

Selection is centralized in `provider_factory.get_configured_provider()`
(priority: explicit `AI_PROVIDER` override → Anthropic → Groq → Gemini →
none), fully unit-tested independent of any live network access.

**Being precise about what "verified" means here:** the claim is that the
request construction and response parsing match the providers'
documentation, checked against a live web search of their current API
references, and that our code's behavior against a *simulated* version of
that shape is test-covered. It is not a claim that a live call to Groq or
Gemini has actually succeeded from this codebase — that remains genuinely
unverified pending real credentials and network access.

## 8. Security controls implemented

Round 1: ownership enforcement, hidden-test redaction, parameterized SQL,
resource-limited execution, idempotency.

Round 2: per-student rate limiting (10/60s, `429` beyond that, tested
with 12 real sequential submissions), and the `students`
auto-provisioning + SQLite autocommit/WAL hardening that closed a real
crash-and-cascading-lock bug (see §10, bugs 4-5).

Round 3: role-based access control for management endpoints, with the
role claim inside the HMAC-signed payload specifically so it can't be
forged by tampering with an unsigned part of the token (tested directly
— see bug/test description in §10); cohort-only aggregation on every
reporting query so no code path can return a single identified student's
private data.

## 9. Tests executed
`python3 -m pytest -v` (56 tests, up from 28 in Round 1), `ruff check app
tests --line-length 120`, manual smoke tests against a real running
`uvicorn` process using the `requests` library (including one that
measured wall-clock timing to prove the background analysis genuinely
continues after the HTTP response was already sent — see §11), and, new
in Round 3, `frontend/drive_frontend.mjs` — a real jsdom-driven execution
of the actual frontend HTML/JS against a live server (not a mock, not a
syntax check alone).

## 10. Test results and the real bugs caught

**56 passed, 0 failed** (Python suite), stable across repeated runs. All
frontend-driver scenarios (default ordering, connect-error handling, full
retry + next-challenge flow) passed on the run reported below.

Eight real bugs were found and fixed during this build, across all three
rounds — every one of them was caught by actually running something
(tests, a live server, or the frontend driver), not by inspection alone:

1. **(Round 1)** `challenge_tests.test_id` was a global rather than
   per-challenge primary key — seed rows silently dropped via
   `INSERT OR IGNORE` collisions. Fixed with a composite primary key.
2. **(Round 1)** A repeated-mistake test inserted three mistake rows
   under one `attempt_id`, never actually exercising the "3+
   *independent* attempts" rule the service correctly enforces. Fixed
   the test.
3. **(Round 1)** A race between `RLIMIT_CPU` and the wall-clock
   `subprocess.run` timeout intermittently misclassified a killed
   infinite loop as `RUNTIME_ERROR` instead of `TIMEOUT`. Fixed by
   treating a SIGXCPU/SIGKILL child exit as `TIMEOUT` regardless of
   which limit fired.
4. **(Round 2)** `FOREIGN KEY` crash for an unseeded student. This
   sandbox's dev-token auth can mint a token for any string; a real
   deployment's student row already exists by the time someone can
   submit code. A rate-limit test using a fresh, never-seeded
   `student_id` crashed on the very first `INSERT INTO attempts`. Fixed
   by lazily provisioning a minimal `students` row at the top of
   `submit_attempt`.
5. **(Round 2)** That unhandled exception cascaded into `database is
   locked` for every subsequent test in the module. Root cause: splitting
   the pipeline into a synchronous request handler and a `BackgroundTasks`
   task means the request thread and the background-task thread hold two
   independent `sqlite3.Connection` objects open at once — a genuinely
   new condition Round 1's fully-synchronous design never exercised.
   Python's sqlite3 default implicit-transaction behavior meant bug #4's
   failed `INSERT` opened a transaction that was never rolled back,
   poisoning that thread's cached connection for the rest of the process.
   Diagnosed with an instrumented timing repro, fixed with
   `isolation_level=None` (true autocommit) plus WAL mode and a 30s busy
   timeout. Re-verified stable across 3 consecutive full-suite runs and a
   standalone 12-request rapid-fire repro.
6. **(Round 2)** A confident-looking wrong complexity estimate. A live
   smoke test against a real recursive binary-search submission returned
   `time_complexity: "O(1)"` — the loop-nesting heuristic's answer for
   "zero loops found" — even though the function does real recursive work
   and the heuristic's own reasoning text already said this number likely
   understates the truth. Fixed in `estimate_python_complexity`: when
   recursion is present and the loop-nesting heuristic has zero signal,
   `time_complexity` is now `None` with an explicit explanation, instead
   of a specific number the system already suspected was wrong.
   Regression-tested.
7. **(Round 3)** A genuinely useless test assertion. `ruff` flagged
   `assert "starter_code" not in c or True` in a new test — the `or True`
   made the assertion vacuous, always passing regardless of the actual
   response. A real catch of a real (if minor) correctness gap in the
   test suite itself, not the application. Fixed to assert something
   meaningful (`starter_code` and `public_tests` are absent from the list
   view, present only in the per-challenge detail view).
8. **(Round 3)** `GET /challenges` ordering. `ORDER BY difficulty` sorts
   alphabetically, which puts `"ADVANCED"` before `"EASY"` (A < E) — not
   caught by any Python test (nothing asserted on order), but caught
   immediately by the frontend driver, whose very first console line
   showed "Binary Search" (the hardest seed challenge) loading as the
   default instead of "Sum Two Numbers." This is exactly the kind of bug
   a real end-to-end UI check finds that a backend-only test suite
   doesn't, because the backend response was technically valid JSON in
   *some* order — only a consumer that cares about order surfaces it.
   Fixed with an explicit difficulty-rank `CASE` expression; regression
   test added (`test_list_challenges_orders_easiest_first_not_alphabetically`)
   and the fix re-verified live through the frontend driver a second time.

## 11. Live verification

Against a real `uvicorn` process on a real TCP port:

**Round 2** (via the `requests` library): a recursive binary-search
submission's `POST /attempts` returned in **0.117s**; polling
`GET /attempts/{id}` showed `analysis_status` transition from `PENDING`
to `COMPLETE` roughly **0.114s later** — concrete evidence the background
task genuinely ran after the response was already sent. That submission's
`complexity_analysis` correctly returned `time_complexity: null` (bug #6
above, pre-fix at the time), `explanation_evaluation` correctly showed
`provided: true, ai_status: "AI_EVALUATION_PENDING"`, and
`feedback.level` correctly stored `"DETAILED"` as requested. A separate
run confirmed the full buggy→fixed retry flow (`retry_comparison.improved:
true`) and rate limiting (11 rapid requests → 8×`200` then 3×`429`,
correctly cumulative across the whole student session, not reset per
request).

**Round 3** (via `frontend/drive_frontend.mjs`, a real jsdom DOM with
`runScripts: "dangerously"` and Node's real `fetch`, against the same
live server): confirmed the default-loaded challenge is now the easiest
one (bug #8, post-fix), confirmed a bad API base URL produces a visible
error and never reveals the workspace, and confirmed the full
buggy-submit → fixed-retry → `retry_comparison` render → `next_challenge_suggestion`
button → click-through-to-next-challenge flow all execute correctly
end-to-end against real HTTP responses, not fixtures.

(Note: several attempts to run live-server smoke tests in this session
hit transient tool/process-lifecycle issues unrelated to the application
itself — backgrounded shell processes intermittently not surviving
between tool calls in this specific chat environment. Every result
reported above is from a run that completed successfully; failed attempts
were retried rather than papered over.)

## 12. Known limitations

Closed across Rounds 2-3: synchronous-only processing, no rate limiting,
Groq/Gemini not implemented, complexity reasoning and explanation
evaluation AI responsibilities not implemented, no management/reporting
API, no frontend at all.

Still open, and not closeable from within this sandbox:
- No real host repository/challenge system to integrate with (§1).
- Execution sandbox is process-level isolation (subprocess + rlimits),
  not container/VM-level isolation — this specifically requires
  infrastructure (Docker/gVisor/Firecracker/a real execution fleet) that
  cannot be stood up inside this chat environment's container.
- Groq/Gemini calls are unverified against the live APIs — this sandbox
  has no network route to either, and no credentials were provided (nor
  should they be pasted into a chat — set them as real environment
  variables in your own deployment).
- No Supabase RLS (no Supabase instance exists here to test against).
- Background processing is in-process `BackgroundTasks`, not a
  distributed queue — documented, deliberate scope boundary for a
  single-instance reference implementation.
- Next-challenge selection remains an explicitly-labeled placeholder, not
  a real recommendation engine — per Phase 27's own instruction not to
  duplicate one, this is a deliberate design choice, not a gap to close.
- The frontend was verified by real DOM execution (jsdom) against a live
  server, not by a human clicking through it in an actual browser — no
  visual/rendering QA was possible in this environment. See
  `frontend/README.md`.
- Conceptual-understanding analysis (Phase 10, responsibility #5) is
  folded into explanation evaluation's output rather than being a fully
  separate AI call; code-analysis interpretation and evidence extraction
  (#1 and #8) remain deliberately deterministic rather than AI calls, for
  the explainability reasons in `CODEFORGE_AI_EVALUATION.md`.

## 13. Truth table

| Capability | Status |
|---|---|
| Real execution integration | **PARTIALLY IMPLEMENTED** — real subprocess execution with timeouts/rlimits; not container/VM-isolated (genuine infra limitation of this environment) |
| Deterministic evaluation | **IMPLEMENTED** |
| Hidden tests | **IMPLEMENTED** |
| Code analysis | **IMPLEMENTED** — AST-based, deterministic by design |
| Complexity analysis | **IMPLEMENTED** — static heuristic (honest about its own limits, including the pure-recursion fix in §10) + AI-assisted refinement path, real but unverified live without credentials |
| Failure diagnosis | **IMPLEMENTED** — rule-based always; AI-assisted when a provider is configured |
| Mistake taxonomy | **IMPLEMENTED** |
| Repeated mistake detection | **IMPLEMENTED** |
| AI analysis | **IMPLEMENTED** — 6 of 8 Phase 10 responsibilities wired to a live-call code path (2 deliberately deterministic instead, by design); real integration code for 3 providers, inactive without credentials in this sandbox |
| Evidence engine | **IMPLEMENTED** — including explanation-sourced evidence |
| Confidence model | **IMPLEMENTED** |
| Skill profile update | **IMPLEMENTED** |
| Feedback | **IMPLEMENTED** — configurable level exposed on the API |
| Retry comparison | **IMPLEMENTED** |
| Background processing | **IMPLEMENTED** — genuine FastAPI `BackgroundTasks` decoupling, live-timed; not a distributed queue (documented, deliberate scope boundary) |
| Rate limiting | **IMPLEMENTED** — in-process only (documented scaling gap for multi-instance deployments) |
| Next-challenge integration | **DEMO ONLY** — deliberately a placeholder per Phase 27's own instruction; correct handoff payload |
| Management/aggregate reporting | **IMPLEMENTED** — 4 staff-only cohort endpoints, role-forgery-tested |
| Frontend | **IMPLEMENTED** — real reference UI, verified by actual DOM execution against a live server; no human visual QA possible here |
| Security | **PARTIALLY IMPLEMENTED** — ownership/redaction/idempotency/rate-limiting/role-based-access real and tested; container-level sandbox isolation remains a genuine infra gap |
| Authorization | **IMPLEMENTED** (against the stand-in auth system, now role-aware; real Supabase JWT verification is a swap-in) |
| Persistence | **IMPLEMENTED** (SQLite, hardened for real multi-threaded access; schema maps to Postgres) |
| Observability | **PARTIALLY IMPLEMENTED** — structured `audit_events` at pipeline milestones including background-task failures; no metrics/tracing |
| Testing | **IMPLEMENTED** — 56 Python tests + a real DOM-execution frontend check, unit + integration + live-server smoke tests with timing proof, all passing and stable |

## 14. Exact commands to run and verify

```bash
cd codeforge-eval-engine
pip install -r requirements.txt

# Run the test suite
python3 -m pytest -v

# Lint
python3 -m ruff check app tests --line-length 120

# Run the real server
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another shell:
```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/challenges

curl -X POST http://127.0.0.1:8000/dev/token \
  -H "Content-Type: application/json" \
  -d '{"subject_id": "stu_demo_1", "role": "student"}'

curl -X POST http://127.0.0.1:8000/attempts \
  -H "Authorization: Bearer <token from above>" \
  -H "Content-Type: application/json" \
  -d '{"challenge_id":"most-frequent-element","challenge_version":1,"language":"python",
       "source_code":"import sys, json\nd=json.loads(sys.stdin.read())\ncounts={}\nfor i in d[\"items\"]:\n    counts[i]=counts.get(i,0)+1\nprint(json.dumps(min(counts,key=lambda k:(-counts[k],k))))\n",
       "hint_count":0,"hint_level":0,"client_request_id":"manual-check-1","feedback_level":"STANDARD"}'

# Response returns fast with analysis_status="PENDING" — poll:
curl http://127.0.0.1:8000/attempts/<attempt_id from above> \
  -H "Authorization: Bearer <token>"
```

Open the reference frontend: open `frontend/index.html` directly in a
browser (or serve it — see `frontend/README.md`), point it at
`http://127.0.0.1:8000`.

To activate live AI (diagnosis, feedback, explanation evaluation,
complexity refinement), set exactly one of these as a real environment
variable before starting the server — never paste a real key into a chat
message:
```bash
export ANTHROPIC_API_KEY=sk-...   # or
export GROQ_API_KEY=gsk-...       # or
export GEMINI_API_KEY=AIza...
```
