"""Read-only release diagnostics; never opens the application pool or runs DDL.

Default: inspect local migration files and an optional explicit JSON flag plan.
--database: inspect only UNIFIED_PREFLIGHT_DATABASE_URL, never DATABASE_URL/.env.
Outputs no credentials, student identifiers, code, transcripts or provider payloads.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r'^\d{3,}_[a-z0-9_]+$')
FLAGS = {
    'DATABASE_MIGRATIONS_ON_STARTUP',
    'CODING_WORKSPACE_ENABLED', 'CODING_ALL_STUDENTS_ENABLED', 'CODING_SERVER_SYNC_ENABLED', 'CODING_GUEST_IMPORT_ENABLED',
    'CODING_AI_ENABLED', 'UNIFIED_EVIDENCE_ENABLED', 'UNIFIED_EVIDENCE_IN_PROCESS_ENABLED', 'UNIFIED_READINESS_VISIBLE',
    'UNIFIED_TPO_VISIBLE', 'UNIFIED_ASSIGNMENTS_ENABLED',
    'CODING_TRUSTED_VALIDATION_ENABLED',
    'ARTIFACT_REVIEW_ENABLED',
}
DEPENDENCIES = {
    'CODING_ALL_STUDENTS_ENABLED': ['CODING_WORKSPACE_ENABLED'],
    'CODING_SERVER_SYNC_ENABLED': ['CODING_WORKSPACE_ENABLED'],
    'CODING_GUEST_IMPORT_ENABLED': ['CODING_SERVER_SYNC_ENABLED'],
    'CODING_AI_ENABLED': ['CODING_SERVER_SYNC_ENABLED'],
    'UNIFIED_READINESS_VISIBLE': ['CODING_SERVER_SYNC_ENABLED', 'UNIFIED_EVIDENCE_ENABLED'],
    'UNIFIED_TPO_VISIBLE': ['UNIFIED_READINESS_VISIBLE'],
    'UNIFIED_ASSIGNMENTS_ENABLED': ['UNIFIED_READINESS_VISIBLE'],
    'CODING_TRUSTED_VALIDATION_ENABLED': ['CODING_SERVER_SYNC_ENABLED', 'UNIFIED_EVIDENCE_ENABLED'],
    'ARTIFACT_REVIEW_ENABLED': ['CODING_SERVER_SYNC_ENABLED'],
}
TABLES = {
    'coding_workspaces': {'user_id', 'revision', 'state'},
    'coding_artifacts': {'id', 'user_id', 'request_id', 'content', 'authority'},
    'coding_imports': {'id', 'user_id', 'base_revision', 'merged_state', 'committed_at'},
    'coding_ai_requests': {'user_id', 'request_id', 'state', 'provider', 'model', 'input_tokens', 'output_tokens', 'total_tokens'},
    'unified_evidence_events': {'id', 'user_id', 'source_id', 'source_version', 'processed_at', 'attempts', 'retry_after'},
    'unified_observations': {'event_id', 'user_id', 'adapter_version', 'observation'},
    'unified_deletion_tombstones': {'user_id', 'source_module', 'source_id'},
    'unified_readiness_snapshots': {'id', 'user_id', 'role', 'policy_version', 'input_digest', 'watermark', 'snapshot'},
    'practice_missions': {'id', 'user_id', 'objective', 'status', 'completion_source_id'},
    'unified_sharing': {'user_id', 'organization_id', 'enabled'},
    'unified_assignment_batches': {'intervention_id', 'organization_id', 'request_id', 'request_digest'},
    'unified_assignment_links': {'assignment_id', 'user_id', 'mission_id', 'accepted_at', 'withdrawn_at'},
    'intervention': {'id', 'institution_id'},
    'intervention_assignment': {'id', 'student_id', 'intervention_id', 'status'},
    'audit_log': {'id', 'institution_id', 'action'},
    'interview_answer_retries': {'id', 'user_id', 'session_id', 'mission_id'},
    'coding_validation_jobs': {'id','user_id','artifact_id','request_id','suite_sha256','code_sha256','qualification_id','runner_image','state','lease_token','lease_until','result'},
    'unified_evidence_recovery_audit': {'request_id','manifest_sha256','target_sha256','ticket_ref','database_role','retried_count','created_at'},
    'artifact_review_requests': {'id','user_id','artifact_id','reviewer_id','artifact_digest','consent_version','status','withdrawn_at'},
    'artifact_review_feedback': {'review_id','reviewer_id','content','content_digest','created_at'},
    'artifact_review_audit': {'review_id','actor_id','action','created_at'},
}
TRIGGERS = {
    'interview_sessions': {'unified_interview_finished', 'unified_interview_erasure'},
    'coding_artifacts': {'unified_coding_erasure'},
    'interview_answer_retries': {'unified_retry_saved', 'unified_retry_erasure'},
    'practice_missions': {'unified_assignment_completed', 'unified_assignment_source_erased'},
    'coding_validation_jobs': {'coding_validation_completed', 'coding_validation_erasure'},
}
CRITICAL_TYPES = {
    ('unified_evidence_events', 'source_version'): 'bigint',
    ('coding_workspaces', 'state'): 'jsonb',
    ('coding_artifacts', 'user_id'): 'uuid',
    ('unified_assignment_links', 'mission_id'): 'uuid',
}


def inventory(directory=ROOT / 'app/database/migrations'):
    result, numbers = {}, set()
    for path in sorted(directory.glob('*.sql')):
        if not path.resolve().is_relative_to(directory.resolve()) or not VERSION.fullmatch(path.stem):
            raise ValueError('Invalid local migration inventory')
        number = int(path.stem.split('_', 1)[0])
        if number in numbers: raise ValueError('Duplicate local migration number')
        numbers.add(number)
        # Match the app runner's UTF-8 BOM handling and universal-newline checksum.
        result[path.stem] = hashlib.sha256(path.read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest()
    if not result: raise ValueError('Empty migration inventory')
    return result


def flag_issues(value):
    if not isinstance(value, dict) or set(value) - FLAGS - {'CODING_PILOT_PROFILE_IDS', 'ARTIFACT_REVIEWER_PROFILE_IDS'}:
        return ['FLAG_PLAN_UNKNOWN_FIELDS']
    if any(type(value.get(key, False)) is not bool for key in FLAGS):
        return ['FLAG_PLAN_REQUIRES_BOOLEANS']
    issues = [f'{flag}_REQUIRES_{dependency}' for flag, required in DEPENDENCIES.items()
              if value.get(flag) for dependency in required if not value.get(dependency)]
    if value.get('CODING_WORKSPACE_ENABLED') and value.get('DATABASE_MIGRATIONS_ON_STARTUP', True):
        issues.append('UNIFIED_ROLLOUT_REQUIRES_SEPARATE_MIGRATIONS')
    raw = value.get('CODING_PILOT_PROFILE_IDS', '')
    try:
        if not isinstance(raw, str): raise ValueError()
        ids = [item.strip() for item in raw.split(',') if item.strip()]
        if any(str(UUID(item)) != item for item in ids): raise ValueError()
        if value.get('CODING_WORKSPACE_ENABLED') and not value.get('CODING_ALL_STUDENTS_ENABLED') and not ids:
            issues.append('PILOT_PROFILES_REQUIRED')
    except (ValueError, AttributeError): issues.append('PILOT_PROFILES_INVALID')
    if value.get('ARTIFACT_REVIEW_ENABLED'):
        try:
            reviewers = value.get('ARTIFACT_REVIEWER_PROFILE_IDS', '').split(',')
            if not 1 <= len(reviewers) <= 50 or any(str(UUID(item.strip())) != item.strip() for item in reviewers): raise ValueError()
        except (ValueError, AttributeError): issues.append('ARTIFACT_REVIEWERS_REQUIRED_OR_INVALID')
    return issues


def compare_ledger(local, rows):
    issues = []
    applied = {}
    for row in rows:
        version = row['version']
        if version not in local:
            issues.append({'code': 'UNKNOWN_APPLIED_MIGRATION', 'version': version if VERSION.fullmatch(version) else 'UNRECOGNIZED_VERSION'})
            continue
        applied[version] = row['checksum']
        if not row['checksum']: issues.append({'code': 'CHECKSUM_UNVERIFIED', 'version': version})
        elif row['checksum'] != local[version]: issues.append({'code': 'CHECKSUM_DRIFT', 'version': version})
    for version in local:
        if version not in applied: issues.append({'code': 'MIGRATION_PENDING', 'version': version})
    return issues


async def inspect_database(conn, local, schema='public'):
    if not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', schema): raise ValueError('Invalid schema identifier')
    issues = []
    metrics = None
    # All following statements, including future accidental writes, are protected
    # by PostgreSQL's read-only transaction rather than a naming convention.
    async with conn.transaction(isolation='repeatable_read', readonly=True):
        await conn.execute("SET LOCAL statement_timeout='5s'")
        await conn.execute("SET LOCAL lock_timeout='1s'")
        tables = await conn.fetch('''SELECT c.relname,c.relrowsecurity,
            (r.rolsuper OR r.rolbypassrls OR (pg_has_role(current_user,c.relowner,'USAGE') AND NOT c.relforcerowsecurity)) AS sees_all_rows
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_catalog.pg_roles r ON r.rolname=current_user
            WHERE n.nspname=$1 AND c.relkind IN ('r','p')''', schema)
        by_name = {row['relname']: row for row in tables}
        attributes = await conn.fetch('''SELECT c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS column_type FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped''', schema)
        columns = {}
        for row in attributes: columns.setdefault(row['relname'], set()).add(row['attname'])
        types = {(r['relname'], r['attname']): r['column_type'] for r in attributes}
        for key, expected in CRITICAL_TYPES.items():
            if types.get(key) != expected: issues.append({'code': 'COLUMN_TYPE_MISMATCH', 'table': key[0], 'column': key[1]})
        if 'schema_migrations' not in by_name: issues.append({'code': 'MIGRATION_LEDGER_MISSING'})
        elif not {'version', 'checksum'} <= columns.get('schema_migrations', set()): issues.append({'code': 'MIGRATION_LEDGER_UNVERIFIED'})
        else:
            rows = await conn.fetch(f'SELECT version,checksum FROM "{schema}".schema_migrations LIMIT 10001')
            if len(rows) > 10000: issues.append({'code': 'MIGRATION_LEDGER_LIMIT'})
            else: issues.extend(compare_ledger(local, rows))
        for table, expected in TABLES.items():
            if table not in by_name:
                issues.append({'code': 'TABLE_MISSING', 'table': table}); continue
            if not expected <= columns.get(table, set()): issues.append({'code': 'COLUMNS_MISSING', 'table': table})
            if not by_name[table]['relrowsecurity']: issues.append({'code': 'RLS_DISABLED', 'table': table})
            if not by_name[table]['sees_all_rows']: issues.append({'code': 'ROW_VISIBILITY_UNVERIFIED', 'table': table})
        triggers = await conn.fetch('''SELECT c.relname,t.tgname,t.tgenabled::text AS tgenabled FROM pg_catalog.pg_trigger t
            JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=$1 AND NOT t.tgisinternal''', schema)
        active = {(row['relname'], row['tgname']) for row in triggers if row['tgenabled'] in ('O', 'A')}
        for table, names in TRIGGERS.items():
            for name in names:
                if (table, name) not in active: issues.append({'code': 'TRIGGER_MISSING_OR_DISABLED', 'table': table, 'trigger': name})
        policies = await conn.fetch('''SELECT DISTINCT c.relname FROM pg_catalog.pg_policy p
            JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=$1 AND p.polpermissive''', schema)
        for row in policies:
            if row['relname'] in TABLES: issues.append({'code': 'DATABASE_POLICY_REVIEW_REQUIRED', 'table': row['relname']})
        # An auditor subject to RLS must never report a filtered zero as healthy.
        if not any(i['code'] in ('TABLE_MISSING', 'COLUMNS_MISSING', 'ROW_VISIBILITY_UNVERIFIED') for i in issues):
            metrics = dict(await conn.fetchrow(f'''SELECT count(*) FILTER(WHERE processed_at IS NULL) AS pending,
                count(*) FILTER(WHERE processed_at IS NULL AND attempts>=5) AS quarantined,
                COALESCE(EXTRACT(EPOCH FROM NOW()-min(created_at) FILTER(WHERE processed_at IS NULL)),0)::float8 AS oldest_pending_seconds
                FROM "{schema}".unified_evidence_events'''))
            if metrics['quarantined']: issues.append({'code': 'QUARANTINED_EVIDENCE'})
    return {'checked': True, 'issues': issues, 'queue': metrics}


async def run(args):
    local = inventory()
    flags = json.loads(Path(args.flags_file).read_text(encoding='utf-8-sig')) if args.flags_file else {}
    issues = flag_issues(flags)
    database = {'checked': False, 'issues': [], 'queue': None}
    if args.database:
        dsn = os.environ.get('UNIFIED_PREFLIGHT_DATABASE_URL')
        if not dsn: database['issues'].append({'code': 'EXPLICIT_PREFLIGHT_DATABASE_URL_REQUIRED'})
        else:
            import asyncpg
            conn = None
            try:
                async with asyncio.timeout(30):
                    conn = await asyncpg.connect(dsn, timeout=10, command_timeout=5)
                    database = await inspect_database(conn, local, args.schema)
            except Exception:
                # Driver diagnostics may contain credentials, hostnames or query data.
                database = {'checked': False, 'issues': [{'code': 'DATABASE_CHECK_FAILED'}], 'queue': None}
            finally:
                if conn:
                    try: await conn.close(timeout=5)
                    except Exception: conn.terminate()
    passed = not issues and not database['issues']
    return {'schema_version': 1, 'mode': 'database_read_only' if args.database else 'local_only',
        'scope': 'migration_ledger_required_columns_rls_policy_presence_triggers_and_queue',
        'local_migrations': local, 'flag_issues': issues, 'database': database,
        'technical_checks_passed': bool(database['checked'] and passed), 'release_authorized': False,
        'remaining_release_gates': ['qualified_assessment', 'live_auth_and_provider_validation', 'restore_and_load_rehearsal', 'pilot_and_release_review']}, (0 if passed else 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', action='store_true')
    parser.add_argument('--schema', default='public')
    parser.add_argument('--flags-file', help='Explicit JSON containing only rollout flags and canonical pilot IDs; no secrets.')
    args = parser.parse_args()
    try: report, code = asyncio.run(run(args))
    except Exception:
        report, code = {'schema_version': 1, 'technical_checks_passed': False, 'release_authorized': False, 'error': 'LOCAL_PREFLIGHT_INPUT_INVALID'}, 2
    print(json.dumps(report, sort_keys=True, indent=2))
    return code


if __name__ == '__main__': raise SystemExit(main())
