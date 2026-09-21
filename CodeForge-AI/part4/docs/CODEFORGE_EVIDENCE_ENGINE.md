# Evidence Engine

`app/services/evidence_service.py`, table `evidence`.

## What produces evidence

| Source | When | Strength rule |
|---|---|---|
| `TEST_RESULTS` | Every non-SYSTEM_ERROR attempt | HIGH if all tests pass with zero hints (or ADVANCED difficulty regardless); MEDIUM otherwise |
| `CODE_ANALYSIS` | Each mistake surfaced by diagnosis | Mirrors the mistake's own confidence (LOW confidence mistake → LOW strength) |
| `HINT_USAGE` | hint_count > 0 | Always LOW strength (context, not a verdict) |
| `CHALLENGE_DIFFICULTY` | Every attempt | Always LOW strength (context marker for skill_service's weighting) |

`SYSTEM_ERROR` attempts produce **zero** evidence rows — infrastructure
failure is never treated as a signal about the student (enforced in
`main.py`: the handler returns before evidence generation runs at all).

## Evidence schema (matches the brief exactly)

```
evidence_id, student_id, attempt_id, challenge_id, challenge_version,
skill_id, subskill_id, evidence_type, observation, source, strength,
confidence, created_at
```

## Repeated-mistake → potential misconception (Phase 14)

`detect_repeated_mistakes(student_id, skill_id, category, attempt_id)`
queries `mistake_instances` for **distinct attempt_ids** with the same
category. A single attempt containing the same mistake logged twice does
NOT count twice — the query is `SELECT DISTINCT attempt_id`. Only at
3+ independent attempts does it write/update a row in
`potential_misconceptions`, with `confidence` escalating from MEDIUM (3-4
occurrences) to HIGH (5+). All supporting attempt IDs are retained in
`supporting_attempt_ids_json` for traceability.

This exact distinction (independent attempts vs. instances within one
attempt) is covered by
`tests/test_evidence_and_skill.py::test_repeated_mistake_detection_requires_at_least_three_independent_attempts`,
which failed against the first draft of the query (it originally didn't
enforce distinctness across attempts) — see `CODEFORGE_FINAL_REPORT.md`
for the bug log.

## Explanation evidence (Phase 16, now wired)

`evidence_service.build_explanation_evidence` turns an AI-evaluated
explanation into its own `EXPLANATION`-sourced evidence row (only when the
explanation service actually returned `AI_GENERATED` — a `PENDING` or
`NOT_APPLICABLE` explanation produces no evidence, since there's nothing
to evidence yet). Strength is capped at `MEDIUM` even for `HIGH`
conceptual understanding, and confidence is always `MEDIUM` — this is an
AI assessment of prose, not a deterministic fact, so it's deliberately
weighted lower than `TEST_RESULTS` evidence in the skill model.

## What's NOT implemented here

- `DEBUGGING` and `REPEATED_ATTEMPTS` as first-class evidence sources are
  representable in the schema but no service currently emits them.
