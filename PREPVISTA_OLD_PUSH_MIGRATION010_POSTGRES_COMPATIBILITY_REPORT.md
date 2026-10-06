# MIGRATION 010 POSTGRESQL COMPATIBILITY REPORT

## 1. Exact PostgreSQL Failure
- **Error**: `asyncpg.exceptions.UndefinedFunctionError: function fn_set_updated_at() does not exist`
- **SQLSTATE**: `42883`
- **Missing Function**: `fn_set_updated_at`
- **Requested Signature**: Parameterless trigger function (called via `EXECUTE FUNCTION fn_set_updated_at()`)
- **Native PostgreSQL Reproduction**: **PASS**. Replicated the exact error locally via native PostgreSQL.

## 2. Root Cause Classification
**Classification**: `C. overwritten historical migration` (or missing historical function).
- Migration 010 contains explicit commentary: `-- Reuses fn_set_updated_at() from 005_user_activity.sql.`
- A historical patch `005_patch_recommended.sql` completely replaced the original `005_user_activity.sql` file. That patch erased the creation of the `fn_set_updated_at()` trigger function from the schema migration history. However, `010_cascade_fixes.sql` is still looking for it.

## 3. Compatibility Design
Because `010` cannot be modified, and `fn_set_updated_at()` is an authentically expected historical prerequisite, I created `009b_old_push_migration_compatibility_bootstrap.sql`.
- **Content**: Creates the exact `fn_set_updated_at()` trigger function using `CREATE OR REPLACE FUNCTION` to ensure idempotency.
- **Ordering**: Safely executes before `010_cascade_fixes.sql`.
- **Preflight Tool**: Built `preflight_010.py` which introspects the `pg_proc` catalog to verify the function's presence and its return type (`trigger`), returning `MISSING_PREREQUISITE` gracefully when absent.

## 4. Fresh Chain Execution Result
The local disposable database was reset. The full chain proceeded:
- `001` through `009`: **PASS**
- `009b` (bootstrap): **PASS**
- `010`: **PASS**
- `011` through `017`: **PASS**
- `018`: **FAIL** (`018_performance_indexes.sql`)

## 5. Actual FK/Cascade Schema Effects (Verified)
Directly queried PostgreSQL `information_schema.referential_constraints` after `010` executed:
- `usage_events_user_id_fkey`: Re-wired to **ON DELETE SET NULL**. (Safely preserves usage data for analytics without blocking profile deletions, severing PII).
- `billing_events_user_id_fkey`: Re-wired to **ON DELETE RESTRICT**. (Explicitly blocks profile deletion if active billing events exist, forcing the new GDPR trigger to handle them first).
- **Unexpected Cascades**: **NO**. The constraints match the exact intended secure configuration.

## 6. Next Failing Migration
- **Next Migration**: `018_performance_indexes.sql`
- **SQLSTATE**: `42703` (UndefinedColumnError)
- **Error**: `column "last_seen_at" does not exist`
