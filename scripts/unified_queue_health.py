"""Read-only operational queue monitoring, never student readiness assessment.

Uses only UNIFIED_MONITOR_DATABASE_URL. No app settings, .env, migrations,
worker execution, public HTTP endpoint or message delivery.
"""
import argparse
import asyncio
from dataclasses import asdict, dataclass
import json
import os


class MonitorError(ValueError):
    pass


@dataclass(frozen=True)
class Thresholds:
    max_evidence_age_seconds: int
    max_validation_queue_age_seconds: int | None = None
    max_quarantined: int = 0
    max_expired_leases: int = 0

    def __post_init__(self):
        for field, value in asdict(self).items():
            if field == 'max_validation_queue_age_seconds' and value is None:
                continue
            minimum = 1 if field.endswith('seconds') else 0
            if type(value) is not int or not minimum <= value <= 31_536_000:
                raise MonitorError('INVALID_MONITOR_THRESHOLDS')


METRICS = {
    'evidence_pending': 'Unprocessed evidence events, including backoff and quarantine.',
    'evidence_ready': 'Unprocessed events eligible for a worker attempt now.',
    'evidence_backoff': 'Unprocessed retryable events waiting for their retry time.',
    'evidence_quarantined': 'Unprocessed events with at least five failed attempts.',
    'evidence_oldest_pending_age_seconds': 'Age of the oldest unprocessed event; zero only when the queue is empty.',
    'validation_queued': 'Validation jobs waiting to be claimed.',
    'validation_running': 'Validation jobs in the running state, including expired leases.',
    'validation_expired_leases': 'Running validation jobs with an expired or missing lease.',
    'validation_oldest_queued_age_seconds': 'Age of the oldest queued validation job; zero only when the queue is empty.',
}


async def inspect(conn, include_validation=False):
    # Exact aggregates over pending rows; a large backlog may time out, in which
    # case no partial or capped counts may be presented as a successful check.
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await conn.execute("SET LOCAL statement_timeout='5s'")
        await conn.execute("SET LOCAL lock_timeout='1s'")
        # Refuse filtered counts when the inspection role is subject to RLS.
        await conn.execute('SET LOCAL row_security=off')
        observed_at = await conn.fetchval('SELECT CURRENT_TIMESTAMP')
        metrics = dict(await conn.fetchrow('''SELECT
            count(*) AS evidence_pending,
            count(*) FILTER(WHERE attempts < 5 AND retry_after <= NOW()) AS evidence_ready,
            count(*) FILTER(WHERE attempts < 5 AND retry_after > NOW()) AS evidence_backoff,
            count(*) FILTER(WHERE attempts >= 5) AS evidence_quarantined,
            COALESCE(GREATEST(EXTRACT(EPOCH FROM NOW()-min(created_at)),0),0)::double precision
                AS evidence_oldest_pending_age_seconds
            FROM unified_evidence_events WHERE processed_at IS NULL'''))
        if include_validation:
            metrics.update(dict(await conn.fetchrow('''SELECT
                count(*) FILTER(WHERE state='QUEUED') AS validation_queued,
                count(*) FILTER(WHERE state='RUNNING') AS validation_running,
                count(*) FILTER(WHERE state='RUNNING' AND (lease_until IS NULL OR lease_until <= NOW()))
                    AS validation_expired_leases,
                COALESCE(GREATEST(EXTRACT(EPOCH FROM NOW()-min(created_at)
                    FILTER(WHERE state='QUEUED')),0),0)::double precision AS validation_oldest_queued_age_seconds
                FROM coding_validation_jobs WHERE state IN ('QUEUED','RUNNING')''')))
        return observed_at, metrics


def evaluate(observed_at, metrics, thresholds):
    include_validation = thresholds.max_validation_queue_age_seconds is not None
    expected = {key for key in METRICS if include_validation or not key.startswith('validation_')}
    if set(metrics) != expected:
        raise MonitorError('INCOMPLETE_MONITOR_MEASUREMENTS')
    # Do not accept NaN, negative or malformed values as healthy measurements.
    import math
    if any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in metrics.values()):
        raise MonitorError('INVALID_MONITOR_MEASUREMENTS')
    findings = []
    for metric, limit, code in (
        ('evidence_oldest_pending_age_seconds', thresholds.max_evidence_age_seconds, 'EVIDENCE_QUEUE_AGED'),
        ('evidence_quarantined', thresholds.max_quarantined, 'EVIDENCE_QUARANTINED'),
        ('validation_oldest_queued_age_seconds', thresholds.max_validation_queue_age_seconds, 'VALIDATION_QUEUE_AGED'),
        ('validation_expired_leases', thresholds.max_expired_leases, 'VALIDATION_LEASE_EXPIRED'),
    ):
        if metric in metrics and limit is not None and metrics[metric] > limit:
            findings.append(code)
    return {
        'schema_version': 1,
        'status': 'ALERT' if findings else 'WITHIN_THRESHOLDS',
        'collection_succeeded': True,
        'validation_checked': include_validation,
        'observed_at': observed_at.isoformat(),
        'observed_at_unix_seconds': observed_at.timestamp(),
        'thresholds': asdict(thresholds),
        'metrics': metrics,
        'findings': findings,
        'release_authorized': False,
    }


def unavailable(code):
    return {'schema_version': 1, 'status': 'UNAVAILABLE', 'collection_succeeded': False,
        'validation_checked': False, 'observed_at': None, 'observed_at_unix_seconds': None,
        'metrics': None, 'findings': [code], 'release_authorized': False}


async def collect(thresholds):
    dsn = os.environ.get('UNIFIED_MONITOR_DATABASE_URL')
    if not dsn:
        return unavailable('EXPLICIT_MONITOR_DATABASE_URL_REQUIRED'), 2
    conn = None
    try:
        import asyncpg
        async with asyncio.timeout(20):
            conn = await asyncpg.connect(dsn, timeout=5, command_timeout=5,
                server_settings={'search_path': 'public'})
            observed_at, metrics = await inspect(conn, thresholds.max_validation_queue_age_seconds is not None)
            report = evaluate(observed_at, metrics, thresholds)
        return report, 1 if report['findings'] else 0
    except Exception:
        # Raw driver errors may contain credentials, addresses or student values.
        return unavailable('QUEUE_MONITOR_UNAVAILABLE'), 2
    finally:
        if conn is not None:
            try:
                await conn.close(timeout=5)
            except asyncio.CancelledError:
                conn.terminate()
                raise
            except Exception:
                conn.terminate()


def prometheus(report):
    lines = []

    def gauge(name, help_text, value):
        name = 'prepvista_unified_' + name
        lines.extend([f'# HELP {name} {help_text}', f'# TYPE {name} gauge', f'{name} {value}'])

    gauge('queue_collection_succeeded', 'One only when every selected queue was inspected.', int(report['collection_succeeded']))
    gauge('queue_validation_checked', 'One only when validation metrics were included successfully.', int(report['validation_checked']))
    # A failed collector emits no zero queue gauges or zero alert count. External
    # monitoring must also check this collection flag and output-file freshness.
    if report['collection_succeeded']:
        gauge('queue_observed_at_unix_seconds', 'Database observation time for detecting stale exported output.', report['observed_at_unix_seconds'])
        gauge('queue_alerts', 'Number of configured queue thresholds exceeded.', len(report['findings']))
        for key, value in report['metrics'].items():
            gauge(key, METRICS[key], value)
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-evidence-age-seconds', type=int, required=True)
    parser.add_argument('--max-validation-queue-age-seconds', type=int,
        help='Also inspect validation queues; omit when that service is outside the monitoring scope.')
    parser.add_argument('--max-quarantined', type=int, default=0)
    parser.add_argument('--max-expired-leases', type=int, default=0)
    parser.add_argument('--format', choices=('json', 'prometheus'), default='json')
    args = parser.parse_args()
    try:
        thresholds = Thresholds(args.max_evidence_age_seconds, args.max_validation_queue_age_seconds,
            args.max_quarantined, args.max_expired_leases)
        report, code = asyncio.run(collect(thresholds))
    except MonitorError as error:
        report, code = unavailable(str(error)), 2
    print(prometheus(report) if args.format == 'prometheus' else json.dumps(report, sort_keys=True, indent=2), end='\n' if args.format == 'json' else '')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
