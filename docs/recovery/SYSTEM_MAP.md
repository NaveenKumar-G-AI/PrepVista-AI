# Recovery system map
Baseline: 2026-09-19, commit b0426088; main is two commits ahead of origin/main. Untracked CodeForge-AI and aceapt are local reference trees, not the deployed runtime.

Runtime: frontend Next 16.3.3 / React 19.2.3 / TypeScript (npm lockfile); FastAPI 0.137.1 / Starlette 1.3.1 / Pydantic 2.9; asyncpg PostgreSQL with Supabase identity; Upstash REST rate limiting/cache. Local Node 24.14.0/npm 11.9.0, Python 3.11.9. Render Docker backend, Next frontend, isolated optional coding runner. PDF uses fpdf2 with a raw fallback. pytest/Playwright/node:test cover parts of the application.

| Domain | Implementation | Status / verification boundary |
|---|---|---|
| Identity/auth/quotas/billing | dependencies.py, routers/auth.py, billing.py, services/quota.py, plan_access.py | IMPLEMENTED; real Supabase/payment replay unverified |
| Resume/upload | routers/interviews_session.py, services/resume_parser.py | IMPLEMENTED; identity mapping under investigation |
| Interview/voice | interviewer_session.py, interview_v2_session.py, interview_orchestrator.py, stt_ws.py | PARTIAL: bounded orchestration exists; evaluation durability has gaps |
| Evaluations/report/PDF | interviews_answer.py, evaluator_scoring.py, reports.py, report_generator.py | BROKEN: missing evaluations become zero in report/aggregation/PDF |
| Coding/journey | routers/coding.py, journey.py, services/unified_* | IMPLEMENTED; local PostgreSQL and browser tests pass; live deployment unverified |
| Admin/cohort/notifications | routers/org_*, communications.py, services/report_schedules.py | IMPLEMENTED; route-level inventory below, not all workflows verified |
| Queues | in-process evidence worker, transient answer BackgroundTasks | PARTIAL: interview evaluation is not yet a durable queue |
| Source snapshots | CodeForge-AI/, aceapt/, tpodashboard/ | Reference/prototype trees; not automatically live features |

Passing tests are baseline evidence, not proof of full product recovery.


## 2026-09-20 recovery delta

The baseline statuses above are historical. The local branch now has a durable same-backend evaluation worker, honest shared report aggregation, explicit missing-evaluation recovery, identity/question guards and migrations 043-045. See FIX_LOG and TEST_MATRIX for evidence and remaining limits. User scope is local checks only. Do not infer a production rollout from local passes.
