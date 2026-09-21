"""Report recovery contracts use saved messages, independently of AI availability."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import reports
from app.services.report_truth import (
    SAFE_EVALUATION_ERRORS,
    build_report_truth,
    evaluation_processing,
    saved_answer_records,
)


NOW = datetime(2026, 9, 20, 12, tzinfo=timezone.utc)
SID = '11111111-1111-4111-8111-111111111111'


def messages():
    return [
        {'role': 'assistant', 'turn_number': 1, 'content': 'How did you test your change?'},
        {'role': 'user', 'turn_number': 1, 'content': 'I saved the input and tested the exact output.'},
        {'role': 'assistant', 'turn_number': 2, 'content': 'What did you learn?'},
        {'role': 'user', 'turn_number': 2, 'content': 'I learned to check empty input.'},
        {'role': 'user', 'turn_number': 3, 'content': '[NO_ANSWER]'},
    ]


def job(turn=1, state='PENDING', age=0, due_minutes=-1, code=None):
    return {'turn_number': turn, 'state': state, 'attempts': 1, 'error_code': code,
            'updated_at': NOW - timedelta(minutes=age),
            'retry_after': NOW + timedelta(minutes=due_minutes)}


@pytest.mark.parametrize('state', ['PENDING', 'RUNNING'])
def test_stalled_jobs_become_retryable_without_being_a_student_failure(state):
    processing = evaluation_processing(messages(), [], [job(state=state, age=6)], now=NOW)
    assert processing['state'] == 'DELAYED'
    assert processing['retryable_count'] == 2  # Stale job and an answer never queued.
    assert processing['jobs'][0]['state'] == 'DELAYED'
    assert processing['jobs'][0]['can_retry']


@pytest.mark.parametrize('age,due', [(1, -1), (6, 1)])
def test_an_active_lease_cannot_be_reset(age, due):
    processing = evaluation_processing(messages(), [], [job(state='RUNNING', age=age, due_minutes=due)], now=NOW)
    assert processing['state'] == 'PROCESSING'
    assert processing['jobs'][0]['can_retry'] is False


def test_failed_retry_cooldown_has_a_visible_deadline():
    processing = evaluation_processing(messages(), [], [job(state='FAILED', age=2)], now=NOW)
    assert processing['jobs'][0]['can_retry'] is False
    assert processing['retry_available_at'] == (NOW + timedelta(minutes=3)).isoformat()
    retryable = evaluation_processing(messages(), [], [job(state='FAILED', age=5)], now=NOW)
    assert retryable['jobs'][0]['can_retry'] is True


@pytest.mark.parametrize('code', sorted(SAFE_EVALUATION_ERRORS))
def test_error_diagnostics_use_only_declared_safe_codes(code):
    processing = evaluation_processing(messages(), [], [job(code=code)], now=NOW)
    assert processing['jobs'][0]['error_code'] == code


def test_provider_details_and_secrets_cannot_enter_report_diagnostics():
    processing = evaluation_processing(messages(), [], [job(code='provider says token=secret and answer text')], now=NOW)
    assert processing['jobs'][0]['error_code'] == 'EVALUATION_UNAVAILABLE'
    assert 'secret' not in str(processing)


def test_saved_transcripts_are_available_even_when_all_evaluations_are_missing():
    source = messages()
    source.append({'role': 'user', 'turn_number': 1, 'content': 'A duplicate delivery.'})
    processing = evaluation_processing(source, [], [], now=NOW)
    saved = saved_answer_records(source, [], processing)
    assert [answer['turn_number'] for answer in saved] == [1, 2]
    assert saved[0]['question_text'] == source[0]['content']
    assert saved[0]['raw_answer'] == source[1]['content']
    assert saved[0]['evaluation_state'] == 'NOT_QUEUED'


def test_stale_queue_no_longer_labels_report_as_indefinitely_generating():
    stale = job(age=6)
    stale['updated_at'] = datetime.now(timezone.utc) - timedelta(minutes=6)
    stale['retry_after'] = datetime.now(timezone.utc) - timedelta(minutes=1)
    truth = build_report_truth({'plan': 'career'}, [], messages(), [stale])
    assert truth['report_state'] == 'PARTIAL'
    assert truth['aggregate']['final_score'] is None
    assert truth['summary']['answered_questions'] == 2
    assert truth['evaluation_processing']['state'] == 'DELAYED'


def test_old_pending_job_cannot_hide_a_completed_evaluation():
    rows = [{'turn_number': 1, 'score': 8, 'rubric_category': 'technical_depth'}]
    truth = build_report_truth({'plan': 'pro'}, rows, messages()[:2], [job()])
    assert truth['report_state'] == 'READY'
    assert truth['pending_evaluations'] == 0
    assert truth['evaluation_processing']['state'] == 'COMPLETE'
    assert saved_answer_records(messages()[:2], rows, truth['evaluation_processing'])[0]['evaluation_state'] == 'AVAILABLE'


def install_connection(monkeypatch, conn):
    @asynccontextmanager
    async def connect():
        yield conn
    monkeypatch.setattr(reports, 'DatabaseConnection', connect)


def test_owner_guard_runs_before_transcript_or_queue_reads(monkeypatch):
    conn = SimpleNamespace(fetchrow=AsyncMock(return_value=None), fetch=AsyncMock())
    install_connection(monkeypatch, conn)
    with pytest.raises(HTTPException) as error:
        asyncio.run(reports.get_report(SID, SimpleNamespace(id='other-owner')))
    assert error.value.status_code == 404
    conn.fetch.assert_not_called()
    assert conn.fetchrow.call_args.args[1:] == (SID, 'other-owner')


def test_shared_report_never_exposes_saved_transcripts_or_queue_diagnostics(monkeypatch):
    session = {'id': SID, 'plan': 'pro', 'total_turns': 2, 'finished_at': NOW,
               'duration_actual_seconds': 120, 'runtime_state': {}}
    conn = SimpleNamespace(fetchrow=AsyncMock(return_value=session),
                           fetch=AsyncMock(side_effect=[[], messages()]))
    install_connection(monkeypatch, conn)
    report = asyncio.run(reports.get_shared_report('public-test-token'))
    assert report['session']['final_score'] is None
    assert 'saved_answers' not in report
    assert 'evaluation_processing' not in report
    assert messages()[1]['content'] not in str(report)


def test_audio_signing_failure_does_not_hide_the_rest_of_the_report(monkeypatch):
    monkeypatch.setattr(reports, 'create_signed_url', AsyncMock(side_effect=RuntimeError('unavailable')))
    rows = [{'turn_number': 1, 'raw_answer': 'The saved answer', 'repaired_answer': None}]
    output = [{}]
    meta = asyncio.run(reports._attach_audit_trail(output, rows,
        [{'turn_number': 1, 'audio_object_path': 'private/object', 'stt_confidence': None, 'stt_provider': 'test'}], created_at=NOW))
    assert output[0]['audit']['audio_url'] is None
    assert not meta['has_audio']
