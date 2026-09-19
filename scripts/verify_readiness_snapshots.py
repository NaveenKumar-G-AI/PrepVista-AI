"""Read-only replay and ledger verification of explicitly selected snapshots.

Offline mode reads a private fixture file only. Database mode uses exclusively
UNIFIED_VERIFICATION_DATABASE_URL, never DATABASE_URL, .env or the app pool.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
from uuid import UUID

from app.services.coding_contracts import digest
from app.services.readiness_snapshot_verification import MAX_SNAPSHOT_BYTES, verify_record
from app.services.unified_readiness import normalized_inputs


class VerificationError(ValueError):
    pass


def snapshot_ids(values):
    try:
        if not isinstance(values, list) or not 1 <= len(values) <= 10: raise ValueError()
        ids = [UUID(value) for value in values]
        if any(str(identifier) != value for identifier, value in zip(ids, values)) or len(set(ids)) != len(ids): raise ValueError()
        return ids
    except (ValueError, TypeError, AttributeError):
        raise VerificationError('INVALID_SNAPSHOT_SELECTION') from None


async def verify_ledger(conn, record, report):
    if report['reproducible'] is not True: return report
    payload = json.loads(record['snapshot']) if isinstance(record['snapshot'], str) else record['snapshot']
    inputs = payload['calculation_inputs']
    ids = [event['id'] for event in inputs['events']]
    records = await conn.fetch('''SELECT o.event_id,o.source_module,o.adapter_version,o.observation,
        e.source_version,e.processed_at,
        EXISTS(SELECT 1 FROM unified_deletion_tombstones d WHERE d.user_id=e.user_id
            AND d.source_module=e.source_module AND d.source_id=e.source_id) AS tombstoned,
        CASE e.source_module
            WHEN 'coding' THEN EXISTS(SELECT 1 FROM coding_artifacts a WHERE a.user_id=e.user_id AND a.id=e.source_id)
            WHEN 'interview' THEN EXISTS(SELECT 1 FROM interview_sessions s WHERE s.user_id=e.user_id AND s.id=e.source_id AND s.state='FINISHED' AND s.finished_at IS NOT NULL)
            WHEN 'coding_validation' THEN EXISTS(SELECT 1 FROM coding_validation_jobs j WHERE j.user_id=e.user_id AND j.id=e.source_id AND j.state='COMPLETED')
            ELSE FALSE END AS source_available,
        (o.source_id=e.source_id AND o.source_module=e.source_module) AS source_matches
        FROM unified_observations o JOIN unified_evidence_events e ON e.id=o.event_id
        WHERE o.event_id=ANY($1::bigint[]) AND o.user_id=$2 AND e.user_id=$2
        ORDER BY o.event_id DESC''', ids, record['user_id'])
    issues = report['issues']
    report['ledger_checked'] = True
    report['ledger_scope'] = 'recorded_input_events_only'
    if len(records) != len(ids): issues.append('LEDGER_INPUT_MISSING_OR_FOREIGN')
    if any(row['tombstoned'] for row in records): issues.append('DELETION_BOUNDARY_VIOLATION')
    if any(not row['source_available'] for row in records): issues.append('SOURCE_UNAVAILABLE')
    if any(not row['source_matches'] or row['processed_at'] is None for row in records): issues.append('LEDGER_SOURCE_STATE_MISMATCH')
    try:
        canonical = normalized_inputs(records)
        if record['policy_version'] == 'practice-evidence-v1' and not canonical['validations']:
            canonical.pop('validations')
        supplied = {key: value for key, value in inputs.items() if key != 'as_of'}
        if digest(canonical) != digest(supplied): issues.append('LEDGER_OBSERVATION_MISMATCH')
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        issues.append('LEDGER_OBSERVATION_INVALID')
    report['ledger_matches'] = not issues
    return report


async def inspect_database(conn, ids):
    # One consistent view protects verification from concurrent source deletion or
    # worker commits. No row/advisory locks and no mutation, even for valid results.
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await conn.execute("SET LOCAL statement_timeout='5s'")
        await conn.execute("SET LOCAL lock_timeout='1s'")
        await conn.execute('SET LOCAL row_security=off')
        reports = []
        for identifier in ids:
            record = await conn.fetchrow('''SELECT id,user_id,role,policy_version,input_digest,watermark,
                CASE WHEN octet_length(snapshot::text) <= $2 THEN snapshot ELSE NULL END AS snapshot
                FROM unified_readiness_snapshots WHERE id=$1''', identifier, MAX_SNAPSHOT_BYTES)
            if record is None:
                reports.append({'snapshot_id': str(identifier), 'reproducible': None, 'ledger_checked': False,
                    'issues': ['SNAPSHOT_NOT_FOUND'], 'assessment_qualified': False, 'release_authorized': False})
            else:
                reports.append(await verify_ledger(conn, record, verify_record(record)))
        return reports


def offline_records(path):
    with Path(path).open('rb') as source:
        raw = source.read(8_000_001)
    if len(raw) > 8_000_000: raise VerificationError('INPUT_FILE_TOO_LARGE')
    value = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(value, dict) or set(value) != {'schema_version', 'snapshots'} or type(value['schema_version']) is not int or value['schema_version'] != 1:
        raise VerificationError('INVALID_INPUT_ENVELOPE')
    records = value['snapshots']
    if not isinstance(records, list) or not 1 <= len(records) <= 10: raise VerificationError('INVALID_INPUT_ENVELOPE')
    snapshot_ids([record['id'] for record in records])
    return records


async def run(args):
    if args.snapshot_file:
        reports = [verify_record(record) for record in offline_records(args.snapshot_file)]
        mode = 'offline_replay'
    else:
        ids = snapshot_ids(args.snapshot_ids)
        dsn = os.environ.get('UNIFIED_VERIFICATION_DATABASE_URL')
        if not dsn: raise VerificationError('EXPLICIT_VERIFICATION_DATABASE_URL_REQUIRED')
        import asyncpg
        conn = None
        try:
            async with asyncio.timeout(30):
                conn = await asyncpg.connect(dsn, timeout=10, command_timeout=5, server_settings={'search_path': 'public'})
                reports = await inspect_database(conn, ids)
        finally:
            if conn:
                try: await conn.close(timeout=5)
                except Exception: conn.terminate()
        mode = 'database_read_only'
    passed = all(report['reproducible'] is True and not report['issues'] for report in reports)
    return {'schema_version': 1, 'mode': mode, 'checks_passed': passed,
        'ledger_checked': mode == 'database_read_only' and all(report['ledger_checked'] for report in reports),
        'snapshots': reports, 'assessment_qualified': False, 'release_authorized': False}, 0 if passed else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--snapshot-file', help='Private JSON fixture with metadata and internal calculation inputs, up to 10 snapshots.')
    mode.add_argument('--snapshot-ids', nargs='+', help='One to 10 exact canonical snapshot UUIDs in the explicitly configured database.')
    args = parser.parse_args()
    try: report, code = asyncio.run(run(args))
    except VerificationError as error:
        report, code = {'error': str(error), 'checks_passed': False, 'release_authorized': False}, 2
    except Exception:
        # Neither malformed private JSON nor driver diagnostics belong in output.
        report, code = {'error': 'SNAPSHOT_VERIFICATION_UNAVAILABLE', 'checks_passed': False, 'release_authorized': False}, 2
    print(json.dumps(report, sort_keys=True, indent=2))
    return code


if __name__ == '__main__': raise SystemExit(main())
