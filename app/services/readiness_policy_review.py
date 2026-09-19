"""Offline role-policy review. Never authorizes publication or student grading.

Inputs are review fixtures, not authenticated evidence receipts. A syntactically
valid fixture may still contain false claims; this tool cannot upgrade its trust.
"""
from collections import Counter, defaultdict
from datetime import datetime
from hashlib import sha256
import json
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator, field_validator

Capability = Literal['reasoning', 'correctness', 'debugging', 'ownership', 'communication', 'interview']
Authority = Literal['CLIENT_REPORTED', 'INTERVIEW_TEXT_SIGNAL', 'ISOLATED_SERVER_TEST', 'QUALIFIED_RUBRIC_REVIEW']
RowState = Literal['NOT_MEASURED', 'INSUFFICIENT_EVIDENCE', 'DEVELOPING', 'DEMONSTRATED_IN_PRACTICE', 'REVIEW_NEEDED']
Overall = Literal['MORE_EVIDENCE_NEEDED', 'DEVELOPING', 'REVIEW_NEEDED', 'DEMONSTRATED_IN_PRACTICE']


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True, strict=True)

    @field_validator('as_of', 'observed_at', mode='before', check_fields=False)
    @classmethod
    def parse_iso_time(cls, value):
        # Keep strict primitive validation while accepting explicit ISO dates in
        # JSON review files. Numeric timestamps and naive dates remain invalid.
        return datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value

    @model_validator(mode='before')
    @classmethod
    def exact_schema_version(cls, value):
        if isinstance(value, dict) and 'schema_version' in value and type(value['schema_version']) is not int:
            raise ValueError('Schema version must be an integer')
        return value


class Rule(Strict):
    capability: Capability
    required: bool = True
    minimum_demonstrations: int = Field(ge=1, le=20, strict=True)
    minimum_task_families: int = Field(ge=1, le=20, strict=True)
    freshness_days: int = Field(ge=1, le=730, strict=True)
    accepted_measurements: list[str] = Field(min_length=1, max_length=30)
    accepted_authorities: list[Literal['ISOLATED_SERVER_TEST', 'QUALIFIED_RUBRIC_REVIEW']] = Field(min_length=1, max_length=2)
    accepted_execution_languages: list[Literal['javascript', 'python', 'java', 'cpp']] = Field(default_factory=list, max_length=4)

    @model_validator(mode='after')
    def consistent(self):
        if self.minimum_task_families > self.minimum_demonstrations:
            raise ValueError('Task diversity cannot exceed the declared demonstration minimum')
        if self.capability != 'correctness' and 'ISOLATED_SERVER_TEST' in self.accepted_authorities:
            raise ValueError('Execution cannot establish other capabilities')
        if self.capability == 'correctness' and not self.accepted_execution_languages:
            raise ValueError('A correctness policy must declare its language coverage')
        if any(not isinstance(value, str) or not value or len(value) > 120 for value in self.accepted_measurements):
            raise ValueError('Invalid measurement reference')
        return self


class CandidatePolicy(Strict):
    schema_version: Literal[1] = 1
    role_id: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=120)
    review_status: Literal['DRAFT', 'IN_REVIEW'] = 'DRAFT'
    rules: list[Rule] = Field(min_length=1, max_length=6)

    @model_validator(mode='after')
    def unique_rules(self):
        if len({r.capability for r in self.rules}) != len(self.rules) or not any(r.required for r in self.rules):
            raise ValueError('A policy needs unique capabilities and a required capability')
        return self


class Observation(Strict):
    id: str = Field(min_length=1, max_length=120)
    role_id: str = Field(min_length=1, max_length=120)
    capability: Capability
    authority: Authority
    measurement_id: str = Field(min_length=1, max_length=120)
    task_family: str = Field(min_length=1, max_length=120)
    correlation_id: str = Field(min_length=1, max_length=120)
    comparison_id: str | None = Field(default=None, max_length=120)
    observed_at: AwareDatetime
    time_authority: Literal['SERVER_RECEIPT_TIME', 'CLIENT_CLAIMED']
    availability: Literal['AVAILABLE', 'UNAVAILABLE', 'UNSUPPORTED']
    assistance: Literal['UNKNOWN', 'KNOWN_ASSISTED'] = 'UNKNOWN'
    outcome: Literal['DEMONSTRATED', 'GAP', 'INCONCLUSIVE']
    execution_language: Literal['javascript', 'python', 'java', 'cpp'] | None = None

    @model_validator(mode='after')
    def authority_scope(self):
        if self.authority == 'ISOLATED_SERVER_TEST' and self.capability != 'correctness':
            raise ValueError('A server execution result only covers declared correctness checks')
        if self.authority == 'ISOLATED_SERVER_TEST' and self.execution_language is None:
            raise ValueError('A server result must identify its execution language')
        return self


class Case(Strict):
    id: str = Field(min_length=1, max_length=120)
    as_of: AwareDatetime
    observations: list[Observation] = Field(default_factory=list, max_length=500)
    label_status: Literal['AUTHOR_FIXTURE', 'REVIEWED_CASE'] = 'AUTHOR_FIXTURE'
    review_reference: str | None = Field(default=None, max_length=120)
    expected_rows: dict[Capability, RowState] = Field(default_factory=dict)
    expected_overall: Overall | None = None

    @model_validator(mode='after')
    def review_reference_required(self):
        if self.label_status == 'REVIEWED_CASE' and not self.review_reference:
            raise ValueError('Reviewed cases require a traceable review reference')
        return self


class FixtureSet(Strict):
    schema_version: Literal[1] = 1
    cases: list[Case] = Field(min_length=1, max_length=1000)

    @model_validator(mode='after')
    def unique_cases(self):
        if len({c.id for c in self.cases}) != len(self.cases):
            raise ValueError('Case IDs must be unique')
        return self


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def project_candidate(policy: CandidatePolicy, case: Case):
    observations = {}
    for observation in case.observations:
        if observation.id in observations and observations[observation.id] != observation:
            raise ValueError('Conflicting records share an observation ID')
        observations[observation.id] = observation
    values = sorted(observations.values(), key=lambda item: item.id)
    rows = []
    for rule in policy.rules:
        measured = [item for item in values if item.capability == rule.capability]
        excluded = Counter()
        eligible = []
        for item in measured:
            reason = None
            age_days = (case.as_of - item.observed_at).total_seconds() / 86400
            if item.role_id != policy.role_id: reason = 'ROLE_MISMATCH'
            elif item.availability != 'AVAILABLE': reason = item.availability
            elif item.authority not in rule.accepted_authorities: reason = 'PRACTICE_SIGNAL_ONLY'
            elif item.measurement_id not in rule.accepted_measurements: reason = 'MEASUREMENT_NOT_ACCEPTED'
            elif rule.accepted_execution_languages and item.execution_language not in rule.accepted_execution_languages: reason = 'LANGUAGE_NOT_ACCEPTED'
            elif item.time_authority != 'SERVER_RECEIPT_TIME': reason = 'UNTRUSTED_TIME'
            elif age_days < 0: reason = 'FUTURE_TIME'
            elif age_days > rule.freshness_days: reason = 'STALE'
            elif item.outcome == 'INCONCLUSIVE': reason = 'INCONCLUSIVE'
            if reason: excluded[reason] += 1
            else: eligible.append(item)
        groups = defaultdict(list)
        comparisons = defaultdict(set)
        for item in eligible:
            groups[item.correlation_id].append(item)
            if item.comparison_id:
                comparisons[(item.measurement_id, item.comparison_id)].add(item.outcome)
        inconsistent_metadata = any(len({item.task_family for item in group}) != 1 for group in groups.values())
        conflicting = any(outcomes == {'DEMONSTRATED', 'GAP'} for outcomes in comparisons.values())
        families = {group[0].task_family for group in groups.values() if len({item.task_family for item in group}) == 1}
        coverage_met = (not inconsistent_metadata and len(groups) >= rule.minimum_demonstrations
                        and len(families) >= rule.minimum_task_families)
        gap = any(item.outcome == 'GAP' for item in eligible)
        if inconsistent_metadata or conflicting:
            state = 'REVIEW_NEEDED'
        elif gap:
            state = 'DEVELOPING'
        elif coverage_met:
            state = 'DEMONSTRATED_IN_PRACTICE'
        elif measured:
            state = 'INSUFFICIENT_EVIDENCE'
        else:
            state = 'NOT_MEASURED'
        rows.append({'capability': rule.capability, 'required': rule.required, 'candidate_state': state,
            'coverage_met': coverage_met, 'demonstrations': len(groups), 'task_families': len(families),
            'excluded': dict(sorted(excluded.items())), 'eligible_source_ids': [item.id for item in eligible],
            'confidence': 'NOT_CALIBRATED', 'independence': 'NOT_ESTABLISHED',
            'review_reasons': (['CORRELATION_METADATA_CONFLICT'] if inconsistent_metadata else []) + (['COMPARABLE_OUTCOMES_CONFLICT'] if conflicting else [])})
    required = [row for row in rows if row['required']]
    overall = ('MORE_EVIDENCE_NEEDED' if any(not row['coverage_met'] for row in required)
        else 'REVIEW_NEEDED' if any(row['candidate_state'] == 'REVIEW_NEEDED' for row in required)
        else 'DEVELOPING' if any(row['candidate_state'] == 'DEVELOPING' for row in required)
        else 'DEMONSTRATED_IN_PRACTICE')
    inputs = {'policy': policy.model_dump(mode='json'), 'as_of': case.as_of.isoformat(),
              'observations': [value.model_dump(mode='json') for value in values]}
    return {'mode': 'SHADOW_ONLY', 'release_authorized': False, 'role_id': policy.role_id,
        'policy_version': policy.version, 'review_status': policy.review_status,
        'candidate_overall': overall, 'rows': rows,
        'input_sha256': sha256(_canonical(inputs).encode()).hexdigest(),
        'notice': 'Fixture analysis only. Thresholds, input trust and labels require independent review. No student readiness, hiring or unaided-performance claim is authorized.'}


def evaluate_fixtures(policy: CandidatePolicy, fixtures: FixtureSet):
    results = []
    for case in fixtures.cases:
        candidate = project_candidate(policy, case)
        rows = {row['capability']: row['candidate_state'] for row in candidate['rows']}
        differences = [{'capability': key, 'expected': expected, 'actual': rows.get(key, 'RULE_MISSING')}
            for key, expected in case.expected_rows.items() if rows.get(key) != expected]
        if case.expected_overall is not None and candidate['candidate_overall'] != case.expected_overall:
            differences.append({'capability': 'overall', 'expected': case.expected_overall, 'actual': candidate['candidate_overall']})
        results.append({'case_id': case.id, 'label_status': case.label_status, 'review_reference': case.review_reference,
            'has_expected_labels': bool(case.expected_rows or case.expected_overall),
            'differences': differences, 'candidate': candidate})
    return {'schema_version': 1, 'mode': 'SHADOW_ONLY', 'release_authorized': False,
        'policy_sha256': sha256(_canonical(policy.model_dump(mode='json')).encode()).hexdigest(),
        'case_count': len(results), 'reviewed_case_count': sum(c.label_status == 'REVIEWED_CASE' for c in fixtures.cases),
        'mismatch_count': sum(bool(row['differences']) for row in results), 'cases': results}
