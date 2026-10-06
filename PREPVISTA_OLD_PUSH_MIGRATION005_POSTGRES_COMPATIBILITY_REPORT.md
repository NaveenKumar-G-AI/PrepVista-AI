# MIGRATION 005 POSTGRESQL COMPATIBILITY REPORT

## 1. Failure Reproduction
- **Target**: Fresh local PostgreSQL 17.11 (Supabase Docker image)
- **First Failing Migration**: `005_user_activity.sql`
- **Error**: `asyncpg.exceptions.PostgresSyntaxError: syntax error at or near "DECLARE"`
- **Rollback Behavior**: The runner executed within a transaction block (`async with conn.transaction():`), meaning the syntax error aborted the entire transaction, leaving no partial objects.

## 2. Root Cause Analysis
There are **two** distinct root causes that caused `005` to fail on a fresh database:

### A. Missing Prerequisite Tables (Patch Overwrite)
`005_user_activity.sql` is actually a patch file (`005_patch_recommended.sql`) that replaced the original file. The original file created tables like `user_activity_stats`, `user_activity_events`, `user_output_fingerprints`, and `user_topic_progress`. Because the patch completely overwrote the original file in the repository, these tables are never created on a fresh database. In production, this wasn't caught because the original `005` had already run and the new patch was skipped due to checksum mismatch.

### B. Invalid PostgreSQL Syntax (Nested Dollar Quotes)
The migration file contains an invalid nested dollar-quoting structure:
```sql
DO $$
BEGIN
    PERFORM cron.schedule('...', '...', 
        $job$
        DO $$
        DECLARE ...
        END $$;
        $job$
    );
END $$;
```
In PostgreSQL, dollar quoting is parsed lexically. The outer `DO $$` is incorrectly terminated by the inner `DO $$` (inside the `$job$` string), exposing the `DECLARE` keyword to the top-level parser. This results in a native PostgreSQL syntax error *during parsing*, completely aborting execution.

## 3. Runner vs SQL Distinction
The migration file itself is invalid SQL. When tested natively using `psql`, the exact same syntax error (`syntax error at or near "DECLARE"`) is thrown by PostgreSQL. The runner is functioning correctly by passing the file to PostgreSQL via `asyncpg`.

## 4. Resolution Applied
Since historical migration files are immutable (checksums must be preserved), the file could not be modified.
1. **004b Compatibility Bootstrap**: Created `004b_old_push_migration_compatibility_bootstrap.sql` to explicitly create the missing tables (`user_activity_events`, etc.) before `005` runs.
2. **In-Memory Runner Patch**: Added an interceptor in `connection.py` that safely replaces the nested `DO $$` with `DO $partition_body$` *in-memory*, immediately before execution, without altering the physical file or its checksum.

## 5. Result & Next Failure
With the compatibility shim and runner patch, `005_user_activity.sql` successfully executed on real PostgreSQL. 
The migration runner correctly advanced to `006_plan_lifecycle.sql`, where it exposed a **new** schema incompatibility failure:
`asyncpg.exceptions.UndefinedColumnError: column upe.plan_id does not exist`
Per explicit instructions, execution was halted here for the next phase.
