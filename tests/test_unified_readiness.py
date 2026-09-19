from datetime import datetime, timezone
from app.services.unified_readiness import project, project_v2

NOW = datetime(2026, 9, 12, tzinfo=timezone.utc)


def test_missing_measurements_remain_unknown_and_no_global_score():
    result = project('GENERAL_SWE', [], [], [], as_of=NOW)
    assert result['overall_state'] == 'MORE_EVIDENCE_NEEDED'
    assert all(row['state'] == 'NOT_MEASURED' and row['coverage'] == 0 for row in result['rows'])
    assert 'score' not in result


def test_fluent_explanation_does_not_cancel_failing_browser_checks():
    artifact = {'id': 'a', 'created_at': NOW.isoformat(), 'content': {'passed': 0, 'total': 5, 'explanation': 'A fluent explanation'}}
    result = project('backend-engineer', [], [], [artifact], as_of=NOW)
    rows = {row['key']: row for row in result['rows']}
    assert rows['correctness']['state'] == 'DEVELOPING'
    assert rows['communication']['state'] == 'NOT_MEASURED'
    assert result['overall_state'] == 'MORE_EVIDENCE_NEEDED'
    assert result['next_mission']['title'] == 'Repair a failing practice check'


def test_stale_evidence_has_separate_freshness_and_replay_is_deterministic():
    artifact = {'id': 'a', 'created_at': '2020-01-01T00:00:00+00:00', 'content': {'passed': 5, 'total': 5, 'explanation': ''}}
    first = project('GENERAL_SWE', [{'id': 7}], [], [artifact], as_of=NOW)
    assert first == project('GENERAL_SWE', [{'id': 7}], [], [artifact], as_of=NOW)
    row = next(r for r in first['rows'] if r['key'] == 'correctness')
    assert row['freshness'] == 'STALE'
    assert row['state'] == 'INSUFFICIENT_EVIDENCE'


def validation(**changes):
    return {'id': 'job-a', 'artifact_id': 'a', 'created_at': NOW.isoformat(), 'passed': 4, 'total': 4,
        'suite_id': 'suite-v1', 'suite_sha256': 'suite-digest', 'qualification_id': 'review-v1',
        'correlation_id': 'same-code', **changes}


def test_server_checks_keep_authority_without_double_counting_or_global_readiness_claim():
    artifact = {'id': 'a', 'created_at': NOW.isoformat(), 'content': {'passed': 4, 'total': 4, 'explanation': '', 'correlation_id': 'same-code'}}
    inputs = ('GENERAL_SWE', [], [], [artifact], [validation(), validation(id='job-b')])
    result = project_v2(*inputs, as_of=NOW)
    assert result == project_v2(*inputs, as_of=NOW)
    row = next(r for r in result['rows'] if r['key'] == 'correctness')
    assert {s['authority'] for s in row['sources']} == {'CLIENT_REPORTED', 'ISOLATED_SERVER_TEST'}
    assert row['coverage'] == 1 and row['state'] == 'INSUFFICIENT_EVIDENCE'
    assert result['overall_state'] == 'MORE_EVIDENCE_NEEDED'
    assert result['policy_version'] == 'practice-evidence-v2'
    assert project('GENERAL_SWE', [], [], [], as_of=NOW)['policy_version'] == 'practice-evidence-v1'


def test_passing_one_suite_does_not_erase_failure_and_server_failures_offer_artifact_repair():
    artifact = {'id': 'a', 'created_at': NOW.isoformat(), 'content': {'passed': 0, 'total': 4, 'explanation': '', 'correlation_id': 'same-code'}}
    result = project_v2('GENERAL_SWE', [], [], [artifact], [validation()], as_of=NOW)
    assert next(r for r in result['rows'] if r['key'] == 'correctness')['state'] == 'DEVELOPING'
    result = project_v2('GENERAL_SWE', [], [], [], [validation(passed=0)], as_of=NOW)
    assert result['next_mission']['href'] == '/coding/debug?artifact_id=a'
    assert next(r for r in result['rows'] if r['key'] == 'correctness')['state'] == 'DEVELOPING'
    assert result['overall_state'] == 'MORE_EVIDENCE_NEEDED'


def test_old_server_failure_does_not_replace_the_next_step_for_a_new_saved_revision():
    repaired = {'id': 'new-revision', 'created_at': NOW.isoformat(), 'content': {'passed': 4, 'total': 4, 'explanation': 'recorded', 'correlation_id': 'new-code'}}
    result = project_v2('GENERAL_SWE', [], [], [repaired], [validation(passed=0)], as_of=NOW)
    assert result['next_mission']['href'] == '/interview/setup?artifact_id=new-revision&mode=project_defense'
    assert next(r for r in result['rows'] if r['key'] == 'correctness')['state'] == 'DEVELOPING'
