import asyncio
from datetime import datetime, timezone
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import asyncpg
import pytest

from scripts import unified_queue_health as monitor


NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


def metrics(validation=False):
    return {key: 0 for key in monitor.METRICS if validation or not key.startswith('validation_')}


def test_threshold_boundaries_and_optional_validation_scope():
    values = {**metrics(), 'evidence_pending': 2, 'evidence_ready': 1,
        'evidence_quarantined': 1, 'evidence_oldest_pending_age_seconds': 60}
    report = monitor.evaluate(NOW, values, monitor.Thresholds(60, max_quarantined=1))
    assert report['status'] == 'WITHIN_THRESHOLDS' and not report['validation_checked']
    assert not report['release_authorized']
    values['evidence_oldest_pending_age_seconds'] = 60.01
    report = monitor.evaluate(NOW, values, monitor.Thresholds(60))
    assert report['findings'] == ['EVIDENCE_QUEUE_AGED', 'EVIDENCE_QUARANTINED']
    values = {**metrics(True), 'validation_queued': 1, 'validation_running': 1,
        'validation_oldest_queued_age_seconds': 121, 'validation_expired_leases': 1}
    report = monitor.evaluate(NOW, values, monitor.Thresholds(60, 120))
    assert report['validation_checked']
    assert report['findings'] == ['VALIDATION_QUEUE_AGED', 'VALIDATION_LEASE_EXPIRED']


def test_invalid_thresholds_or_incomplete_measurements_cannot_report_success():
    for value in (True, 0, -1, 1.5, 31_536_001):
        with pytest.raises(monitor.MonitorError): monitor.Thresholds(value)
    for value in (True, -1, 1.5):
        with pytest.raises(monitor.MonitorError): monitor.Thresholds(60, max_quarantined=value)
    with pytest.raises(monitor.MonitorError):
        monitor.evaluate(NOW, metrics(), monitor.Thresholds(60, 120))
    for value in (None, False, float('nan'), float('inf'), -1):
        with pytest.raises(monitor.MonitorError):
            monitor.evaluate(NOW, {**metrics(), 'evidence_pending': value}, monitor.Thresholds(60))


def test_prometheus_unavailable_omits_queue_values_and_success_has_no_dynamic_labels():
    output = monitor.prometheus(monitor.unavailable('FIXTURE_FAILURE'))
    assert 'prepvista_unified_queue_collection_succeeded 0' in output
    assert 'prepvista_unified_evidence_pending' not in output
    assert 'prepvista_unified_queue_alerts' not in output
    output = monitor.prometheus(monitor.evaluate(NOW, metrics(), monitor.Thresholds(60)))
    assert 'prepvista_unified_queue_collection_succeeded 1' in output
    assert 'prepvista_unified_queue_observed_at_unix_seconds 1789344000.0' in output
    assert 'prepvista_unified_evidence_pending 0' in output
    assert 'prepvista_unified_validation_queued' not in output
    assert '{' not in output


def test_monitor_ignores_ambient_database_configuration(monkeypatch):
    monkeypatch.delenv('UNIFIED_MONITOR_DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@example.invalid/never')
    connect = AsyncMock(side_effect=AssertionError('must not connect'))
    monkeypatch.setattr(asyncpg, 'connect', connect)
    report, code = asyncio.run(monitor.collect(monitor.Thresholds(60)))
    assert code == 2 and report['metrics'] is None
    assert report['findings'] == ['EXPLICIT_MONITOR_DATABASE_URL_REQUIRED']
    connect.assert_not_called()
    assert 'secret' not in json.dumps(report)


@pytest.mark.parametrize('failure', [None, RuntimeError('private DSN and student payload'), asyncio.TimeoutError()])
def test_collection_cleanup_error_redaction_and_exit_status(monkeypatch, failure):
    monkeypatch.setenv('UNIFIED_MONITOR_DATABASE_URL', 'explicit-monitor-fixture')
    conn = SimpleNamespace(close=AsyncMock(), terminate=Mock())
    connect = AsyncMock(return_value=conn)
    monkeypatch.setattr(asyncpg, 'connect', connect)
    values = {**metrics(), 'evidence_quarantined': 1, 'evidence_pending': 1}
    inspect = AsyncMock(return_value=(NOW, values), side_effect=failure)
    monkeypatch.setattr(monitor, 'inspect', inspect)
    report, code = asyncio.run(monitor.collect(monitor.Thresholds(60)))
    assert connect.call_args.args == ('explicit-monitor-fixture',)
    assert code == (2 if failure else 1)
    assert report['status'] == ('UNAVAILABLE' if failure else 'ALERT')
    assert 'private DSN' not in json.dumps(report)
    if failure:
        assert report['metrics'] is None and not report['collection_succeeded']
    conn.close.assert_awaited_once()


def test_cancellation_propagates_and_failed_close_terminates(monkeypatch):
    monkeypatch.setenv('UNIFIED_MONITOR_DATABASE_URL', 'explicit-monitor-fixture')
    conn = SimpleNamespace(close=AsyncMock(side_effect=asyncio.TimeoutError()), terminate=Mock())
    monkeypatch.setattr(asyncpg, 'connect', AsyncMock(return_value=conn))
    monkeypatch.setattr(monitor, 'inspect', AsyncMock(side_effect=asyncio.CancelledError()))
    with pytest.raises(asyncio.CancelledError): asyncio.run(monitor.collect(monitor.Thresholds(60)))
    conn.terminate.assert_called_once()


def test_cli_invalid_threshold_emits_parseable_unavailable_metrics(monkeypatch, capsys):
    monkeypatch.setattr('sys.argv', ['monitor', '--max-evidence-age-seconds', '-1', '--format', 'prometheus'])
    assert monitor.main() == 2
    output = capsys.readouterr().out
    assert 'prepvista_unified_queue_collection_succeeded 0' in output
    assert 'evidence_pending' not in output
