"""Compare explicit offline review annotations. No authentication or publication.

Distinct submitted reviewer references do not establish distinct people or
independent review. Hashes bind content, not source authority or consent.
"""
from collections import Counter, defaultdict
from hashlib import sha256

from pydantic import Field, model_validator

from app.services.readiness_policy_review import (
    Capability, Overall, RowState, Strict, CandidatePolicy, FixtureSet,
    _canonical, project_candidate,
)


class ReviewerAnnotation(Strict):
    case_id: str = Field(min_length=1, max_length=120)
    input_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    reviewer_reference: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')
    rubric_reference: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')
    rows: dict[Capability, RowState] = Field(default_factory=dict)
    overall: Overall | None = None

    @model_validator(mode='after')
    def needs_a_label(self):
        if not self.rows and self.overall is None:
            raise ValueError('A review annotation needs at least one label')
        return self


class ReviewerBatch(Strict):
    schema_version: int = Field(default=1, ge=1, le=1)
    policy_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    annotations: list[ReviewerAnnotation] = Field(min_length=1, max_length=10000)

    @model_validator(mode='after')
    def unique_reviews(self):
        keys = [(item.case_id, item.reviewer_reference, item.rubric_reference) for item in self.annotations]
        if len(set(keys)) != len(keys):
            raise ValueError('One annotation per reviewer, case and rubric is required')
        return self


def compare_reviewers(policy: CandidatePolicy, fixtures: FixtureSet, batch: ReviewerBatch):
    policy_hash = sha256(_canonical(policy.model_dump(mode='json')).encode()).hexdigest()
    if batch.policy_sha256 != policy_hash:
        raise ValueError('Review policy has changed')
    candidates = {case.id: project_candidate(policy, case) for case in fixtures.cases}
    capabilities = sorted(rule.capability for rule in policy.rules)
    by_rubric = defaultdict(list)
    for item in batch.annotations:
        candidate = candidates.get(item.case_id)
        if candidate is None or candidate['input_sha256'] != item.input_sha256:
            raise ValueError('Review case is missing or changed')
        if set(item.rows) - set(capabilities):
            raise ValueError('Annotation labels a capability outside the policy')
        by_rubric[item.rubric_reference].append(item)

    rubric_reports = []
    for rubric, annotations in sorted(by_rubric.items()):
        scopes = []
        for capability in [*capabilities, 'overall']:
            labels = defaultdict(list)
            for item in annotations:
                label = item.overall if capability == 'overall' else item.rows.get(capability)
                if label is not None:
                    labels[item.case_id].append(label)
            pair_agreements = pair_count = candidate_matches = compared_labels = 0
            unanimous = disagreements = single = 0
            transitions = Counter()
            for case_id, supplied in labels.items():
                candidate = candidates[case_id]
                actual = candidate['candidate_overall'] if capability == 'overall' else next(
                    row['candidate_state'] for row in candidate['rows'] if row['capability'] == capability)
                # Each case/rubric/reviewer occurs once. An unlabeled capability
                # abstains and contributes neither a match nor a disagreement.
                compared_labels += len(supplied)
                candidate_matches += sum(label == actual for label in supplied)
                for label in supplied:
                    transitions[(label, actual)] += 1
                if len(supplied) == 1:
                    single += 1
                elif len(set(supplied)) == 1:
                    unanimous += 1
                else:
                    disagreements += 1
                # Count unordered pairs without a quadratic reviewer loop.
                pair_count += len(supplied) * (len(supplied) - 1) // 2
                pair_agreements += sum(count * (count - 1) // 2 for count in Counter(supplied).values())
            scopes.append({
                'capability': capability,
                'fixture_cases': len(candidates),
                'labeled_cases': len(labels),
                'unlabeled_cases': len(candidates) - len(labels),
                'single_reviewer_cases': single,
                'multiple_reviewer_cases': unanimous + disagreements,
                'unanimous_cases': unanimous,
                'disagreement_cases': disagreements,
                'candidate_label_comparisons': compared_labels,
                'candidate_label_matches': candidate_matches,
                'candidate_label_disagreements': compared_labels - candidate_matches,
                'reviewer_pair_comparisons': pair_count,
                'reviewer_pair_agreements': pair_agreements,
                'reviewer_pair_disagreements': pair_count - pair_agreements,
                'reviewer_pair_agreement_fraction': pair_agreements / pair_count if pair_count else None,
                'label_comparison_counts': [
                    {'supplied_label': label, 'candidate_label': actual, 'count': count}
                    for (label, actual), count in sorted(transitions.items())
                ],
            })
        rubric_reports.append({
            'rubric_sha256': sha256(rubric.encode()).hexdigest(),
            'submitted_reviewer_reference_count': len({item.reviewer_reference for item in annotations}),
            'annotation_count': len(annotations),
            'scopes': scopes,
        })

    canonical_annotations = sorted(
        (item.model_dump(mode='json') for item in batch.annotations),
        key=lambda item: (item['rubric_reference'], item['case_id'], item['reviewer_reference']))
    fixture_inputs = sorted((case_id, result['input_sha256']) for case_id, result in candidates.items())
    return {
        'schema_version': 1, 'comparison_version': 'reviewer-comparison-v1', 'mode': 'OFFLINE_REVIEW_COMPARISON',
        'policy_sha256': policy_hash,
        'review_inputs_sha256': sha256(_canonical({'policy_sha256': policy_hash,
            'fixture_inputs': fixture_inputs, 'annotations': canonical_annotations}).encode()).hexdigest(),
        'fixture_case_count': len(candidates), 'annotation_count': len(batch.annotations),
        'annotated_case_count': len({item.case_id for item in batch.annotations}),
        'rubrics': rubric_reports,
        'reviewer_identity_verified': False, 'review_independence_verified': False,
        'consent_verified': False, 'assessment_qualified': False, 'release_authorized': False,
        'notice': 'Private descriptive comparison of supplied annotations. No consensus label, calibrated accuracy, verified reviewer identity or policy approval is inferred.',
    }
