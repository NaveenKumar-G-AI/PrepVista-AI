# CodeForge Evaluation Architecture

## Why this is a standalone build, not an integration

Phase 0 of the brief asks for full repository discovery and integration with
an existing CodeForge codebase. This sandbox contains **no such repository**
— `/mnt/user-data/uploads` is empty, there is no `.git` anywhere on disk, and
no Supabase/Groq/Gemini credentials are configured. Pretending otherwise
would mean fabricating an "integration," which the brief itself forbids.

Instead, this is a **real, runnable, tested reference implementation** of
the evaluation engine's core pipeline, built as a standalone FastAPI service
with clearly marked seams for where it plugs into a real CodeForge backend
(challenge system, auth, AI provider credentials, execution sandbox).

## Pipeline (as actually implemented)

```
POST /attempts  (synchronous — Phase 35 "immediate" half)
  → immutable attempt row (attempts)
  → real subprocess execution per test case (execution_service)
  → deterministic pass/fail + failure categorization (evaluation_service)
  ← HTTP response sent here, analysis_status="PENDING"
     (on a real ASGI server, everything below runs AFTER this response
     is already on the wire to the client — see "Background processing")

BackgroundTasks  (Phase 35 "background" half)
  → AST-based static analysis (static_analysis_service)
  → static-heuristic complexity estimate + AI-assisted refinement when
    the heuristic flags its own uncertainty (complexity_service)
  → rule-based mistake classification (mistake_service)
  → AI-assisted diagnosis, with deterministic fallback (diagnosis_service)
  → repeated-mistake → potential misconception detection (evidence_service)
  → explanation evaluation, only if the student answered "why this
    approach?" (explanation_service)
  → evidence rows persisted (evidence_service)
  → skill profile recomputed from weighted evidence (skill_service)
  → feedback generated, AI or evidence-grounded fallback (feedback_service)
  → analysis_status="COMPLETE" (or "FAILED", never a silent hang)

GET /attempts/{id}  (poll until analysis_status != "PENDING")
  → retry comparison vs previous attempt, prerequisite weaknesses, and
    next-challenge handoff/suggestion computed fresh from persisted
    tables at read time (main.py::_assemble_attempt_response); hidden
    test values redacted
```

Every step above is real code that runs in this repo's test suite
(`pytest`, 50 passing tests, including full HTTP round-trips and a
background-task boundary that is not mocked). Only `StubProvider` (used
exclusively in tests) simulates an AI response.

## Background processing (Phase 35)

`POST /attempts` schedules `_run_background_analysis` via FastAPI's
`BackgroundTasks`. Against a real ASGI server (uvicorn), the HTTP
response is flushed to the client's socket *before* that task runs — a
live timing smoke test measured the response returning in ~0.12s while
the full analysis continued for a further ~0.11s afterward, invisible to
the already-completed request (numbers in `CODEFORGE_FINAL_REPORT.md`).
`attempts.analysis_status` (`PENDING → COMPLETE`/`FAILED`) is how a
client tracks completion.

**Documented gap vs. a distributed deployment:** this is in-process
`BackgroundTasks`, not a real message queue (Celery/RQ/SQS) — genuine
"don't block the request on AI calls" for a single instance, but a task
is lost if that process crashes mid-task, and it doesn't distribute work
across multiple app instances. `_run_background_analysis` was written to
take only IDs and plain data (never live request/DB objects) specifically
so swapping it for a real queue doesn't require restructuring it.

## Module map

| Concern | File |
|---|---|
| DB connection + migrations | `app/db.py`, `migrations/*.sql` |
| Auth / ownership / roles (stand-in) | `app/auth.py` |
| Rate limiting | `app/rate_limit.py` |
| Real sandboxed execution | `app/services/execution_service.py` |
| Deterministic evaluation | `app/services/evaluation_service.py` |
| Static analysis (AST) | `app/services/static_analysis_service.py` |
| Complexity estimation + AI refinement | `app/services/complexity_service.py` |
| Rule-based mistakes | `app/services/mistake_service.py` |
| AI-assisted diagnosis | `app/services/diagnosis_service.py` |
| Explanation evaluation | `app/services/explanation_service.py` |
| Evidence engine | `app/services/evidence_service.py` |
| Skill profile model | `app/services/skill_service.py` |
| Feedback generation | `app/services/feedback_service.py` |
| Next-challenge integration point | `app/services/next_challenge_service.py` |
| Cohort/management reporting | `app/services/reporting_service.py` |
| AI provider abstraction + factory | `app/services/ai/*.py` |
| API routes / orchestration | `app/main.py` |
| Reference frontend | `frontend/index.html`, `frontend/README.md` |

## Frontend (Phase 38)

`frontend/index.html` — a real, working reference UI (no build step,
vanilla JS, `fetch()` against the actual API). Since there is no existing
CodeForge coding workspace here, this is what "integrate with the
existing workspace" becomes: a genuine implementation of the RESULT →
TEST RESULTS → TECHNICAL ANALYSIS → FEEDBACK → RETRY/CONTINUE flow
(Phase 38's own spec), not a mockup. Design rationale and how it was
verified without a visual browser (jsdom driving the real page against a
live server, not a syntax check alone — which caught a real ordering bug,
see `CODEFORGE_FINAL_REPORT.md`) are in `frontend/README.md`.

## Management/aggregate reporting (Phase 29)

`app/services/reporting_service.py` + four `staff`-role-gated endpoints.
Cohort-level only by design — see `CODEFORGE_SECURITY.md` for the privacy
posture and how role-forgery is prevented.

## What a real integration replaces

1. `app/db.py` — swap SQLite for the host Postgres/Supabase connection.
2. `students` / `challenges` / `challenge_tests` tables — delete; point
   queries at the real challenge system instead (Phase 1).
3. `app/auth.py` — swap for real Supabase JWT verification.
4. `execution_service.py`'s sandbox — swap the `subprocess` isolation for
   the real, separately-provisioned execution engine (Phase 4 gap, see
   `CODEFORGE_SECURITY.md`).
5. `next_challenge_service.select_next_challenge` — replace with a call
   into the real challenge-selection engine, using `build_handoff_payload`
   unchanged.
