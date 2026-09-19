import asyncio
import json
from types import SimpleNamespace
from scripts import unified_release_preflight as preflight


def test_ledger_distinguishes_pending_drift_unknown_and_unverified():
    local = {'038_unified_coding': 'a', '039_unified_assignments': 'b', '040_future': 'c'}
    result = preflight.compare_ledger(local, [
        {'version': '038_unified_coding', 'checksum': 'old'},
        {'version': '039_unified_assignments', 'checksum': None},
        {'version': '040_different_use', 'checksum': 'private-value'},
    ])
    assert {r['code'] for r in result} == {'CHECKSUM_DRIFT', 'CHECKSUM_UNVERIFIED', 'UNKNOWN_APPLIED_MIGRATION', 'MIGRATION_PENDING'}
    assert 'private-value' not in json.dumps(result)


def test_flags_reject_string_booleans_secrets_and_wildcard_pilots():
    assert preflight.flag_issues({'CODING_WORKSPACE_ENABLED': 'false'}) == ['FLAG_PLAN_REQUIRES_BOOLEANS']
    assert preflight.flag_issues({'API_KEY': 'secret'}) == ['FLAG_PLAN_UNKNOWN_FIELDS']
    assert 'PILOT_PROFILES_INVALID' in preflight.flag_issues({'CODING_WORKSPACE_ENABLED': True, 'CODING_PILOT_PROFILE_IDS': '*'})
    issues = preflight.flag_issues({'UNIFIED_ASSIGNMENTS_ENABLED': True})
    assert 'UNIFIED_ASSIGNMENTS_ENABLED_REQUIRES_UNIFIED_READINESS_VISIBLE' in issues


def test_local_mode_never_uses_ambient_application_database(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@production/database')
    monkeypatch.setenv('UNIFIED_PREFLIGHT_DATABASE_URL', 'postgresql://private:secret@production/database')
    import asyncpg
    async def forbidden(*args, **kwargs): raise AssertionError('Local mode attempted a database connection')
    monkeypatch.setattr(asyncpg, 'connect', forbidden)
    report, code = asyncio.run(preflight.run(SimpleNamespace(database=False, flags_file=None, schema='public')))
    assert code == 0 and not report['database']['checked'] and not report['technical_checks_passed']
    assert not report['release_authorized'] and 'secret' not in json.dumps(report)


def test_database_mode_requires_dedicated_connection_and_redacts_failures(monkeypatch):
    monkeypatch.delenv('UNIFIED_PREFLIGHT_DATABASE_URL', raising=False)
    args = SimpleNamespace(database=True, flags_file=None, schema='public')
    report, code = asyncio.run(preflight.run(args))
    assert code == 2 and report['database']['issues'][0]['code'] == 'EXPLICIT_PREFLIGHT_DATABASE_URL_REQUIRED'
    import asyncpg
    async def failure(*args, **kwargs): raise RuntimeError('password=private-secret host=internal-production')
    monkeypatch.setattr(asyncpg, 'connect', failure)
    monkeypatch.setenv('UNIFIED_PREFLIGHT_DATABASE_URL', 'an-explicit-test-value')
    report, code = asyncio.run(preflight.run(args))
    assert code == 2 and report['database']['issues'][0]['code'] == 'DATABASE_CHECK_FAILED'
    assert 'private-secret' not in json.dumps(report) and 'internal-production' not in json.dumps(report)


def test_inventory_matches_app_checksum_and_rejects_number_collisions(tmp_path):
    from app.database.connection import _compute_migration_checksum, _read_migration_sql
    path = tmp_path / '038_one.sql'
    path.write_bytes(b'\xef\xbb\xbfSELECT 1;\r\n')
    assert preflight.inventory(tmp_path)[path.stem] == _compute_migration_checksum(_read_migration_sql(path))
    (tmp_path / '038_two.sql').write_text('SELECT 2;')
    import pytest
    with pytest.raises(ValueError, match='Duplicate'): preflight.inventory(tmp_path)
