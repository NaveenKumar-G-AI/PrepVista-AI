# Skill Model

`app/services/skill_service.py`, tables `skill_assessments`, `skill_history`.

## Explicitly not a plain average

`recompute_skill(student_id, skill_id)` computes a weighted composite:

```
weight = strength_weight × confidence_weight × difficulty_weight × recency_weight
score  = Σ(is_positive_evidence × weight) / Σ(weight)
```

- `strength_weight`: LOW 0.3, MEDIUM 0.6, HIGH 1.0
- `confidence_weight`: LOW 0.4, MEDIUM 0.7, HIGH 1.0
- `difficulty_weight`: EASY 0.6, INTERMEDIATE 1.0, ADVANCED 1.4 (harder
  challenges count for more, both when passed and when failed)
- `recency_weight`: exponential half-life of 30 days
  (`0.5 ** (age_days / 30)`) — recent evidence dominates, but nothing is
  ever deleted (Phase 21); old rows just contribute less.

## Levels (Phase 20)

Score → level thresholds: `< 0.20` FOUNDATION, `< 0.40` DEVELOPING,
`< 0.60` COMPETENT, `< 0.80` STRONG, `>= 0.80` ADVANCED. A single passed
challenge cannot reach ADVANCED on its own under this weighting unless it
was a HIGH-strength, HIGH-confidence, ADVANCED-difficulty, very recent
pass — even then, one evidence row rarely clears 0.80 in practice.

## Contradictory evidence (Phase 22)

`recompute_skill` tracks whether both positive and negative evidence
weight are present. If so, and the resulting score sits in the ambiguous
0.35–0.65 band, `is_consistent` is set to `false` on the stored row
instead of quietly returning a confident-looking number. Callers (the API
response, a real UI) can surface "evidence is inconsistent" using this
flag rather than the system pretending certainty.

## Prerequisites (Phase 23)

`check_prerequisite_weakness(student_id, skill_id)` reads
`skill_prerequisites` (owned by the real CodeForge skill graph in a real
deployment; seeded minimally here) and reports any prerequisite skill
currently at FOUNDATION/DEVELOPING. It does not conclude the *advanced*
skill itself is the root cause — it surfaces the weak prerequisite as a
separate signal for `next_challenge_service` and the diagnosis output to
use.

## History (Phase 21)

Every recompute that follows an attempt also writes a `skill_history` row
(`triggering_attempt_id`, level, score, timestamp) — an append-only trail
independent of the current `skill_assessments` snapshot.
