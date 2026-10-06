# MIGRATION 008 POSTGRESQL COMPATIBILITY REPORT

## 1. Exact PostgreSQL Failure
- **Error**: `asyncpg.exceptions.PostgresSyntaxError: syntax error at or near "DECLARE"`
- **SQLSTATE**: `42601`
- **Failing Block**:
```sql
        DO $$
        DECLARE
            v_total_users          INT;
```
- **Context**: Occurs in the `pg_cron` schedule execution nested inside a `DO $$ BEGIN` block.
- **Native PostgreSQL Reproduction**: **PASS**. Replicated the exact error locally via native PostgreSQL without the Python migration runner.

## 2. Root Cause Classification
**Classification**: `A. nested dollar-quote collision`

The parser correctly begins an outer block using the `DO $$` delimiter. Inside that block, `PERFORM cron.schedule(..., $job$ ...` starts an inner string. Inside the inner string is another `DO $$ DECLARE ... END $$;`. The inner `$$` is erroneously parsed as the termination of the *outer* `DO $$` block string, leaving `DECLARE` exposed as an invalid top-level SQL command. This is exactly the same lexical defect present in Migration 005.

## 3. Compatibility Design
Because `008_public_growth.sql` is an immutable historical file (its physical checksum `702e9c03cd2375e183e676782d6cb6306cbb7b48566b1cd22b7cfb0255fdeb2b` must remain perfectly unchanged), I applied the identical in-memory transform methodology used for `005`.

The migration runner in `app/database/connection.py` transforms:
`DO $$\n        DECLARE` to `DO $public_growth_job$\n        DECLARE`
and
`END $$;\n        $job$` to `END $public_growth_job$;\n        $job$`

**Strict Checksum Gating**:
- The transform applies **only** when `version == "008_public_growth"`.
- It dynamically computes the SHA-256 hash of the on-disk file. If it is anything other than `702e...b2b`, the migration fails-closed instantly.
- The ledger safely records the *original physical checksum*, proving the schema contract is upheld.

## 4. Transform Isolation Proof (Tests)
Added tests in `tests/test_migration_008_compat.py`:
- `test_migration_008_in_memory_patching`: Proves the string substitution happens correctly in memory while the final checksum function returns the untouched original hash.
- `test_migration_008_checksum_gate_fails_on_tamper`: Proves the runner safely rejects `008` if its physical contents are maliciously altered or inadvertently formatted.

## 5. Full Chain Execution Result
The local disposable database was reset and recreated. The authentic chain proceeded:
- `001` to `007`: **PASS**
- `008`: **PASS**
- `009`: **PASS**
- `010`: **FAIL** (`010_cascade_fixes.sql`)

## 6. Objects Created by 008
- **Tables**: `public_growth_metrics`
- **Views**: `v_public_growth_display`, `mv_public_growth_fast`
- **Cron Jobs**: `refresh-public-growth-metrics` (Schedule: `*/5 * * * *`). This is a read/aggregate-only snapshot job used for marketing metrics, and is entirely safe to run locally.

## 7. Next Failing Migration
- **Next Migration**: `010_cascade_fixes.sql`
- **SQLSTATE**: `42883`
- **Error**: `asyncpg.exceptions.UndefinedFunctionError: function fn_set_updated_at() does not exist`
