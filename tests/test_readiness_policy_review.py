from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import pytest
from app.services.readiness_policy_review import CandidatePolicy, Rule, Observation, Case, FixtureSet, project_candidate, evaluate_fixtures

NOW = datetime(2026, 9, 13, tzinfo=timezone.utc)


def policy(**changes):
    return CandidatePolicy(role_id='GENERAL_SWE', version='candidate-v1', rules=[Rule(capability='correctness',
        minimum_demonstrations=2, minimum_task_families=2, freshness_days=90,
        accepted_measurements=['suite-v1'], accepted_authorities=['ISOLATED_SERVER_TEST'], accepted_execution_languages=['javascript'])], **changes)


def observation(id='a', **changes):
    return Observation.model_validate({'id': id, 'role_id': 'GENERAL_SWE', 'capability': 'correctness',
        'authority': 'ISOLATED_SERVER_TEST', 'measurement_id': 'suite-v1', 'task_family': id,
        'correlation_id': id, 'observed_at': NOW - timedelta(days=1), 'time_authority': 'SERVER_RECEIPT_TIME',
        'availability': 'AVAILABLE', 'assistance': 'UNKNOWN', 'outcome': 'DEMONSTRATED', 'execution_language': 'javascript', **changes})


def run(*observations, selected_policy=None):
    return project_candidate(selected_policy or policy(), Case(id='case', as_of=NOW, observations=list(observations)))


def test_empty_and_low_authority_inputs_cannot_qualify_a_candidate_row():
    assert run()['rows'][0]['candidate_state'] == 'NOT_MEASURED'
    result = run(observation(authority='CLIENT_REPORTED'))
    assert result['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'
    assert result['rows'][0]['excluded'] == {'PRACTICE_SIGNAL_ONLY': 1}


def test_candidate_completion_never_authorizes_real_grading_or_independence():
    result = run(observation(), observation('b'))
    assert result['candidate_overall'] == 'DEMONSTRATED_IN_PRACTICE'
    assert result['mode'] == 'SHADOW_ONLY' and result['release_authorized'] is False
    assert result['rows'][0]['confidence'] == 'NOT_CALIBRATED'
    assert result['rows'][0]['independence'] == 'NOT_ESTABLISHED'
    with pytest.raises(ValueError): policy(review_status='APPROVED')


def test_replays_followups_and_same_task_family_do_not_inflate_coverage():
    first = observation()
    assert run(first, first) == run(first)
    repeated = observation('follow-up', task_family='a', correlation_id='a')
    result = run(first, repeated)
    assert result['rows'][0]['demonstrations'] == 1
    assert result['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'
    result = run(first, observation('b', task_family='a'))
    assert result['rows'][0]['task_families'] == 1
    assert result['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'
    with pytest.raises(ValueError): run(first, observation(outcome='GAP'))


@pytest.mark.parametrize('changes,reason', [
    ({'observed_at': NOW-timedelta(days=91)}, 'STALE'),
    ({'observed_at': NOW+timedelta(seconds=1)}, 'FUTURE_TIME'),
    ({'time_authority': 'CLIENT_CLAIMED'}, 'UNTRUSTED_TIME'),
    ({'availability': 'UNAVAILABLE'}, 'UNAVAILABLE'),
    ({'availability': 'UNSUPPORTED'}, 'UNSUPPORTED'),
    ({'role_id': 'another-role'}, 'ROLE_MISMATCH'),
    ({'measurement_id': 'old-suite'}, 'MEASUREMENT_NOT_ACCEPTED'),
    ({'execution_language': 'python'}, 'LANGUAGE_NOT_ACCEPTED'),
    ({'outcome': 'INCONCLUSIVE'}, 'INCONCLUSIVE'),
])
def test_unknown_stale_unavailable_and_incomparable_results_do_not_become_zero(changes, reason):
    result = run(observation(**changes))
    assert result['rows'][0]['excluded'] == {reason: 1}
    assert result['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'
    assert result['rows'][0]['candidate_state'] == 'INSUFFICIENT_EVIDENCE'
    assert 'score' not in result['rows'][0]


def test_missing_critical_capability_and_real_gaps_cannot_be_compensated():
    base = policy()
    extra = Rule(capability='communication', minimum_demonstrations=1, minimum_task_families=1,
        freshness_days=90, accepted_measurements=['communication-v1'], accepted_authorities=['QUALIFIED_RUBRIC_REVIEW'])
    combined = CandidatePolicy(role_id=base.role_id, version=base.version, rules=[*base.rules, extra])
    assert run(observation(), observation('b'), selected_policy=combined)['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'
    assert run(observation(), observation('b', outcome='GAP'))['candidate_overall'] == 'DEVELOPING'


def test_comparable_conflicts_and_inconsistent_correlation_metadata_require_review():
    result = run(observation(comparison_id='same-assessment'), observation('b', outcome='GAP', comparison_id='same-assessment'))
    assert result['candidate_overall'] == 'REVIEW_NEEDED'
    assert result['rows'][0]['review_reasons'] == ['COMPARABLE_OUTCOMES_CONFLICT']
    result = run(observation(), observation('b', correlation_id='a'))
    assert result['rows'][0]['candidate_state'] == 'REVIEW_NEEDED'
    assert result['candidate_overall'] == 'MORE_EVIDENCE_NEEDED'


def test_execution_cannot_claim_communication_or_enable_client_authority():
    with pytest.raises(ValueError): observation(capability='communication')
    with pytest.raises(ValueError): Rule(capability='correctness', minimum_demonstrations=1, minimum_task_families=1,
        freshness_days=90, accepted_measurements=['suite-v1'], accepted_authorities=['CLIENT_REPORTED'])


def test_review_report_distinguishes_fixture_labels_and_reports_mismatches():
    case = Case(id='example', as_of=NOW, observations=[], expected_overall='DEMONSTRATED_IN_PRACTICE')
    report = evaluate_fixtures(policy(), FixtureSet(cases=[case]))
    assert report['mismatch_count'] == 1 and report['reviewed_case_count'] == 0
    assert report['release_authorized'] is False
    with pytest.raises(ValueError): Case(id='unattributed', as_of=NOW, label_status='REVIEWED_CASE')


def test_authored_examples_are_valid_unapproved_and_do_not_access_app_state():
    selected = CandidatePolicy.model_validate_json(Path('docs/architecture/readiness-policy.candidate.json').read_bytes())
    fixtures = FixtureSet.model_validate_json(Path('docs/architecture/readiness-review.fixtures.example.json').read_bytes())
    report = evaluate_fixtures(selected, fixtures)
    assert report['mismatch_count'] == 0 and report['reviewed_case_count'] == 0
    assert report['release_authorized'] is False
    raw = json.loads(selected.model_dump_json()); raw['schema_version'] = True
    with pytest.raises(ValueError): CandidatePolicy.model_validate(raw)


def test_cli_redacts_invalid_input_and_does_not_treat_a_parse_failure_as_a_grade(tmp_path, monkeypatch, capsys):
    from scripts.evaluate_readiness_policy import main
    private = tmp_path / 'bad.json'
    private.write_text('{"secret":"private-fixture-content"}')
    monkeypatch.setattr('sys.argv', ['evaluate', '--policy', str(private), '--fixtures', str(private)])
    assert main() == 2
    output = capsys.readouterr().out
    assert 'private-fixture-content' not in output and 'candidate_overall' not in output
