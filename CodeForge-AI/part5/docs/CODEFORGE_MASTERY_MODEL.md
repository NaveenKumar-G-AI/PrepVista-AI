# Mastery Model

This document describes the actual formulas implemented in `src/mastery/estimators.ts` and `src/mastery/masteryStateService.ts`. Every constant referenced below lives in `src/config/index.ts` — nothing here is hardcoded in the estimator functions themselves.

## Why not `mastery = average(score)`

A naive average treats every attempt as equally informative, which fails in obvious ways: a pass on an easy problem with the solution visible should not count the same as an independent pass on a hard one; evidence from three weeks ago shouldn't outweigh evidence from today; and one lucky pass shouldn't read the same as five consistent ones. The estimator below is a **weighted** average plus two corrections, followed by a **state gate** that requires more than a good score to reach the higher mastery states.

## Step 0 — filter language-noise evidence

Before anything else, evidence where `languageIssue = true` (a pure syntax/load error — the code never ran) is excluded from mastery, confidence, and trend computation (`filterAlgorithmicEvidence` in `estimators.ts`). Such an attempt carries zero information about algorithmic understanding — the test literally could not run. It remains in the historical `evidence` table (nothing is ever deleted), it just doesn't move the algorithmic mastery needle. This is what keeps a student who knows binary search but keeps mistyping Python syntax from reading as algorithmically weak (see `CODEFORGE_FINAL_REPORT.md` for how a test caught this exact bug during development).

## Step 1 — per-evidence weight

For each remaining piece of evidence `e`:

```
weight(e) = difficultyWeight(e) × independenceWeight(e) × recencyWeight(e)
```

- **`difficultyWeight`** — linear map from the challenge's 1–10 `difficultyScore` to `[0.7, 1.5]`. A pass on a difficulty-10 challenge counts about twice as much as a pass on a difficulty-1 challenge.
- **`independenceWeight`** — `{ NONE: 1.0, HINT: 0.75, SOLUTION_VIEWED: 0.4 }`, keyed by the real `assistanceUsed` value recorded on the evidence (not a collapsed boolean — see the note below).
- **`recencyWeight`** — exponential decay, `0.5 ^ (ageInDays / 21)`. Evidence 21 days old counts half as much as fresh evidence; nothing is ever fully zeroed out, and nothing is deleted (Phase 9).

## Step 2 — weighted average

```
weightedAverage = Σ(rawScore(e) × weight(e)) / Σ(weight(e))
```

where `rawScore(e) = testsPassed / testsTotal` for that attempt (partial credit, not just pass/fail).

## Step 3 — repeated-mistake penalty

If the same `mistakeCategory` appears in ≥ 60% of the last 3 pieces of evidence (both configurable), a `× 0.85` penalty is applied. This is what lets the score reflect "still making the same mistake" even when the raw pass rate looks okay.

## Step 4 — prerequisite cap

If this skill has a direct prerequisite whose own current `mastery_score` is below 35 (configurable), the resulting score is capped at 55 (configurable), regardless of how good the raw evidence looks. This directly implements Phase 12: a skill cannot read as solid while its foundation is shaky.

## Step 5 — final score

```
masteryScore = round(cappedScore × 100, 1 decimal)   // 0–100
```

### Worked example

Student has 2 pieces of evidence on Arrays: a failed easy attempt (`difficultyScore=1`, independent) and a passed hard attempt (`difficultyScore=10`, independent), both fresh:

- `weight(fail) ≈ 0.7`, `weight(pass) ≈ 1.5`
- `weightedAverage = (0×0.7 + 1×1.5) / (0.7+1.5) ≈ 0.68` → **68/100**, not 50 — the harder, more recent success is trusted more than the easy failure. This exact property is asserted in `tests/unit/mastery.test.ts`.

## Confidence (separate from mastery)

Confidence answers "how much do we trust this score?", not "how good is it?". `computeConfidence` combines four components (weights in `config.confidence.weights`):

- **Volume** — evidence count vs. a target of 6, saturating at 1.
- **Diversity** — distinct challenges attempted (target 4) and distinct difficulty buckets touched.
- **Independence** — fraction of successes that were unassisted.
- **Recency spread** — whether evidence is spread over time vs. crammed into one sitting.

If `detectContradiction` (below) flags the evidence as inconsistent, confidence is further multiplied by 0.7. **A single successful attempt produces a high mastery score but a low confidence score** — this is the "Hash Maps: Mastery STRONG, Confidence LOW" example from the spec, and it's a real, tested property (`tests/unit/mastery.test.ts`), not a hardcoded pair of numbers.

## Trend

`computeTrend` fits a linear regression slope over the last 6 (raw, recency-ordered) scores and classifies:

- `slope ≥ +0.05` → `IMPROVING`
- `slope ≤ −0.05` → `DECLINING`
- high variance with a near-zero slope → `INCONSISTENT`
- otherwise → `STABLE`
- fewer than 3 points → `INSUFFICIENT_DATA`

The spec's own worked example — scores of 3/10, 5/10, 6/10, 8/10, 9/10 — is tested verbatim in `tests/unit/trend.test.ts` and produces `IMPROVING` (slope ≈ 0.15).

## Contradiction detection

`detectContradiction` looks for an easier attempt that failed while a harder attempt (under comparable independence/context conditions) succeeded, with a difficulty gap ≥ 2.5. When found, `contradiction_flag` is set on the skill state and confidence is penalized — the system does not silently average away the inconsistency (Phase 10).

## Mastery states and gating (the "can a lucky attempt fake mastery?" question)

`deriveMasteryState` (`masteryStateService.ts`) maps `(score, evidenceCount, independentSuccessCount, confidence, distinctChallenges, distinctDifficultyLevels, verified)` to one of `UNKNOWN → INTRODUCED → EXPLORING → DEVELOPING → COMPETENT → STRONG → ADVANCED → MASTERED`. Score alone only gets you as far as `DEVELOPING`; everything above that requires additional gates:

| State | Score floor | Additional requirements |
|---|---|---|
| COMPETENT | 55 | ≥ 3 evidence |
| STRONG | 70 | ≥ 4 evidence, ≥ 2 independent successes |
| ADVANCED | 85 | ≥ 5 evidence, ≥ 3 independent successes, confidence ≥ 70, ≥ 2 distinct difficulty levels |
| MASTERED | 93 | ≥ 6 evidence, ≥ 4 independent successes, confidence ≥ 85, ≥ 3 distinct challenges, **and an independently-passed unseen verification challenge** |

A single independent pass (score 100, evidence count 1) lands at `DEVELOPING` — never higher, regardless of how clean the pass was. This is directly tested in `tests/unit/mastery.test.ts` (`'a single lucky pass cannot alone reach MASTERED or STRONG state'`), including a version of the test that generously assumes 100% confidence to make sure the *count/diversity* gates — not just the confidence gate — are what's actually doing the blocking.
