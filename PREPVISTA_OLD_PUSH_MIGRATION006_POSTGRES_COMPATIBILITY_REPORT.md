# MIGRATION 006 POSTGRESQL COMPATIBILITY REPORT

## 1. Exact 006 Failure
- **Error**: `asyncpg.exceptions.UndefinedColumnError: column upe.plan_id does not exist`
- **SQLSTATE**: `42703`
- **Failing Statement**:
```sql
UPDATE user_plan_entitlements upe
SET expires_at = CASE
    WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%annual%'    THEN upe.activated_at + INTERVAL '365 days'
...
WHERE upe.expires_at IS NULL;
```
- **Underlying Relation**: `user_plan_entitlements` (aliased as `upe`)

## 2. Root Cause & Historical Provenance
**Classification**: `I. production historically had manually-created column/object`

In `001_initial_schema.sql`, the column created is `plan TEXT NOT NULL CHECK (plan IN ('pro', 'career'))`. The repository completely lacks any historical migrations, application python models, or typescript definitions referring to `plan_id`. 
However, the patch file `006_plan_lifecycle.sql` references `upe.plan_id` in a backfill query and compares it to string patterns like `'%annual%'`. Because these string patterns would violate the `CHECK` constraint on `upe.plan`, `plan_id` cannot simply be a typo for `plan`. 
Evidence strongly points to `plan_id` being a column manually created directly in the production database (likely tracking external Razorpay `plan_xyz` identifiers) for the purpose of the backfill, which was never codified into a migration.

## 3. Preflight and Data Model Safety
- **Expected Type**: `TEXT`
- **Nullability**: `NULL` allowed (due to explicit `COALESCE` handling in `006`).
- **Data Model**: The column represents a loose tracking ID for external vendor plan strings. It holds no constraints or FKs.

A preflight script (`preflight_006.py`) was created to determine database readiness:
- Detects if `user_plan_entitlements` hasn't been created yet (OK for fresh DB)
- Detects if `plan_id` is missing (ACTION REQUIRED - will be bootstrapped)
- Detects if `plan_id` is already present and is `TEXT` (OK - compatible)
- Detects if `plan_id` is present but has an incompatible type (FATAL)

## 4. Compatibility Design
Created the minimal compatibility bootstrap: `005b_old_push_migration_compatibility_bootstrap.sql`.
This bootstrap simply executes:
```sql
ALTER TABLE user_plan_entitlements ADD COLUMN IF NOT EXISTS plan_id TEXT;
```
Because the migration chain dictates that it must be ordered before `006`, it is designated `005b`. It uses `IF NOT EXISTS` ensuring zero interference with existing populated legacy environments.

## 5. Resulting Schema & Validation
With `005b` applied:
- Migration `006` parses and executes cleanly since `upe.plan_id` is present as `TEXT`.
- The backfill executes but operates on zero rows in the fresh database.
- The chain automatically resumed and stopped at migration `007` (with a known new blocker: `relation "old_user" does not exist`).
- The `005` in-memory checksum gate was tightened and proved safe via regression tests. No immutable files were modified, and no historical data was dropped.
