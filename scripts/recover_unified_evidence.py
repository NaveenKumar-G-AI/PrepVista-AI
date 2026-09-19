"""Inspect quarantine; preview and apply a bounded, audited retry of exact events.

Uses only UNIFIED_RECOVERY_DATABASE_URL, never app config, DATABASE_URL or .env.
No migrations, source edits, observation replay, grading or deletion operations.
"""
import argparse
import asyncio
from datetime import datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
from uuid import UUID, uuid4

OPAQUE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$')
SHA = re.compile(r'^[a-f0-9]{64}$')


class RecoveryError(ValueError):
    """Only fixed error codes, never raw driver/input text, leave the CLI."""


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def event_ids(values):
    if (not isinstance(values, list) or not 1 <= len(values) <= 100
            or any(type(v) is not int or not 1 <= v <= 9223372036854775807 for v in values)
            or len(set(values)) != len(values)):
        raise RecoveryError('INVALID_EVENT_SELECTION')
    return sorted(values)


def validate_manifest(value):
    fields = {'schema_version', 'request_id', 'target', 'target_sha256', 'ticket_ref', 'created_at', 'expires_at', 'events'}
    if not isinstance(value, dict) or set(value) != fields or type(value['schema_version']) is not int or value['schema_version'] != 1:
        raise RecoveryError('INVALID_MANIFEST')
    try:
        if str(UUID(value['request_id'])) != value['request_id']: raise ValueError()
        if not all(isinstance(value[k], str) and OPAQUE.fullmatch(value[k]) for k in ('target', 'ticket_ref')): raise ValueError()
        if not isinstance(value['target_sha256'], str) or not SHA.fullmatch(value['target_sha256']): raise ValueError()
        created, expires = (datetime.fromisoformat(value[k]) for k in ('created_at', 'expires_at'))
        if created.utcoffset() is None or expires.utcoffset() is None or expires - created != timedelta(minutes=30): raise ValueError()
        rows = value['events']
        if not isinstance(rows, list): raise ValueError()
        ids = event_ids([r['id'] for r in rows])
        if ids != [r['id'] for r in rows]: raise ValueError()
        for row in rows:
            if set(row) != {'id', 'attempts', 'fingerprint'}: raise ValueError()
            if type(row['attempts']) is not int or not 5 <= row['attempts'] <= 2147483647: raise ValueError()
            if not isinstance(row['fingerprint'], str) or not SHA.fullmatch(row['fingerprint']): raise ValueError()
    except (ValueError, TypeError, KeyError, AttributeError):
        raise RecoveryError('INVALID_MANIFEST') from None
    return value


async def transaction_limits(conn):
    await conn.execute("SET LOCAL statement_timeout='5s'")
    await conn.execute("SET LOCAL lock_timeout='1s'")
    # RLS-filtered operators must fail, rather than mistake invisible rows for an
    # empty queue. Credentials still need the requisite explicit DB privileges.
    await conn.execute('SET LOCAL row_security=off')


async def target_digest(conn, target):
    if not isinstance(target, str) or not OPAQUE.fullmatch(target): raise RecoveryError('INVALID_TARGET_REFERENCE')
    identity = await conn.fetchrow('''SELECT current_database() AS database_name,
        current_schema() AS schema_name, current_schema()::regnamespace::oid::bigint AS schema_oid,
        inet_server_addr()::text AS server_address, inet_server_port() AS server_port''')
    return digest({'target': target, **dict(identity)})


async def selected_rows(conn, ids, lock=False):
    # Do not select code, transcripts or result payloads. A hash detects an event
    # payload changed between preview and apply without disclosing the payload.
    rows = await conn.fetch('''SELECT id,user_id,source_module,source_id,source_version,
        processed_at,attempts,retry_after,encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS payload_fingerprint
        FROM unified_evidence_events WHERE id=ANY($1::bigint[]) ORDER BY id''' + (' FOR UPDATE' if lock else ''), ids)
    if len(rows) != len(ids): raise RecoveryError('EVENT_SELECTION_CHANGED')
    result = []
    for row in rows:
        if row['processed_at'] is not None or row['attempts'] < 5: raise RecoveryError('EVENT_NOT_QUARANTINED')
        if await conn.fetchval('''SELECT 1 FROM unified_deletion_tombstones
            WHERE user_id=$1 AND source_module=$2 AND source_id=$3''', row['user_id'], row['source_module'], row['source_id']):
            raise RecoveryError('SOURCE_ERASED')
        queries = {
            'coding': 'SELECT 1 FROM coding_artifacts WHERE user_id=$1 AND id=$2',
            'interview': "SELECT 1 FROM interview_sessions WHERE user_id=$1 AND id=$2 AND state='FINISHED' AND finished_at IS NOT NULL",
            'coding_validation': "SELECT 1 FROM coding_validation_jobs WHERE user_id=$1 AND id=$2 AND state='COMPLETED'",
        }
        query = queries.get(row['source_module'])
        if not query or not await conn.fetchval(query, row['user_id'], row['source_id']): raise RecoveryError('SOURCE_UNAVAILABLE')
        result.append({'id': row['id'], 'attempts': row['attempts'], 'fingerprint': digest(dict(row))})
    return result


async def inspect(conn, after=0):
    if type(after) is not int or not 0 <= after <= 9223372036854775807: raise RecoveryError('INVALID_CURSOR')
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await transaction_limits(conn)
        rows = await conn.fetch('''SELECT id,source_module,attempts,created_at,retry_after
            FROM unified_evidence_events WHERE processed_at IS NULL AND attempts>=5 AND id>$1 ORDER BY id LIMIT 101''', after)
        return {'mode': 'read_only', 'events': [dict(r) for r in rows[:100]],
                'next_after_event_id': rows[99]['id'] if len(rows) > 100 else None, 'release_authorized': False}


async def preview(conn, ids, target, ticket_ref):
    ids = event_ids(ids)
    if not isinstance(ticket_ref, str) or not OPAQUE.fullmatch(ticket_ref): raise RecoveryError('INVALID_TICKET_REFERENCE')
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await transaction_limits(conn)
        target_sha256 = await target_digest(conn, target)
        rows = await selected_rows(conn, ids)
        now = await conn.fetchval('SELECT clock_timestamp()')
        return validate_manifest({'schema_version': 1, 'request_id': str(uuid4()), 'target': target,
            'target_sha256': target_sha256, 'ticket_ref': ticket_ref, 'created_at': now.isoformat(),
            'expires_at': (now + timedelta(minutes=30)).isoformat(), 'events': rows})


async def apply_retry(conn, manifest, target):
    manifest = validate_manifest(manifest)
    if manifest['target'] != target: raise RecoveryError('TARGET_MISMATCH')
    manifest_sha256 = digest(manifest)
    request_id = UUID(manifest['request_id'])
    ids = [row['id'] for row in manifest['events']]
    async with conn.transaction():
        await transaction_limits(conn)
        if await target_digest(conn, target) != manifest['target_sha256']: raise RecoveryError('TARGET_MISMATCH')
        # Duplicate apply calls serialize by operation ID; retries after a lost
        # commit acknowledgement return the same receipt, even after expiry.
        await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', 'unified-recovery:' + str(request_id))
        prior = await conn.fetchrow('SELECT manifest_sha256,retried_count FROM unified_evidence_recovery_audit WHERE request_id=$1', request_id)
        if prior:
            if prior['manifest_sha256'] != manifest_sha256: raise RecoveryError('REQUEST_REUSED_WITH_DIFFERENT_MANIFEST')
            return {'request_id': str(request_id), 'retried_count': prior['retried_count'], 'already_applied': True}
        now = await conn.fetchval('SELECT clock_timestamp()')
        if datetime.fromisoformat(manifest['expires_at']) <= now or datetime.fromisoformat(manifest['created_at']) > now + timedelta(seconds=60):
            raise RecoveryError('MANIFEST_EXPIRED_OR_FUTURE')
        owners = await conn.fetch('SELECT DISTINCT user_id FROM unified_evidence_events WHERE id=ANY($1::bigint[]) ORDER BY user_id', ids)
        # Follow the projection worker's profile -> per-owner advisory -> event
        # lock order. Sorted owner locks also permit overlapping bounded batches.
        for owner in owners:
            user_id = owner['user_id']
            if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id): raise RecoveryError('SOURCE_ERASED')
            await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', 'unified-projection:' + str(user_id))
        current = await selected_rows(conn, ids, lock=True)
        if current != manifest['events']: raise RecoveryError('EVENT_SELECTION_CHANGED')
        updated = await conn.fetch('''UPDATE unified_evidence_events SET attempts=0,retry_after=NOW()
            WHERE id=ANY($1::bigint[]) AND processed_at IS NULL AND attempts>=5 RETURNING id''', ids)
        if len(updated) != len(ids): raise RecoveryError('EVENT_SELECTION_CHANGED')
        await conn.execute('''INSERT INTO unified_evidence_recovery_audit
            (request_id,manifest_sha256,target_sha256,ticket_ref,retried_count) VALUES($1,$2,$3,$4,$5)''',
            request_id, manifest_sha256, manifest['target_sha256'], manifest['ticket_ref'], len(updated))
        return {'request_id': str(request_id), 'retried_count': len(updated), 'already_applied': False}


async def run(args):
    # Validate all local input before connecting. No ambient application pool.
    manifest = None
    if args.command == 'apply':
        path = Path(args.manifest)
        if path.stat().st_size > 100000: raise RecoveryError('MANIFEST_TOO_LARGE')
        manifest = validate_manifest(json.loads(path.read_text(encoding='utf-8-sig')))
    elif args.command == 'preview':
        event_ids(args.event_ids)
        if Path(args.output).exists(): raise RecoveryError('OUTPUT_ALREADY_EXISTS')
    dsn = os.environ.get('UNIFIED_RECOVERY_DATABASE_URL')
    if not dsn: raise RecoveryError('EXPLICIT_RECOVERY_DATABASE_URL_REQUIRED')
    import asyncpg
    conn = None
    try:
        async with asyncio.timeout(30):
            conn = await asyncpg.connect(dsn, timeout=10, command_timeout=5, server_settings={'search_path': 'public'})
            if args.command == 'inspect': return await inspect(conn, args.after_event_id)
            if args.command == 'apply': return {'mode': 'bounded_retry', **await apply_retry(conn, manifest, args.target), 'release_authorized': False}
            result = await preview(conn, args.event_ids, args.target, args.ticket_ref)
            with Path(args.output).open('x', encoding='utf-8') as file:
                file.write(json.dumps(result, indent=2, sort_keys=True) + '\n')
            return {'mode': 'read_only_preview', 'request_id': result['request_id'], 'selected_count': len(result['events']), 'release_authorized': False}
    finally:
        if conn:
            try: await conn.close(timeout=5)
            except Exception: conn.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    listing = commands.add_parser('inspect')
    listing.add_argument('--after-event-id', type=int, default=0)
    planning = commands.add_parser('preview')
    planning.add_argument('--event-ids', type=int, nargs='+', required=True)
    planning.add_argument('--target', required=True, help='Opaque environment reference, no credentials or student identifiers.')
    planning.add_argument('--ticket-ref', required=True, help='Opaque reviewed repair/incident reference.')
    planning.add_argument('--output', required=True, help='New private local manifest path; existing files are never overwritten.')
    applying = commands.add_parser('apply')
    applying.add_argument('--manifest', required=True)
    applying.add_argument('--target', required=True)
    args = parser.parse_args()
    try:
        report, code = asyncio.run(run(args)), 0
    except RecoveryError as error:
        report, code = {'error': str(error), 'release_authorized': False}, 2
    except Exception:
        report, code = {'error': 'RECOVERY_FAILED', 'release_authorized': False}, 2
    print(json.dumps(report, sort_keys=True, indent=2, default=str))
    return code


if __name__ == '__main__': raise SystemExit(main())
