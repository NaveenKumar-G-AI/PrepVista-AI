# Recovery issue ledger
| ID | Severity | Subsystem | Symptom / verified cause | Reproduction / affected files | Fix / regression | Status |
|---|---|---|---|---|---|---|
| PV-REPORT-001 | P0 | Report truth | Empty evaluations aggregate to 0; API/PDF independently coerce null to zero and generate readiness | compute_final_score([]); reports.py; report_generator.py | Shared report truth and zero/partial/full regressions | FIXED LOCALLY |
| PV-EVAL-001 | P1 | Evaluation durability | BackgroundTask can be lost; strict V2 errors produce no persisted failure row; late writes rejected after FINISHED | interviews_answer._evaluate_and_store; interviewer_session._ensure_pending_evaluations | Durable worker, lease/retry and PostgreSQL concurrency tests | FIXED LOCALLY |
| PV-EVAL-002 | P1 | Finish concurrency | Finish holds a session DB transaction across parallel provider calls despite docstring claiming otherwise; backfill lacks shared semaphore | finish_session / _ensure_pending_evaluations | Provider removed from finish transaction; queue-only compatibility path | FIXED LOCALLY |
| PV-REPORT-002 | P1 | Aggregation | Legacy partial evaluations multiply quality by coverage, conflating missing evaluation with poor performance | compute_final_score expected_questions | Separate evaluated quality and coverage; 7x8 remains 80 with 70% coverage | FIXED LOCALLY |
| PV-IDENTITY-001 | P1 | Identity | User reports wrong closing name; production record not available | Trace resume -> session -> closing -> report | Exact source match and spelling/initial preservation; pipeline/PDF regression | FIXED LOCALLY; production example not inspected |
| PV-QUESTION-001 | P1 | Questions | User reports duplicate intro and malformed question | Trace catalog/legacy safety gates | Reported phrase regressions and separate question wording gate | FIXED LOCALLY |
| PV-RELEASE-001 | P1 | Deployment | No live DSN/deployment credentials in session; Git credential helper cannot authenticate push | Prior push retry; environment presence only inspected | Local checks only per user; deployment excluded | OUT OF CURRENT SCOPE |

The reported 10/10 production session itself has not been inspected. Do not attribute its precise cause to a hypothesis. Add verified issues before fixing them.

| PV-SCHEMA-001 | P0 | Evaluation persistence | Old rubric CHECK constraints reject current evaluator and analytics categories, including delivery; PostgreSQL reproduction confirms both failures | Actual migrations 001/020/021 plus current evaluator | Migration 043 expands both allowlists; 10/7/0 durable PostgreSQL tests pass | FIXED LOCALLY |
| PV-SEC-001 | P0 | Browser database writes | profiles_self_update has no protected-column restriction; sessions_self_insert/update permit client-owned session mutation if Supabase grants table writes | Migration 001 policies; no later revocation found; local authenticated-role reproduction passed | Migration 045 blocks direct browser writes and retains authorized backend mutations | FIXED LOCALLY; authenticated-role reproduction passed |
| PV-HISTORY-001 | P1 | History | Stale persisted scores diverge from recomputed reports; genuine zero coerced to null and null rendered as zero | dashboard.py history and frontend history | Batch same evidence contract for authorized history/session cards | FIXED LOCALLY |

2026-09-20 scope correction: user explicitly requested local checks only. No deployment, remote migration or Git push is part of this recovery pass.

Known remaining verification: historical institution/profile snapshot reconciliation and the full platform-specific migration chain require separate qualification; new report/history reads are evidence-derived, but this pass does not certify every legacy institutional aggregate. See RELEASE_CHECKLIST. No remaining verified issue is hidden by a 100% completion claim.


## Second incident audit ? 2026-09-20

The reported 11-answer/zero-evaluation production interview was not accessed.
These are independently verified local defects, not a claimed diagnosis of its
exact production state. Closed evidence details can explain blank pasted sections;
blank pasted sections alone do not prove transcript loss.

| ID | Severity | Verified defect | Repair and evidence | State |
| --- | --- | --- | --- | --- |
| PV-EVAL-003 | P1 | Actual evaluation calls ignored GROQ_EVAL_MODEL, allowed only 2.9?4.1 seconds and 420?620 output tokens despite a long JSON contract | Dedicated model, bounded 35-second/1800-token background budget, queue-owned retries; actual SDK serialization/response tests | FIXED LOCALLY |
| PV-EVAL-004 | P1 | Prompt JSON duplicated specificity_score and ended with a trailing comma; truncation was not detected; provider failures lost their cause | Correct prompt shape, finish-reason validation and safe error codes; malformed/truncated/auth/rate/timeout tests | FIXED LOCALLY |
| PV-REPORT-003 | P1 | Pending jobs meant GENERATING forever; UI polling stopped silently and disabled recovery | Queue age/lease-aware diagnostics, owner retry for expired stalled jobs, visible refresh and saved transcripts independent of evaluations | FIXED LOCALLY; browser verification in progress |
| PV-AUTH-001 | P1 | Account fetch and token-refresh outages erased credentials; a second generic GET retry after failed refresh caused another 401/logout | Backend transient auth failures remain503; client preserves credentials, blocks unverified private views and offers retry; browser reproduced extra retry defect and regression added | FIXED LOCALLY; final browser rerun pending |
| PV-ROUTE-001 | P1 | Shared report URLs pointed to a missing frontend page | Public read-only page, no viewer authorization header or private transcripts; invalid/expired link handling | FIXED LOCALLY |
| PV-RESUME-001 | P1 | Failed resume parsing silently produced an empty profile and generic interview | Explicit parse status, source-backed claims, failed extraction stops before session creation, retained upload/retry | FIXED LOCALLY |
| PV-RESUME-002 | P2 | Main setup accepted PDF only although backend supported more formats; extraction blocked the event loop | Aligned upload choices, bounded OCR pages and extraction moved off the event loop | FIXED LOCALLY |
| PV-INSTITUTION-001 | P1 | Missing institutional scores were categorized as at-risk/zero | Explicit not-measured category; implementation and tests in progress | IN PROGRESS |
| PV-SNAPSHOT-001 | P1 | Historical profile/enrollment trigger only runs on FINISHED transition and skips null; late evaluations cannot refresh those cached snapshots | Direct session-derived views avoid this cache, but cache migration/reconciliation remains unqualified | OPEN |

Provider reference used for contract review: [Groq API reference](https://console.groq.com/docs/api-reference).
No production credentials, deployment changes or new push were used in this audit.
