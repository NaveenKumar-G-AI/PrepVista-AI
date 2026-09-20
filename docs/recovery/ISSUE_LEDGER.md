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
