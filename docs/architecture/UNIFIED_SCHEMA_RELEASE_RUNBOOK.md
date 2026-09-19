# Separate schema application from application startup

Implemented locally on 2026-09-14; scope extended for artifact-review consent on
2026-09-19. No staging or production target was changed.
This procedure applies only the current integration migrations 038–042 after
baseline 001–037 has been established and independently reviewed. It is not a
fresh-database installer, schema repair service or deployment authorization.

## Startup behavior

`DATABASE_MIGRATIONS_ON_STARTUP=false` makes ordinary FastAPI pool initialization
skip migration SQL, migration-ledger creation and checksum baselining. Coding
workers continue to pass `run_migrations=False` explicitly. The code default is
**true for existing-installation compatibility**; adding this setting to a sample
file does not change any deployed environment. The committed `.env.example` and
rollout flag example select false. Configure the actual environment before startup.

The release preflight rejects an enabled coding workspace plan that omits this
setting or selects true. Its flag file describes intended configuration; it does
not verify or mutate the real service environment. Turning off startup migrations
does not install missing tables or prove schema compatibility. Apply and validate
the reviewed schema before enabling dependent features or serving new code.

Pool initialization now keeps a candidate pool private until initialization and
any requested migrations finish. Requests cannot acquire that pool halfway through
schema changes. Failure or cancellation closes it; failed/timed-out cleanup
terminates the remaining connections. Normal profile/request behavior is unchanged
once the pool is ready. Already running pools do not reread this flag dynamically.

The legacy automatic runner retains its historical checksum-warning/baselining
behavior when explicitly used. It now takes a shared session-level migration lock
across its separate steps. That mode requires a direct or session-pinned connection;
do not use it with a transaction/statement pooler. All updated migration runners
share the same PostgreSQL advisory key. Older code and manual SQL do not participate
in that protocol and must be coordinated separately during release.

## Review the exact schema plan

First inspect the target ledger with the existing read-only preflight. Reconcile
actual table definitions, grants, migration history and the restored baseline with
the database owner. A matching checksum is not proof of the live schema: older
startup code could have recorded a baseline without verifying it. In particular,
an already-applied earlier 038 must be preserved and repaired with a newly numbered
additive migration. Never replace its ledger checksum to make this tool pass.

Provision `UNIFIED_MIGRATION_DATABASE_URL` through the authorized maintenance
environment's secret mechanism, using a direct administrative PostgreSQL connection
or a connection configuration qualified for this migration workload. The command
never reads `DATABASE_URL`, loads `.env`, initializes the app pool, provisions a
role or grants privileges. It fixes the search path to `public`. Use separate,
appropriately restricted application credentials for ordinary runtime access.

Produce a read-only plan, replacing the opaque example target reference:

```powershell
.\.venv\Scripts\python.exe -m scripts.apply_unified_schema plan --target staging-main
```

Optionally bound the reviewed sequence with, for example,
`--through-version 039_unified_assignments`. The tool selects a prefix of the five
known integration migrations. Local inventory changes outside this scope require
review and an update to the tool, not automatic expansion.

Planning runs in a read-only repeatable-read transaction and returns selected
pending versions, their checksums, findings and `plan_sha256`. It requires complete
baseline ledger entries with known matching checksums and a contiguous integration
history. Missing/null/drifted checksums, unknown applied migrations, numbering
conflicts and missing predecessors block application. It never baselines or repairs
them. The plan hashes the local inventory, current ledger, target reference and
database/schema connection identity. No credentials, student records or raw database
addresses are emitted. These hashes detect drift; they do not authenticate a human
reviewer or substitute for verifying the maintenance connection's target.

## Apply the reviewed plan

After the restore rehearsal and target review, pass the exact emitted plan hash:

```powershell
.\.venv\Scripts\python.exe -m scripts.apply_unified_schema apply --target staging-main --expected-plan-sha256 REVIEWED_64_CHARACTER_SHA256
```

The placeholder intentionally fails validation; use the hash from that target's
reviewed plan. Supply the same `--through-version` if it was used when planning.
Apply recomputes the plan under an exclusive transaction-scoped migration lock,
rejects drift, rechecks the in-memory SQL hashes, and writes the selected DDL and
ledger entries in **one transaction**. Unlike the legacy multi-step runner, this
lock is acquired inside the transaction and released automatically on its outcome.
It does not leave a session lock behind between statements.

The current known files must remain transactional. There is no execution of an
arbitrary supplied SQL path, migration renumbering, down migration or destructive
cleanup command. Statement and lock budgets are 15 seconds and one second; the
whole command has a 60-second deadline including connection establishment. This
small-batch policy can legitimately reject a production-sized migration. Measure
the restored workload and design a separate bounded additive migration if it cannot
fit; do not bypass the timeout or transaction checks to force a live release.

A statement failure rolls back earlier DDL, changed RLS flags and ledger entries
from the selected batch. If the client loses the commit acknowledgement, run
`plan` again and inspect the ledger. A previously used token is rejected once the
ledger changes. An empty, newly reviewed plan is a no-op; successful migrations are
never applied twice. Preserve the plan/result with the authorized change record.

Exit 0 means the requested plan or apply completed within its scope. Exit 2 means
a blocked/invalid plan, changed input, contention or unavailable operation. Error
output uses fixed codes and excludes raw driver diagnostics. `release_authorized`
always remains false, including after application succeeds.

## Validate before enabling the product

Run the target database preflight again and rehearse old/new application behavior,
source counts, ownership, interview completion, rollback-compatible recovery,
deletion replay, provider access and representative load. Keep new feature flags
off until their own release gates pass. A code rollback preserves the expanded
schema and acknowledged artifacts; it does not run reverse DDL.

Local PostgreSQL tests applied the actual 038–042 files against isolated compatible
table fixtures and a **synthetic** baseline ledger. They exercised read-only plans,
unknown checksums, target/plan drift, substituted SQL, shared locking, successful
replanning and late-failure rollback. They are not a full 001–037 migration rehearsal,
Supabase validation, production restore, privilege review or proof of acceptable
lock duration under student traffic. Those target-specific release gates remain open.
