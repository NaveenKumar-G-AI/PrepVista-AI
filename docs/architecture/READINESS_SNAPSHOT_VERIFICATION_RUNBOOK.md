# Read-only readiness snapshot verification

Implemented and tested locally on 2026-09-14. This tool verifies reproducibility
and recorded ledger relationships; it does not approve readiness assessments,
certify student ability, change records or authorize deployment.

## Offline replay

The committed example is an authored empty-evidence fixture, not student data:

```powershell
.\.venv\Scripts\python.exe -m scripts.verify_readiness_snapshots --snapshot-file docs/architecture/readiness-snapshot.fixture.example.json
```

The envelope contains `schema_version: 1` and one to 10 `snapshots`. Each record
contains `id`, `role`, `policy_version`, `input_digest`, `watermark` and the internal
stored `snapshot`, including its `calculation_inputs` and `evidence_window`.
Owner-facing reports intentionally exclude those internal inputs and cannot be
substituted for this private record format. Do not add them to student exports
or institution responses for this tool's convenience.

Offline replay supports the existing `practice-evidence-v1` and
`practice-evidence-v2` policies with adapter version 1. It recomputes the input
fingerprint, watermark, complete row/source/confidence payload and proposed mission
at the recorded UTC day. The V2 replay label is pinned independently of future
active policy changes. Unknown policy/adapter versions are unavailable, not weak
performance or a successful verification. The historical calculation is compared
as stored; today's service health and new activities do not rewrite it.

Private files are read with an eight-megabyte limit. Individual snapshot payloads
are limited to two megabytes and recorded event lists to 500. Malformed, oversized
or unsupported records produce bounded findings without echoing private input.
Offline mode never opens a database, even if database environment variables exist.

## Verify against a database ledger

Provision `UNIFIED_VERIFICATION_DATABASE_URL` through the authorized environment's
secret mechanism. This is a dedicated operator connection: the CLI never falls
back to `DATABASE_URL`, loads `.env`, initializes the app pool or runs migrations.
It fixes the database search path to `public`. Supply one to 10 exact canonical
snapshot IDs; there is no implicit scan of all students:

```powershell
.\.venv\Scripts\python.exe -m scripts.verify_readiness_snapshots --snapshot-ids 00000000-0000-4000-8000-000000000001
```

Replace the example UUID with reviewed target records. Use an operator role already
authorized to read the selected snapshots, observations, events, deletion ledger
and source tables. This is not a student or staff HTTP endpoint. A read-only,
repeatable-read transaction gives one consistent view without taking projection
or source row locks. `row_security=off` causes RLS-filtered access to fail instead
of reporting a misleading partial result; it does not grant access. Connection and
operation deadlines are bounded at 10 and 30 seconds, with five-second statement
and one-second lock deadlines. PostgreSQL rejects accidental writes in this path.

After a successful replay, the verifier compares recorded inputs with normalized
observations for the same event and owner, checks event/source identity and
processing state, rejects tombstoned sources, and checks that the original artifact,
finished interview or completed validation job remains present. Normalization and
ordering are shared with the snapshot writer, including correlated interview retry
revisions. Unknown/missing/foreign inputs and mismatched observations fail the audit.
Normal source erasure removes affected snapshots, so later requests report
`SNAPSHOT_NOT_FOUND` without recreating anything.

The ledger scope is **recorded input events only**. This does not prove that the
original 500-record window included every eligible historical event, reconstruct
historical transaction visibility, validate the meaning of a rubric, verify runner
isolation, or authenticate an exported record. A party able to rewrite both stored
inputs and hashes could preserve consistency. Source authenticity, calibration,
full backfill reconciliation and restore/load rehearsals remain separate gates.
Newer work is allowed to exist beyond an older snapshot's recorded inputs.

## Results and response

Exit 0 means all checks requested in that mode passed. Exit 2 means a finding,
unsupported record, invalid input or an unavailable operation. Reports include
snapshot IDs, booleans and fixed issue codes, excluding owner/source IDs, code,
transcripts, calculation inputs, credentials and raw driver diagnostics. Treat the
report itself as private operational metadata. `assessment_qualified` and
`release_authorized` always remain false; offline `ledger_checked` remains false.

Preserve the report with the environment/version and authorized incident or release
record. Investigate differences before changing policy or visibility. Do not repair
failures by overwriting snapshot payloads, input hashes or migration checksums.
Recover quarantined unprocessed events with the separate bounded recovery tool;
historical reprojection needs its own reviewed versioned procedure. No production
target has been audited during this implementation.
