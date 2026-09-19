"""Plan or apply only the reviewed unified integration migrations.

Requires UNIFIED_MIGRATION_DATABASE_URL. Never uses app config, DATABASE_URL,
.env, the application pool, missing-checksum baselining or down migrations.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re

from app.database.migration_control import transaction_migration_lock
from scripts.unified_release_preflight import ROOT, inventory, compare_ledger

VERSIONS = ('038_unified_coding', '039_unified_assignments', '040_coding_validation', '041_unified_evidence_recovery', '042_artifact_review_consent')
DIRECTORY = ROOT / 'app/database/migrations'
TARGET = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$')


class MigrationPlanError(ValueError):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def local_plan_inputs(directory=DIRECTORY):
    local = inventory(directory)
    legacy = {name for name in local if int(name.split('_', 1)[0]) <= 37}
    if {int(name.split('_', 1)[0]) for name in legacy} != set(range(1, 38)) or set(local) != legacy | set(VERSIONS):
        raise MigrationPlanError('LOCAL_MIGRATION_SCOPE_REQUIRES_REVIEW')
    sql = {}
    for version in VERSIONS:
        path = directory / (version + '.sql')
        if path.stat().st_size > 10_000_000: raise MigrationPlanError('MIGRATION_FILE_TOO_LARGE')
        sql[version] = path.read_text(encoding='utf-8-sig')
        if hashlib.sha256(sql[version].encode()).hexdigest() != local[version]:
            raise MigrationPlanError('LOCAL_MIGRATION_CHANGED_DURING_READ')
        # These known files are transactional. Do not silently broaden this
        # utility to nontransactional or newly numbered scripts.
        if re.search(r'\bCONCURRENTLY\b|^\s*(?:COMMIT|ROLLBACK|BEGIN|START\s+TRANSACTION)\s*;', sql[version], re.I | re.M):
            raise MigrationPlanError('MIGRATION_TRANSACTION_REVIEW_REQUIRED')
    return local, sql


async def limits(conn):
    await conn.execute("SET LOCAL statement_timeout='15s'")
    await conn.execute("SET LOCAL lock_timeout='1s'")
    await conn.execute('SET LOCAL row_security=off')


async def inspect_plan(conn, local, target, through):
    if not TARGET.fullmatch(target) or through not in VERSIONS: raise MigrationPlanError('INVALID_MIGRATION_SCOPE')
    identity = dict(await conn.fetchrow('''SELECT current_database() AS database_name,
        current_schema() AS schema_name,current_schema()::regnamespace::oid::bigint AS schema_oid,
        inet_server_addr()::text AS server_address,inet_server_port() AS server_port'''))
    if not await conn.fetchval("SELECT to_regclass('schema_migrations')"):
        raise MigrationPlanError('VERIFIED_LEGACY_MIGRATION_LEDGER_REQUIRED')
    rows = await conn.fetch('SELECT version,checksum FROM schema_migrations ORDER BY version LIMIT 10001')
    if len(rows) > 10000: raise MigrationPlanError('MIGRATION_LEDGER_TOO_LARGE')
    issues = [issue for issue in compare_ledger(local, rows)
              if issue['code'] != 'MIGRATION_PENDING' or issue['version'] not in VERSIONS]
    applied = {row['version'] for row in rows}
    # Integration history must be a prefix; a missing predecessor is never
    # interpreted as permission to reconstruct the deployed schema in place.
    gap = False
    for version in VERSIONS:
        if version not in applied: gap = True
        elif gap: issues.append({'code': 'NONCONTIGUOUS_INTEGRATION_LEDGER', 'version': version})
    selected = VERSIONS[:VERSIONS.index(through) + 1]
    pending = [version for version in selected if version not in applied]
    plan = {'schema_version': 1, 'target': target, 'target_sha256': digest(identity),
        'through_version': through, 'pending_versions': pending,
        'local_inventory_sha256': digest(local), 'ledger_sha256': digest([dict(row) for row in rows]),
        'pending_checksums': {version: local[version] for version in pending}, 'issues': issues,
        'plan_ready': not issues, 'release_authorized': False}
    return {**plan, 'plan_sha256': digest(plan)}


async def plan_database(conn, local, target, through):
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await limits(conn)
        return await inspect_plan(conn, local, target, through)


async def apply_database(conn, local, sql, target, through, expected):
    if not re.fullmatch(r'[a-f0-9]{64}', expected): raise MigrationPlanError('EXACT_PLAN_HASH_REQUIRED')
    async with conn.transaction():
        await limits(conn)
        await transaction_migration_lock(conn)
        plan = await inspect_plan(conn, local, target, through)
        if not plan['plan_ready']: raise MigrationPlanError('MIGRATION_LEDGER_REVIEW_REQUIRED')
        if plan['plan_sha256'] != expected: raise MigrationPlanError('MIGRATION_PLAN_CHANGED')
        for version in plan['pending_versions']:
            # Check the in-memory bytes again; callers cannot substitute SQL
            # after reviewing the plan's inventory and selected checksums.
            if hashlib.sha256(sql[version].encode()).hexdigest() != local[version]:
                raise MigrationPlanError('MIGRATION_CONTENT_CHANGED')
            await conn.execute(sql[version], timeout=60)
            await conn.execute('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', version, local[version])
        return {'schema_version': 1, 'target': target, 'applied_versions': plan['pending_versions'],
            'applied_plan_sha256': expected, 'release_authorized': False}


async def run(args):
    local, sql = local_plan_inputs()
    if not TARGET.fullmatch(args.target): raise MigrationPlanError('INVALID_MIGRATION_SCOPE')
    if args.command == 'apply' and not re.fullmatch(r'[a-f0-9]{64}', args.expected_plan_sha256):
        raise MigrationPlanError('EXACT_PLAN_HASH_REQUIRED')
    dsn = os.environ.get('UNIFIED_MIGRATION_DATABASE_URL')
    if not dsn: raise MigrationPlanError('EXPLICIT_MIGRATION_DATABASE_URL_REQUIRED')
    import asyncpg
    conn = None
    try:
        async with asyncio.timeout(60):
            conn = await asyncpg.connect(dsn, timeout=10, command_timeout=15, server_settings={'search_path': 'public'})
            if args.command == 'plan':
                report = await plan_database(conn, local, args.target, args.through_version)
                return report, 0 if report['plan_ready'] else 2
            return await apply_database(conn, local, sql, args.target, args.through_version, args.expected_plan_sha256), 0
    finally:
        if conn:
            try: await conn.close(timeout=5)
            except Exception: conn.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('plan', 'apply'):
        command = commands.add_parser(name)
        command.add_argument('--target', required=True, help='Opaque reviewed environment reference; no secrets or student data.')
        command.add_argument('--through-version', choices=VERSIONS, default=VERSIONS[-1])
        if name == 'apply': command.add_argument('--expected-plan-sha256', required=True)
    args = parser.parse_args()
    try: report, code = asyncio.run(run(args))
    except MigrationPlanError as error:
        report, code = {'error': str(error), 'release_authorized': False}, 2
    except Exception:
        report, code = {'error': 'MIGRATION_OPERATION_UNAVAILABLE', 'release_authorized': False}, 2
    print(json.dumps(report, sort_keys=True, indent=2))
    return code


if __name__ == '__main__': raise SystemExit(main())
