# PREPVISTA OLD-PUSH - POSTGRESQL RUNTIME INTEGRATION REPORT

## 1. Summary
The Real PostgreSQL Integration (Phase 2) testing has been successfully completed. 
The objective was to qualify the application's runtime behavior against the local, fully migrated, real PostgreSQL 17.11 target `C:\PrepVista-OldPush-Local-Staging`, specifically evaluating the async transaction semantics and concurrent row locking against asyncpg.

All integration tests successfully pass against the real Postgres target.

## 2. Key Verifications

### A. Snapshot & State
The current Git HEAD snapshot (`24649a003336255b3d2830d9e3b9b8447bbf6cad`) and local state were cleanly snapshotted. Migrations `001` through `038` and the `auth.uid()` extension are confirmed active.

### B. Startup Disabling
Application startup environment variables appropriately leave database migrations disabled. Live migration paths are strictly blocked from execution outside explicit deployment scripts. The FastApi application starts pointing to the previously-migrated DB.

### C. Concurrency and Deadlocks
Using raw overlapping asyncpg transactions against the local network target:
*   **Transaction Rollback:** Simulated a forced application failure during an answer processing transaction (`interview_questions` candidate_answer UPDATE + `question_evaluations` INSERT). Rollback behavior confirmed 100% atomic in PostgreSQL.
*   **SELECT ... FOR UPDATE Concurrency:** Concurrent connections actively block while waiting for row-level locks on `interview_sessions`, guaranteeing safe sequential evaluation/scoring updates.
*   **Concurrent Finish Requests:** Multiple requests to `FINISH` the identical session concurrently resolved successfully, correctly processing exactly one request and gracefully rejecting the rest with idempotency checks.

### D. Concurrency Ordering
*   **Guided Assistance:** Verified the PostgreSQL provenance attribution logic (`viewed_at < q.created_at`). A late view (after answering) fails the attribution condition, ensuring integrity.
*   **Tenant Isolation:** Isolated queries properly returned data segregated by `organization_id`. `organization_students` accurately prevents cross-tenant data leaks.

### E. Semantic Types
*   **NULL vs 0 semantics:** Confirmed that `NULL` final_score handles uniquely from `0`. Unmeasured sessions are successfully typed and returned as `None` while explicit zero scores remain integers.
*   Constraints correctly reject invalid `difficulty_mode`, UUID mismatches, and `org_code` formatting anomalies natively at the Postgres boundary.

## 3. Least-Privilege Role Setup
A new `prepvista_runtime` role was formulated and verified:
```sql
CREATE ROLE prepvista_runtime WITH LOGIN PASSWORD 'runtime_pass';
GRANT CONNECT ON DATABASE postgres TO prepvista_runtime;
GRANT USAGE ON SCHEMA public TO prepvista_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prepvista_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prepvista_runtime;
```
When running integration tests using `prepvista_runtime`:
*   `SELECT 1;` succeeds.
*   `CREATE TABLE;` cleanly fails with `InsufficientPrivilegeError`.

## 4. Test Suite Execution
*   Unit & Regression Tests: 935 passed natively offline.
*   Real Postgres Integration Tests: 8 passed cleanly via network connection to dockerized PG 17.11.

## 5. Artifacts
*   `integration_tests/test_postgresql_runtime.py` - Synthetic integration tests testing actual asyncpg concurrency blocking.
*   `setup_runtime_role.py` - Script verifying DDL protection.
