# PrepVista — Audit & Hardening Log

> Single source of truth for the audit/hardening pass. Updated continuously.
> Branch: `audit/hardening` (from `main` @ 33cb452). Date started: 2026-06-16.

---

## Resume Point

**Current phase:** Phase 3 in progress. **Module `interview_summary` / `evaluator` / `resume_parser`
/ `interviewer_coverage` test-failure cluster: COMPLETE & GREEN.**
**Backend test baseline: was 14 failed / 185 passed → now 198 passed, 0 failed** (bare `pytest`).
**Next action:** Continue Phase 3 on remaining modules. Highest-signal untouched items:
1. Frontend `react-hooks/rules-of-hooks` ×4 (conditional hooks — can crash render):
   `plan-selector.tsx:76`, `org-admin/analytics/[[...slug]]/page.tsx:288/295/302`.
2. Frontend `react-hooks/set-state-in-effect` ×4 (render-loop risk).
3. Security pass: auth/JWT (`dependencies.py`), IDOR in `org_*` + `admin_*` routers,
   Razorpay webhook signature verification, rate limiter, SSRF in any outbound fetch.
4. `main.py:437` `__main__` port parse bug (L-1).
**8 commits on `audit/hardening` so far** (see Fix Log).

---

## Stack & Tooling

| Area | Detail |
|------|--------|
| Backend | Python (FastAPI 0.115, Pydantic v2, uvicorn/gunicorn) |
| Backend runtime | Docker `python:3.12-slim`; local dev machine has **Python 3.13.14** (version drift — see findings) |
| DB | PostgreSQL via **asyncpg** (Supabase). Raw SQL, no ORM. |
| Auth | Supabase JWT (HS256, `PyJWT`), `SUPABASE_JWT_SECRET` |
| LLM | Groq (primary) + OpenAI (fallback) |
| Billing | Razorpay |
| Email | Resend + Gmail API |
| Cache/RateLimit | Upstash Redis (REST), `cachetools` |
| Monitoring | Sentry, structlog |
| Frontend | Next.js 16.1.6, React 19.2, TypeScript 5, SWR, Supabase JS, Recharts, Tailwind 4 |
| Deploy | Render (Docker web service + 2 Node cron heartbeats); frontend likely Vercel (`vercel.json`) |

### Exact commands (verified working on this machine)

Backend tests need env vars to import `app.config`. Minimal working invocation:
```bash
ENVIRONMENT=development DEBUG=true \
SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=test SUPABASE_SERVICE_KEY=test \
SUPABASE_JWT_SECRET=0123456789012345678901234567890123 \
DATABASE_URL=postgresql://localhost/test FRONTEND_URL=http://localhost:3000 \
BACKEND_URL=http://localhost:8000 GROQ_API_KEY=test \
python -m pytest tests/ test_queue.py -q --no-header -p no:cacheprovider
```
- Compile check: `python -m py_compile $(find app -name "*.py")` → **PASS (all 85 files)**
- App import: imports OK, **113 routes** registered.
- Frontend type-check: `cd frontend && npx tsc --noEmit` → **PASS (clean)**
- Frontend lint: `cd frontend && npx eslint .` → **92 problems (68 errors, 24 warnings)**

> NOTE: bare `pytest` fails collection because it tries to read `test_results.txt`
> (UTF-16/binary). Always scope to `tests/ test_queue.py`. (Candidate cleanup finding.)

---

## Architecture Map

### Entry / lifecycle
- `app/main.py` — app factory, lifespan, CORS, TrustedHost, request-size middleware,
  security headers, error handlers, router registration, health endpoints
  (`/`, `/health`, `/health/awake`, `/health/ready`). Background tasks: DB pool bootstrap
  (retry loop) + user-activity refresh loop (backoff).
- `app/config.py` — Pydantic Settings, `PLAN_CONFIG`, department taxonomy/aliases, CORS/host
  parsers. **Note:** `get_cors_origins()` / `get_allowed_hosts()` hardcode production domains.
- `app/dependencies.py` — DI: auth (JWT decode), current-user, plan gating (to review).
- `app/database/connection.py` — asyncpg pool(s), `DatabaseConnection` ctx manager, init/close.

### Middleware (`app/middleware/`)
- `error_handler.py`, `rate_limiter.py` (Upstash), `security_headers.py`.

### Routers (`app/routers/`) — 113 routes, prefixes from main.py
- Auth: `auth.py` | Interviews: `interviews*.py` (answer/helpers/schemas/session) |
  Reports: `reports.py` | Dashboard: `dashboard.py` | Billing: `billing.py` |
  Account: `account.py` | Support: `support.py` + `admin_support.py` |
  Admin: `admin.py`, `admin_grants.py` | Referrals/Feedback/Events |
  Org B2B: `org_admin*.py` (analytics/billing/orgs/users), `org_college*.py`
  (analytics/config/students).

### Services (`app/services/`) — business logic
- LLM: `llm.py`, `groq_client.py`, `prompts*.py`
- Interview engine: `interviewer*.py` (session/coverage/question_engine/templates/helpers),
  `interview_summary.py`, `transcript.py`, `session_prefetch.py`
- Evaluation: `evaluator*.py` (feedback/grounding/scoring)
- Analytics: `analytics*.py` (cohort/student/helpers), `funnel_tracking.py`, `user_activity.py`
- Billing/Plans: `razorpay_service.py`, `quota.py`, `plan_access.py`, `launch_offer.py`,
  `referrals.py`
- Reports: `report_builder.py`, `report_generator.py`, `report_render.py`, `report_helpers.py`
- Auth/Email: `auth_identity.py`, `email_service.py`, `email_validation.py`,
  `manual_signup_verification.py`
- Misc: `resume_parser.py`, `technical_taxonomy.py`, `history_retention.py`,
  `public_growth.py`, `plan_access.py`

### Frontend (`frontend/src/`)
- `app/` — Next.js App Router pages (dashboard, interview, report, admin, org-admin, auth…)
- `components/` — UI incl. `SupportChatWidget`, `plan-selector`, side rails, `awake-keeper`
- `lib/` — `api.ts` (API client), `auth-context.tsx`, `supabase.ts`, `plan-usage.ts`

### Data flow (request lifecycle)
Client → CORS → TrustedHost → request-size guard → security headers → rate limiter →
router → `dependencies` (JWT verify via Supabase secret → load user/plan) →
service layer → asyncpg → Postgres. LLM calls go out to Groq/OpenAI; billing to Razorpay.

---

## Baseline Results (verbatim signal)

### Backend tests: `14 failed, 185 passed`
Two failure classes:
1. **Async-plugin infra (2):** `test_queue.py::test`, `tests/test_email_validation.py::...returns_normalized_email`
   → "async def functions are not natively supported" (pytest-asyncio not active). Likely
   infra, not product bug — confirm in Phase 3.
2. **Real assertion failures in `tests/test_interview_logic.py` (12):** opening-question
   diversity, final-score computation, HR-readiness levels (5), communication assessment (3),
   resume-field inference, career better-answer preservation. → Must determine if these are
   genuine logic regressions or drifted test expectations (possibly Python 3.13 vs 3.12 or
   randomness/seed). **HIGH priority to triage.**

(The committed `pytest_output.log` is stale — from `C:\RecruitBrain_Project`, asyncpg missing.
Not a valid baseline.)

### Frontend `tsc --noEmit`: clean (0 errors)

### Frontend `eslint .`: 92 problems (68 errors, 24 warnings), by rule:
| count | rule | risk |
|------|------|------|
| 40 | `@typescript-eslint/no-explicit-any` | type holes |
| 21 | `@typescript-eslint/no-unused-vars` | dead code |
| 16 | `react/no-unescaped-entities` | cosmetic |
| **4** | **`react-hooks/set-state-in-effect`** | **render-loop risk (Cat. A)** |
| **4** | **`react-hooks/rules-of-hooks`** | **conditional hooks → crash/inconsistent order (Cat. D)** |
| 2 | `react-hooks/preserve-manual-memoization` | correctness |
| 2 | `next/no-img-element` | perf |
| 1 | `react-hooks/purity` | correctness |
| 1 | `react-hooks/exhaustive-deps` | stale closure |

Known hot spots: `plan-selector.tsx:76` conditional `useEffect`; `org-admin/.../page.tsx`
conditional `useCallback`/`useMemo` (288/295/302) + `setActiveTab` in effect (1213).

---

## Findings (by severity)

> Format: `[ID] SEVERITY — file:line — what / why / proposed fix`. Populated during Phase 3.

### Critical
- _none confirmed yet_

### High
- [H-3] ✅ FIXED — `interview_summary._assess_communication_style` scale mismatch.
  `communication_score` is stored 0–10 (`part*5`; frontend & report_render divide by 5),
  but this function compared the raw value to 0–2 thresholds (1.5/1.0/0.7) → **every real
  interview averaged ~5–10, always ≥1.5 → every candidate misclassified as
  "clear_and_structured"** regardless of actual communication quality. Fixed by normalizing
  ÷5 before thresholds (commit 4a5e401).
- [H-4] ✅ FIXED — `_compute_hr_readiness_level` dropped `timeout_count` param → `TypeError`
  for any caller passing it (5 tests). Restored as optional (commit 071efe1).
- [H-2] (OPEN) `react-hooks/rules-of-hooks` ×4 — conditional hook calls
  (`plan-selector.tsx:76`, `org-admin/analytics/.../page.tsx:288/295/302`). Can crash render.

### Medium
- [M-3] ✅ FIXED — `resume_parser.infer_resume_field_profile` missing modern AI/ML framework
  keywords (PyTorch, Groq, TensorFlow, etc.) → AI/RAG resumes misclassified as generic
  software (commit 1fb2067).
- [M-4] ✅ FIXED — `_build_opening_question` returned the *identical* opener every session in
  basic/medium/difficult modes (difficulty adapter collapses intro to one fixed string),
  breaking its documented "avoid repeating opener across interviews" contract
  (commit ab83381).
- [M-5] ✅ FIXED — `evaluator_grounding` grounded better-answer discarded the student's named
  method ("context filtering" → generic paraphrase) (commit 16d0bdc).
- [M-1] (OPEN) `react-hooks/set-state-in-effect` ×4 — potential render loops.
- [M-2] (OPEN) Runtime version drift: Docker py3.12 vs dev py3.13.

### Low
- [L-1] (OPEN) `main.py:437` `__main__` port parse: `BACKEND_URL.split(":")[-1]` breaks
  for scheme-only URLs (dev-only path; gunicorn used in prod).
- [L-2] ✅ FIXED — bare `pytest` crashed collecting `test_results.txt`; `test_queue.py` (DB
  script) collected as a test. Added `pytest.ini` (`testpaths=tests`) (commit edbd06b).

---

## Fix Log

> One entry per atomic commit: finding ID, what changed, evidence (test/lint output).

| Commit | Finding | Change | Evidence |
|--------|---------|--------|----------|
| f8074b7 | — | AUDIT.md tracking doc | — |
| 071efe1 | H-4 | Restore optional `timeout_count` to `_compute_hr_readiness_level` | TestHRReadinessLevel 5 passed |
| 4a5e401 | H-3 | Normalize comm_score ÷5 in `_assess_communication_style`; `quality_rows` optional; `COMMUNICATION_SCORE_SCALE_MAX` 3→10 | suite 14→5 failed, 185→194 passed |
| 1fb2067 | M-3 | Add modern AI/ML keywords to resume field inference | TestResumeFieldInference 2 passed |
| ab83381 | M-4 | Opener-variants pool to diversify opening question across sessions | TestOpeningQuestionDiversity 2 passed |
| 16d0bdc | M-5 | Preserve student's named method in grounded better-answer | TestBetterAnswerGeneration 3 passed |
| edbd06b | L-2 | `pytest.ini` (testpaths=tests); fix email fixture domain | bare `pytest` 198 passed, 0 failed |

**Net: backend test suite 14 failed/185 passed → 0 failed/198 passed. No regressions introduced
(each fix verified against the full suite).**

---

## Open Questions / Assumptions

- ASSUMPTION: Frontend deploys to Vercel (`vercel.json` present); backend + crons to Render.
- ASSUMPTION: Hardcoded prod domains in `config.py` (`get_cors_origins`/`get_allowed_hosts`)
  are intentional per recent commits "Hardcode production CORS origins / trusted hosts".
- Q: Is pytest-asyncio expected in the test env, or are those 2 async tests meant to be skipped?
- Q: Are the 12 `test_interview_logic` failures expected on `main`, or a regression?
