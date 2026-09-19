# Monitor integration queues

Implemented locally on 2026-09-14. No production monitor, alert destination or
scheduled job has been configured. This command observes operational queues; its
result is not a student readiness state, worker-liveness proof or release approval.

## Run a bounded read-only collection

Provision `UNIFIED_MONITOR_DATABASE_URL` through the maintenance environment's
secret mechanism. The collector never reads application `DATABASE_URL`, loads
`.env`, initializes application pools or runs migrations. The CLI uses the `public`
schema. The inspection role needs SELECT access and complete visibility of the
selected queues. Arrange appropriate access with the database owner; the command
does not create roles, grant privileges or change RLS policies. Keep this connection
and its aggregate output within the operational monitoring boundary.

After applying and reviewing the relevant schema, run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m scripts.unified_queue_health --max-evidence-age-seconds 60
```

For an environment also operating isolated validation:

```powershell
.\.venv\Scripts\python.exe -m scripts.unified_queue_health --max-evidence-age-seconds 60 --max-validation-queue-age-seconds 120 --format prometheus
```

The example age thresholds are starting points for rehearsal, not measured SLOs.
Choose thresholds against the target workload and runner time limits. Omitting the
validation threshold intentionally excludes that queue and sets
`validation_checked=false`; evidence-only success says nothing about validation.
The default permitted quarantine and expired-lease counts are zero. Operators can
set `--max-quarantined` and `--max-expired-leases` explicitly when documenting a
different operating policy. A metric strictly greater than its threshold alerts.

Collection uses one read-only repeatable-read transaction, a five-second statement
timeout, a one-second lock timeout and a 20-second overall collection deadline.
Connection cleanup has a separate five-second budget. `row_security=off` makes
PostgreSQL reject inspection subject to RLS filtering instead of counting only the
visible subset. Missing tables, denied permissions, connection errors and timeouts
produce an unavailable result, never a partial success. This is an exact aggregate
over outstanding rows; a large backlog can exceed the budget. Rehearse its load
before choosing a collection interval or introducing separately reviewed indexes.

## Interpret the results

| Result | Exit | Meaning |
| --- | --- | --- |
| `WITHIN_THRESHOLDS` | 0 | Every selected queue was read and no configured threshold was exceeded |
| `ALERT` | 1 | Collection succeeded and one or more configured thresholds were exceeded |
| `UNAVAILABLE` | 2 | Measurements could not be obtained reliably; metrics are absent |

JSON contains fixed finding codes, aggregate measurements, observation time and
the selected thresholds. It contains no user, organization, artifact or event IDs,
submission code, transcripts or driver diagnostics. `release_authorized` is always
false. No student state, lease, retry count, snapshot or receipt is changed.

Evidence pending includes ready, backoff and quarantined events. Its oldest age is
time since the original event receipt, including time spent waiting on retries.
Validation running includes expired leases; expired or missing leases count as
expired. Completed and unavailable validation jobs are excluded from outstanding
counts. An empty selected queue has a measured count and age of zero. A quiet
queue does not prove its worker is alive. This collector does not measure completed
job throughput, provider health, snapshot correctness/freshness or billing spend.

## Connect to the environment's monitoring service

Prometheus output contains gauges with fixed names and no student/resource labels:

- `prepvista_unified_queue_collection_succeeded`
- `prepvista_unified_queue_validation_checked`
- `prepvista_unified_queue_observed_at_unix_seconds`
- `prepvista_unified_queue_alerts`
- `prepvista_unified_evidence_pending`, `evidence_ready`, `evidence_backoff`,
  `evidence_quarantined`, `evidence_oldest_pending_age_seconds` (same prefix)
- `prepvista_unified_validation_queued`, `validation_running`,
  `validation_expired_leases`, `validation_oldest_queued_age_seconds` (same prefix;
  present only when validation is included)

On failure, only collection/scope indicators are emitted. There are no zero queue
values or zero alert count to accidentally clear an incident. A supervising
collector should publish the complete stdout atomically even for exit 1 or 2 and
preserve the exit status for its own job monitoring. Never retain the last success
indefinitely when the command stops running. Alert on collection failure, nonzero
queue alerts, stale observation time and an absent collector job/series. If
validation is expected, also alert when its checked indicator is zero. Scrape/job
labels should distinguish environments without embedding student identifiers.

Select a collection interval, stale-output threshold, notification destination,
incident owner and escalation procedure in the target environment. No alert message
is sent by this command. Exercise loss of credentials, a stopped collector, a
stopped evidence worker, a quarantined event and an expired validation lease in
staging, and confirm that the intended operator receives and can resolve each
alert. Local tests alone do not satisfy that release gate.

For quarantine, follow the [audited recovery procedure](UNIFIED_EVIDENCE_RECOVERY_RUNBOOK.md).
For validation leases, inspect the qualified runner and dispatcher using their
runbook before resuming service. Do not reset queue rows or reclassify unavailable
execution as student failure to clear monitoring alerts.

Local coverage includes empty queues, ready/backoff/quarantined events, validation
lease states, unchanged source rows, SQL read-only enforcement, RLS-filtered role
rejection, redacted failures, cancellation cleanup and failure-safe metric output.
