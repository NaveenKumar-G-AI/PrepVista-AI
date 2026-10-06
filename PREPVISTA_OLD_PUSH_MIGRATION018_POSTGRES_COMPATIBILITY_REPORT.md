# MIGRATION 018 POSTGRESQL COMPATIBILITY REPORT

## 1. Exact PostgreSQL Failure
- **Error**: `asyncpg.exceptions.UndefinedColumnError: column "last_seen_at" does not exist`
- **SQLSTATE**: `42703`
- **Missing Column**: `last_seen_at`
- **Affected Relation**: `profiles`
- **Failing Index**: `idx_profiles_last_seen` (`CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen_at) WHERE last_seen_at IS NOT NULL;`)
- **Native PostgreSQL Reproduction**: **PASS**. Replicated the exact error locally via native PostgreSQL.

## 2. Root Cause Classification
**Classification**: `A. missing historical prerequisite column` (caused by an overwritten historical migration).
- Extensive repository search confirmed `last_seen_at` is heavily utilized in Python runtime code (e.g. `app/services/user_activity.py` and `app/services/public_growth.py`).
- It is an authentic column used for tracking live user presence. It was originally created by `005_user_activity.sql`.
- When the patch `005_patch_recommended.sql` completely overwrote the original file, it erased the column's creation from the ledger history.
- Consequently, migration 018 legitimately attempts to index a historically expected column that is now absent.

## 3. Compatibility Design
Because `018` is immutable and the column authentically belongs in the schema, I designed a fail-closed compatibility bootstrap: `017b_old_push_migration_compatibility_bootstrap.sql`.
- **Content**: `ALTER TABLE profiles ADD COLUMN last_seen_at TIMESTAMPTZ NULL;` (using `IF NOT EXISTS` for safety).
- **Semantics**: Matches the precise expectation of `user_activity.py` which defaults missing timestamps to `NULL` and filters via `last_seen_at IS NOT NULL`.
- **Preflight Tool**: Built `preflight_018.py` which verifies if the column is missing in `information_schema.columns` and correctly flags `MISSING_REQUIRED_COLUMN` if so.

## 4. Fresh Chain Execution Result
The local disposable database was reset. The full chain proceeded:
- `001` through `017`: **PASS**
- `017b` (bootstrap): **PASS**
- `018`: **PASS**
- `019` through `038`: **PASS** (Zero subsequent failures!)

## 5. Resulting Indexes
Following execution of `018`, all expected performance indexes were successfully created natively in PostgreSQL:
1. `idx_profiles_email_lower`
2. `idx_sessions_active`
3. `idx_sessions_finished_user`
4. `idx_sessions_finished_score`
5. `idx_profiles_last_seen` (successfully built over the restored column)
6. `idx_entitlements_active_plan`
7. `idx_plan_interviews_cycle`
8. `idx_reports_user`
9. `idx_support_messages_user_created`
10. `idx_skill_scores_session`

## 6. Next Failing Migration
- **Next Migration**: **NONE**. The chain completed perfectly up to and including `038_rubric_category_expansion.sql`.
- **SQLSTATE**: **NONE**.

## 7. Rubric Verification
The final schema correctly validates the rubric constraint logic established in 038.
- Historical categories (`problem_solving`): Accepted
- New expansion (`project_ownership`): Accepted
- Unknown/Typo categories: Rejected via PostgreSQL `CheckViolationError`.
- **FULL FRESH MIGRATION CHAIN QUALIFIED**: **YES**.
