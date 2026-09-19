from datetime import datetime, timezone
import json

import pytest

from app.services.readiness_policy_review import CandidatePolicy, Rule, Case, FixtureSet, evaluate_fixtures
from app.services.readiness_reviewer_comparison import ReviewerBatch, compare_reviewers


def inputs():
    policy = CandidatePolicy(role_id='GENERAL_SWE', version='candidate-v1', rules=[Rule(
        capability='communication', minimum_demonstrations=1, minimum_task_families=1,
        freshness_days=90, accepted_measurements=['candidate-rubric'], accepted_authorities=['QUALIFIED_RUBRIC_REVIEW'])])
    fixtures = FixtureSet(cases=[Case(id=f'private-case-{index}', as_of=datetime(2026, 9, 15, tzinfo=timezone.utc)) for index in range(2)])
    candidate = evaluate_fixtures(policy, fixtures)
    return policy, fixtures, candidate


def annotation(candidate, reviewer='private-reviewer-a', case=0, rubric='private-rubric-v1', **changes):
    return {'case_id': candidate['cases'][case]['case_id'],
        'input_sha256': candidate['cases'][case]['candidate']['input_sha256'],
        'reviewer_reference': reviewer, 'rubric_reference': rubric,
        'rows': {'communication': 'NOT_MEASURED'}, **changes}


def compare(*annotations):
    policy, fixtures, candidate = inputs()
    batch = ReviewerBatch.model_validate({'policy_sha256': candidate['policy_sha256'], 'annotations': list(annotations)})
    return compare_reviewers(policy, fixtures, batch)


def test_missing_labels_are_absent_comparisons_and_single_review_does_not_claim_agreement():
    _, _, candidate = inputs()
    result = compare(annotation(candidate))
    row, overall = result['rubrics'][0]['scopes']
    assert row['labeled_cases'] == row['unlabeled_cases'] == row['single_reviewer_cases'] == 1
    assert row['candidate_label_comparisons'] == row['candidate_label_matches'] == 1
    assert row['reviewer_pair_comparisons'] == row['multiple_reviewer_cases'] == 0
    assert row['reviewer_pair_agreement_fraction'] is None
    assert overall['labeled_cases'] == overall['candidate_label_comparisons'] == 0
    assert overall['unlabeled_cases'] == 2 and overall['reviewer_pair_agreement_fraction'] is None
    for key in ('reviewer_identity_verified', 'review_independence_verified', 'consent_verified', 'assessment_qualified', 'release_authorized'):
        assert result[key] is False


def test_three_reviewers_count_unordered_pairs_and_preserve_disagreement():
    _, _, candidate = inputs()
    result = compare(annotation(candidate), annotation(candidate, reviewer='b'),
        annotation(candidate, reviewer='c', rows={'communication': 'DEVELOPING'}))
    row = result['rubrics'][0]['scopes'][0]
    assert row['multiple_reviewer_cases'] == row['disagreement_cases'] == 1
    assert row['unanimous_cases'] == 0
    assert row['reviewer_pair_comparisons'] == 3 and row['reviewer_pair_agreements'] == 1
    assert row['reviewer_pair_disagreements'] == 2 and row['reviewer_pair_agreement_fraction'] == pytest.approx(1/3)
    assert row['candidate_label_matches'] == 2 and row['candidate_label_disagreements'] == 1
    assert row['label_comparison_counts'] == [
        {'supplied_label': 'DEVELOPING', 'candidate_label': 'NOT_MEASURED', 'count': 1},
        {'supplied_label': 'NOT_MEASURED', 'candidate_label': 'NOT_MEASURED', 'count': 2}]
    assert 'consensus' not in row  # No majority vote becomes an adjudicated label.


def test_different_cases_and_rubric_versions_never_form_reviewer_pairs():
    _, _, candidate = inputs()
    result = compare(annotation(candidate), annotation(candidate, reviewer='b', case=1),
        annotation(candidate, reviewer='c', rubric='other-rubric'))
    assert len(result['rubrics']) == 2
    assert all(scope['reviewer_pair_comparisons'] == 0 for rubric in result['rubrics'] for scope in rubric['scopes'])


def test_overall_and_rows_have_independent_label_denominators():
    _, _, candidate = inputs()
    result = compare(annotation(candidate, overall='MORE_EVIDENCE_NEEDED'),
        annotation(candidate, reviewer='b', rows={}, overall='MORE_EVIDENCE_NEEDED'))
    row, overall = result['rubrics'][0]['scopes']
    assert row['single_reviewer_cases'] == 1 and row['reviewer_pair_comparisons'] == 0
    assert overall['unanimous_cases'] == overall['reviewer_pair_comparisons'] == 1
    assert overall['reviewer_pair_agreement_fraction'] == 1


def test_review_order_does_not_change_hash_or_summary_and_private_references_are_not_echoed():
    _, _, candidate = inputs()
    first, second = annotation(candidate), annotation(candidate, reviewer='private-reviewer-b')
    forward = compare(first, second)
    assert forward == compare(second, first)
    encoded = json.dumps(forward)
    assert 'private-case' not in encoded and 'private-reviewer' not in encoded and 'private-rubric' not in encoded


@pytest.mark.parametrize('change', [
    {'case_id': 'not-in-this-fixture'}, {'input_sha256': '0'*64}, {'rows': {'correctness': 'NOT_MEASURED'}}])
def test_changed_or_unknown_case_inputs_and_capabilities_are_rejected(change):
    _, _, candidate = inputs()
    with pytest.raises(ValueError): compare(annotation(candidate, **change))


def test_policy_drift_and_duplicate_reviews_cannot_inflate_agreement():
    policy, fixtures, candidate = inputs()
    record = annotation(candidate)
    with pytest.raises(ValueError):
        ReviewerBatch.model_validate({'policy_sha256': candidate['policy_sha256'], 'annotations': [record, record]})
    batch = ReviewerBatch.model_validate({'policy_sha256': '0'*64, 'annotations': [record]})
    with pytest.raises(ValueError): compare_reviewers(policy, fixtures, batch)
    for changes in ({'rows': {}, 'overall': None}, {'reviewer_reference': 'full name'}, {'source_code': 'private'}):
        with pytest.raises(ValueError): compare({**record, **changes})


def test_cli_comparison_only_is_private_and_disagreements_are_nonzero(tmp_path, monkeypatch, capsys):
    from scripts.evaluate_readiness_policy import main
    policy, fixtures, candidate = inputs()
    policy_file, fixture_file, reviews_file = [tmp_path / name for name in ('policy.json', 'fixtures.json', 'reviews.json')]
    policy_file.write_text(policy.model_dump_json())
    fixture_file.write_text(fixtures.model_dump_json())
    reviews_file.write_text(json.dumps({'policy_sha256': candidate['policy_sha256'], 'annotations': [
        annotation(candidate), annotation(candidate, reviewer='b', rows={'communication': 'DEVELOPING'})]}))
    monkeypatch.setattr('sys.argv', ['review', '--policy', str(policy_file), '--fixtures', str(fixture_file),
        '--reviews', str(reviews_file), '--comparison-only'])
    assert main() == 1
    output = capsys.readouterr().out
    assert 'private-case' not in output and 'private-reviewer' not in output
    assert json.loads(output)['mode'] == 'OFFLINE_REVIEW_COMPARISON'
    # Comparison-only exit status concerns the emitted annotation comparison,
    # not separate legacy fixture labels that are absent from this output.
    fixture_json = json.loads(fixtures.model_dump_json())
    fixture_json['cases'][0]['expected_overall'] = 'DEVELOPING'
    fixture_file.write_text(json.dumps(fixture_json))
    reviews_file.write_text(json.dumps({'policy_sha256': candidate['policy_sha256'],
        'annotations': [annotation(candidate), annotation(candidate, reviewer='b')]}))
    assert main() == 0
    assert json.loads(capsys.readouterr().out)['assessment_qualified'] is False
    reviews_file.write_text('{"private-secret":"invalid"}')
    assert main() == 2
    assert 'private-secret' not in capsys.readouterr().out


def test_comparison_flag_requires_annotations_and_schema_version_is_strict(monkeypatch, capsys):
    from scripts.evaluate_readiness_policy import main
    monkeypatch.setattr('sys.argv', ['review', '--policy', 'unused', '--fixtures', 'unused', '--comparison-only'])
    assert main() == 2
    assert json.loads(capsys.readouterr().out)['release_authorized'] is False
    _, _, candidate = inputs()
    with pytest.raises(ValueError): ReviewerBatch.model_validate({'schema_version': True,
        'policy_sha256': candidate['policy_sha256'], 'annotations': [annotation(candidate)]})


def test_bundled_reviewer_example_remains_synthetic_and_unqualified():
    from pathlib import Path
    policy = CandidatePolicy.model_validate_json(Path('docs/architecture/readiness-policy.candidate.json').read_bytes())
    fixtures = FixtureSet.model_validate_json(Path('docs/architecture/readiness-review.fixtures.example.json').read_bytes())
    batch = ReviewerBatch.model_validate_json(Path('docs/architecture/readiness-reviewer-annotations.example.json').read_bytes())
    result = compare_reviewers(policy, fixtures, batch)
    assert all(case.label_status == 'AUTHOR_FIXTURE' for case in fixtures.cases)
    assert all(item.reviewer_reference.startswith('synthetic-example-') for item in batch.annotations)
    assert not result['assessment_qualified'] and not result['reviewer_identity_verified']
