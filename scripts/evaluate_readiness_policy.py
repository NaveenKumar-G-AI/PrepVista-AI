"""Evaluate explicit local review fixtures. No database, app config or network.

Usage: python -m scripts.evaluate_readiness_policy --policy POLICY.json --fixtures CASES.json
Output is a shadow review artifact, never a production policy approval.
"""
import argparse
import json
from pathlib import Path
from app.services.readiness_policy_review import CandidatePolicy, FixtureSet, evaluate_fixtures


def read_json(path, model):
    with Path(path).open('rb') as source:
        raw = source.read(5_000_001)
    if len(raw) > 5_000_000:
        raise ValueError('Review input exceeds the size limit')
    return model.model_validate_json(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', required=True)
    parser.add_argument('--fixtures', required=True)
    parser.add_argument('--reviews', help='Optional private annotations bound to the policy and candidate input hashes.')
    parser.add_argument('--comparison-only', action='store_true', help='Emit aggregate review comparison without case/source/reviewer references; requires --reviews.')
    args = parser.parse_args()
    try:
        if args.comparison_only and not args.reviews:
            raise ValueError('Comparison requires review annotations')
        policy = read_json(args.policy, CandidatePolicy)
        fixtures = read_json(args.fixtures, FixtureSet)
        report = evaluate_fixtures(policy, fixtures)
        if args.reviews:
            from app.services.readiness_reviewer_comparison import ReviewerBatch, compare_reviewers
            report['review_comparison'] = compare_reviewers(policy, fixtures, read_json(args.reviews, ReviewerBatch))
    except (ValueError, OSError, TypeError):
        # Validation exceptions can echo input data; do not print them.
        print(json.dumps({'error': 'Invalid or unavailable bounded policy/fixture input', 'release_authorized': False}))
        return 2
    comparison = report.get('review_comparison')
    review_differences = bool(comparison and any(scope['candidate_label_disagreements'] or scope['disagreement_cases']
        for rubric in comparison['rubrics'] for scope in rubric['scopes']))
    print(json.dumps(comparison if args.comparison_only else report, ensure_ascii=False, indent=2))
    differences = review_differences if args.comparison_only else bool(report['mismatch_count'] or review_differences)
    return 1 if differences else 0


if __name__ == '__main__':
    raise SystemExit(main())
