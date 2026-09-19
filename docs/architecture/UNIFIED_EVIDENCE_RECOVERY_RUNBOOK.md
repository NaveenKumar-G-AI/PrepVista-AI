# Unified evidence quarantine recovery

Implemented locally on 2026-09-13. This procedure requires an authorized target
database and reviewed repair; it has not been run against staging or production.
It covers failed, unprocessed events only. It does not replay processed history,
alter an assessment policy, approve a release or repair source data automatically.

## Preconditions

Identify and test the cause of the failed adapter/projection before retrying.
Retain the incident/repair reference, observed counts and relevant version records
in the organization's existing restricted operational system. The CLI does not
authenticate a human approver or verify the contents of that reference.

Review the actual migration ledger before applying locally allocated
`041_unified_evidence_recovery.sql`. It adds an RLS-protected audit table with no
browser policies. Its number is provisional until reconciled with every target.
The CLI never applies migrations or initializes the application pool.

Provision `UNIFIED_RECOVERY_DATABASE_URL` through the target's secret mechanism.
The tool never reads `DATABASE_URL`, `.env`, Supabase user sessions or provider
credentials. Use a dedicated operator database role and private network access.
Inspection needs read access to the selected evidence/source/tombstone tables;
apply also needs profile-row locking, event updates and audit insertion. The
operator must be authorized to see the complete selected scope. `row_security=off`
causes an RLS-filtered query to fail rather than silently return an incomplete view;
it does not itself grant any access. Ordinary browser roles cannot use this path.

The connection fixes `search_path` to `public`, has a 30-second operation deadline,
five-second statement deadlines and one-second lock deadlines. Keep migrations,
privileges and role provisioning in the existing reviewed deployment workflow.

## Inspect, preview, apply

Inspect up to 100 quarantined events, using the returned cursor for the next page:

```powershell
.\.venv\Scripts\python.exe -m scripts.recover_unified_evidence inspect
.\.venv\Scripts\python.exe -m scripts.recover_unified_evidence inspect --after-event-id 100
```

The IDs in these examples are placeholders. Inspection shows event ID, module,
attempt count and queue dates; it excludes owner IDs, source IDs and payloads.
It uses a read-only transaction. It neither retries events nor clears quarantine.

After investigating the exact failed events, create a private manifest:

```powershell
.\.venv\Scripts\python.exe -m scripts.recover_unified_evidence preview --event-ids 101 102 --target staging-eu --ticket-ref REPAIR-123 --output C:\PrivateOps\evidence-retry.json
```

Select one to 100 unique positive event IDs. There is no retry-all option. Preview
requires every selected event to be unprocessed and quarantined, with its original
source still present and no deletion tombstone. It leaves database state unchanged
and creates a new local file; it refuses to overwrite an existing file. Keep that
file private because operational IDs and hashes can still be linkable metadata.
Use opaque environment/ticket references, never credentials or student information.

Review the manifest's target, count, exact IDs and incident reference. It expires
after 30 minutes and binds the selection to event fingerprints and database/schema
identity. Fingerprints detect drift; they are not signatures, independent evidence
of human approval, or proof of the database host's identity. Verify the connection
through the normal authorized environment configuration, especially for clones.

Apply that exact manifest to the same explicitly named target:

```powershell
.\.venv\Scripts\python.exe -m scripts.recover_unified_evidence apply --manifest C:\PrivateOps\evidence-retry.json --target staging-eu
```

Apply takes the existing profile/projection/event locks, rechecks every selected
record, and atomically resets only `attempts` and `retry_after`. A changed, processed,
missing, expired or tombstoned selection aborts the entire batch. It does not delete
observations, snapshots, artifacts, interview reports or tombstones, insert synthetic
evidence, run student code, call providers, charge credits or start a worker.

The same transaction writes one audit receipt containing request ID, manifest and
target hashes, repair reference, authenticated database role, count and timestamp.
It contains no student/source IDs or source payloads. An audit-write failure rolls
back the retry. Repeating an identical successful request returns its existing
receipt, including after a lost acknowledgement or later source deletion; it cannot
requeue the events again. Reusing its request ID with changed contents is rejected.
Retain operator attribution in the database identity and external incident record;
a shared database role alone cannot identify the individual operator.

Resume the already configured independent evidence worker only when the cause is
fixed. Observe its processed/failed/pending/quarantined counts and reconcile the
selected events with canonical observations and snapshots in the authorized target.
If the error remains, each event backs off and returns to quarantine after five
failed attempts. Multiple workers serialize the attempt and its failure accounting;
a stale candidate cannot bypass backoff or increment the same failure twice.

## Errors and limits

Exit 0 means the requested inspection, preview or bounded retry completed. Exit 2
means invalid input, drift, access failure or an unavailable operation. Outputs never
include raw database error text, connection strings or student content. A connection
loss during commit can leave the client uncertain: repeat the same manifest to
resolve the receipt, rather than invent a new request. `release_authorized` remains
false in every response.

An expired unapplied manifest needs a fresh read-only preview. Preserve the prior
incident trail according to approved operational retention. Do not bypass a drift or
deletion error by changing manifest hashes, clearing tombstones or editing checksums.
For schema changes, processed-history reprojection or source repair, use a separately
reviewed additive/versioned procedure; this tool intentionally has no such command.

The database tests exercise real migrations, concurrent duplicate apply, all-or-none
selection checks, deleted sources, tombstones, RLS denial, audit-write rollback and
atomic worker failure accounting. Production privilege provisioning, target restore
drills, operator access review, monitoring and incident exercises remain release gates.
