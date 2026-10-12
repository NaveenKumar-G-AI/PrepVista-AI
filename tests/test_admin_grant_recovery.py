from datetime import datetime, timedelta, timezone
from itertools import product
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers.admin_grants import transition_bonus
from app.config import ADMIN_UNLIMITED_BY_PLAN
from app.services import quota
from app.database import connection, bootstrap, readiness
from test_database_audit_regressions import LedgerConnection, release_ledger
from test_batch0_startup_safety import SchemaConnection


@pytest.mark.parametrize('plan,marker_plan,kind', [
    (p,m,k) for p,m,k in product(['free','pro','career'],['free','pro','career'],['normal','unlimited'])])
def test_sentinel_activation_truth_table(plan, marker_plan, kind):
    current = int(ADMIN_UNLIMITED_BY_PLAN[marker_plan])
    if plan == marker_plan:
        assert transition_bonus(current, plan, kind, 'activate', paid_active=True) == current
    else:
        with pytest.raises(HTTPException) as exc:
            transition_bonus(current, plan, kind, 'activate', paid_active=True)
        assert exc.value.status_code == 409


@pytest.mark.parametrize('current,expected', [(0,2),(18,20),(19,20),(20,20),(21,21),(999,999),(1000,1000)])
def test_free_cap_never_reduces_finite_value(current,expected):
    assert transition_bonus(current,'free','normal','activate',paid_active=False)==expected


@pytest.mark.parametrize('current', [0,1,20,985,986,1000])
def test_pro_boundaries(current):
    assert transition_bonus(current,'pro','normal','activate',paid_active=False)==current
    if current <=985:
        assert transition_bonus(current,'pro','normal','activate',paid_active=True)==current+15
    else:
        with pytest.raises(HTTPException):
            transition_bonus(current,'pro','normal','activate',paid_active=True)


@pytest.mark.parametrize('current', [-1,1001,9990,9994,10006])
def test_invalid_stored_value_fails_closed(current):
    with pytest.raises(HTTPException):
        transition_bonus(current,'free','normal','activate',paid_active=False)


@pytest.mark.parametrize('plan,marker_plan', product(['free','pro','career'],repeat=2))
def test_quota_sentinel_isolation(plan,marker_plan):
    actual=quota._effective_limit(plan,3,int(ADMIN_UNLIMITED_BY_PLAN[marker_plan]))
    assert actual == (None if plan==marker_plan or plan=='career' else quota._selected_plan_limit(plan)+3)


@pytest.mark.asyncio
@pytest.mark.parametrize('plan,bonus', [('free',9991),('pro',9992),('career',0)])
async def test_enforcement_handles_unlimited(monkeypatch,plan,bonus):
    from contextlib import asynccontextmanager
    from types import SimpleNamespace
    @asynccontextmanager
    async def db(): yield object()
    monkeypatch.setattr(quota,'DatabaseConnection',db)
    resolve=AsyncMock(return_value=(None,None,10**9,0,bonus))
    monkeypatch.setattr(quota,'_resolve_selected_plan_usage',resolve)
    await quota.enforce_quota(SimpleNamespace(premium_override=False,plan=plan,id='test'))
    resolve.assert_awaited_once()


def test_rollover_boundary():
    assert quota._period_needs_reset(datetime.now(timezone.utc)-timedelta(days=30,seconds=1))
    assert not quota._period_needs_reset(datetime.now(timezone.utc)-timedelta(days=29))
    assert quota._period_needs_reset(None)


def test_actual_filename_sorting_and_historical_checksums():
    directory=Path(connection.__file__).parent/'migrations'
    files=sorted(f for f in directory.iterdir() if f.suffix=='.sql' and f.name[0].isdigit())
    stems=[f.stem for f in files]
    assert stems.index('048a_current_schema_reconciliation')==stems.index('048_account_deletion_claim_leases')+1
    assert stems.index('049_backend_schema_access_hardening')==stems.index('048a_current_schema_reconciliation')+1
    assert stems[-1]=='053_old_user_metadata_receipt'
    assert len([s for s in stems if s.startswith('034')])==2
    ledger=release_ledger()
    assert ledger['012_admin_bonus']=='d5ad148a11952d96fad2268366ff4c65ec08bac7df04aebca52b0b423d626e10'
    assert ledger['048_account_deletion_claim_leases']=='989701781f7f0d59498ac50ed69af754de18db37c15ea6aea35e79963ea93f13'


@pytest.mark.asyncio
async def test_cutoff_does_not_apply_cron_or_journal():
    ledger=release_ledger()
    for v in list(ledger):
        if v>'048_account_deletion_claim_leases': del ledger[v]
    conn=LedgerConnection(ledger)
    assert await connection._run_migrations(conn,through='049_backend_schema_access_hardening')==2
    assert '052_admin_grant_contract' not in conn.ledger
    assert not any('CREATE OR REPLACE FUNCTION public.cron_' in q for q,_,_ in conn.statements)


@pytest.mark.asyncio
async def test_cutoff_still_validates_later_applied_checksums():
    ledger=release_ledger()
    ledger['052_admin_grant_contract']='bad'
    conn=LedgerConnection(ledger)
    with pytest.raises(connection.MigrationStartupError,match='INCOMPATIBLE'):
        await connection._run_migrations(conn,through='049_backend_schema_access_hardening')
    assert not any('INSERT INTO schema_migrations' in q for q,_,_ in conn.statements)


@pytest.mark.asyncio
@pytest.mark.parametrize('cutoff',['049',''])
async def test_invalid_cutoff_rejected(cutoff):
    with pytest.raises(connection.MigrationStartupError,match='cutoff'):
        await connection._run_migrations(LedgerConnection(release_ledger()),through=cutoff)


@pytest.mark.asyncio
@pytest.mark.parametrize('defect',['missing','null','mismatch'])
async def test_readiness_ledger_failure_is_readonly(defect):
    conn=SchemaConnection()
    if defect=='missing': conn.ledger.pop()
    else: conn.ledger[0]['checksum']=None if defect=='null' else 'bad'
    with pytest.raises(connection.DatabaseNotReadyError,match='ledger'):
        await readiness.check_schema_readiness(conn)
    assert all(q.startswith('SELECT') for q in conn.queries)


@pytest.mark.asyncio
async def test_bootstrap_rejects_url_as_role_sql(monkeypatch):
    monkeypatch.setenv('DATABASE_URL','postgresql://bad%27%3Brole:fake@127.0.0.1/test')
    monkeypatch.setenv('MIGRATION_DATABASE_URL','postgresql://postgres@127.0.0.1/test')
    connect=AsyncMock()
    monkeypatch.setattr(bootstrap.asyncpg,'connect',connect)
    with pytest.raises(RuntimeError,match='identity'):
        await bootstrap.run_bootstrap()
    connect.assert_not_awaited()
