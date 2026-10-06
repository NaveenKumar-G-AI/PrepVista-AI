# MIGRATION 007 POSTGRESQL COMPATIBILITY REPORT

## 1. Exact PostgreSQL Failure
- **Error**: `asyncpg.exceptions.UndefinedTableError: relation "old_user" does not exist`
- **SQLSTATE**: `42P01`
- **Failing Statement**:
```sql
ALTER TABLE old_user ENABLE ROW LEVEL SECURITY;
```

## 2. Actual Schema vs Expected
- **Actual Schema after 006**: The relation `old_user` was completely absent.
- **Expected Prerequisite**: Migration 007 heavily relies on `old_user`, applying RLS, defining triggers for GDPR erasure on `profiles`, and populating an `email_hash` backfill. The application backend (`app/routers/account.py`) also inserts `user_id`, `full_name`, and `email` directly into this table with an `ON CONFLICT (email)` guard.
- **Missing Contract**:
```sql
CREATE TABLE IF NOT EXISTS old_user (
    id SERIAL PRIMARY KEY,
    original_user_id UUID,
    user_id UUID,
    full_name TEXT,
    email TEXT UNIQUE,
    email_hash TEXT,
    deletion_reason TEXT,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);
```

## 3. Root Cause Classification
**Classification**: `I. production/manual prerequisite was never codified` or `A. overwritten historical migration`. 

The original migration `007_account_archive.sql` was completely overwritten by a patch file `007_patch_recommended.sql`. That patch contained instructions addressing a prior schema which had `old_user`. Furthermore, developer comments inside `app/routers/account.py` explicitly provided manual migration instructions (`ALTER TABLE old_user ADD COLUMN user_id uuid;`) to deployers, further confirming that this table existed in legacy production environments before 007 patch but was never codified into the fresh chain.

## 4. Compatibility Design
Created `006b_old_push_migration_compatibility_bootstrap.sql` explicitly sorted before `007`. It recreates the exact `old_user` table structure derived from the `007` patch requirements and `account.py` inserts. It uses `IF NOT EXISTS` for strict idempotency and zero conflict with deployed historical data. No production data or actual rows are mutated.

## 5. Preflight Tool
Created `preflight_007.py`. The tool performs zero writes. It connects via `asyncpg` and verifies the exact schema definition for `old_user` in `information_schema.columns`. It outputs `COMPATIBLE` if correctly typed, `MISSING_PREREQUISITE` if the table is absent (triggering bootstrap), or `INCOMPATIBLE_PREREQUISITE` if types drift.

## 6. Full Chain Execution Result
The migration chain advanced safely past `007_account_archive.sql` onto `008_public_growth.sql` where it intentionally stopped on a new syntax error (`syntax error at or near "DECLARE"`). The migration ledger securely recorded `006b` and `007`.

## 7. Safety Invariants Maintained
- `007_account_archive.sql` physical checksum is strictly unmodified.
- `005` in-memory transform physical checksum gate remains fully enforced.
- No historical user data was rewritten.
- Zero rows deleted.
- Frontend remained untouched.
