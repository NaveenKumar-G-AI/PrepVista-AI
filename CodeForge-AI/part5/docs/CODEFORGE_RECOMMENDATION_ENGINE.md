# Recommendation Engine

## The orchestrator

`RecommendationService.generateRecommendation` (`src/recommendation/recommendationService.ts`) is the single place that implements the Phase 42 pipeline. It is intentionally one orchestrator calling many small, independently-testable modules — not one API route with all the logic inlined:

```
getStudentState()        → MasteryStateService.getAllStates
identifyGaps()            → gapDetector + PrerequisiteAnalyzer, merged and de-duplicated
checkPrerequisites()      → PrerequisiteAnalyzer.analyze (redirects the target to a weak prerequisite)
selectTarget()             → priority cascade: due review > near-mastery > targeted repetition > exploration roll > top gap
difficultyDecision()       → difficultyEngine.decideDifficulty
retrieveCandidates()      → CandidateRetrieval.retrieve
rankCandidates()           → rankingEngine.rankCandidates
selectIntervention()      → interventionSelector.selectIntervention
generateReason()           → objectiveExplanation.buildDeterministicObjective / buildDeterministicExplanation (+ optional AI polish)
persistRecommendation()   → INSERT into recommendations, with a frozen evidence_snapshot
```

## Target selection priority

Each recommendation targets exactly one skill, chosen by this cascade (first match wins):

1. **Due spaced review** — a skill whose `next_review_at` has passed.
2. **Near-mastery, unverified** — score ≥ 85 with sufficient evidence but no independent verification pass yet → triggers `MASTERY_VERIFICATION`.
3. **Targeted repetition** — the same `mistakeCategory` recurring in ≥ 60% of the last 3 attempts on a skill (Phase 23) → re-serves a challenge aimed at that exact pattern, never repetition-penalized.
4. **Exploration roll** — 15% of the time (configurable), *even when real gaps exist*, the engine deliberately probes a skill with zero evidence instead of only ever practicing known weaknesses (Phase 20/21). Only **content-bearing** skills (ones with at least one real challenge tagged to them) are eligible — grouping nodes like "Python" or "Algorithms" are never picked, since no challenge exists for them directly (this was a real bug caught by an integration test — see `CODEFORGE_FINAL_REPORT.md`).
5. **Highest-severity real gap** — from `identifyGaps()`.

## Gap detection → prerequisite redirect

`identifyGaps()` calls `PrerequisiteAnalyzer.analyze()` for every skill with evidence *before* falling back to `gapDetector.detectGap()`. If a skill's foundation is shaky, the analyzer **redirects the entire recommendation to the prerequisite itself** — not just a label change. This was a real bug during development: an earlier version correctly *detected* `PREREQUISITE_GAP` but kept recommending a challenge for the original (dependent) skill, contradicting its own stated reasoning. The fix makes `PrerequisiteAnalyzer.analyze()` return the prerequisite's own skill id as the assessment's `skillId`, so candidate retrieval and ranking genuinely target the foundation. See `tests/unit/prerequisite.test.ts` for the exact Phase 12 scenario (weak Queues blocks Graph Algorithms) and the real demo transcript in `CODEFORGE_FINAL_REPORT.md` for the corrected behavior end-to-end.

## Candidate ranking

`rankingEngine.scoreCandidate` computes 11 named, inspectable signals per candidate (each 0–1, `repetitionPenalty` subtracted), combined via the configurable weight vector in `config.ranking.weights`:

`skillGap`, `prerequisiteFit`, `difficultyFit`, `roleRelevance`, `goalRelevance`, `learningValue`, `freshness`, `diversity`, `mistakeRelevance`, `retentionValue`, `repetitionPenalty`.

Every candidate's full breakdown is stored in the persisted recommendation's `evidence_snapshot_json` — nothing about the ranking is a black box, and none of it is delegated to an LLM (Phase 19).

## Intervention selection (12 types, not just "another problem")

`interventionSelector.selectIntervention` maps the target/gap context to one of `DIRECT_PRACTICE`, `PREREQUISITE_REVIEW`, `BRIDGE_CHALLENGE`, `DEBUGGING_CHALLENGE`, `CONCEPT_APPLICATION`, `TRANSFER_CHALLENGE`, `COMPLEXITY_CHALLENGE`, `MASTERY_VERIFICATION`, `SPACED_REVIEW`, `EXPLORATION`, `ROLE_SPECIFIC_PRACTICE`, `INTERVIEW_STYLE_CHALLENGE` — via a priority cascade (review/verification/exploration/repetition outrank routine gap-type mapping), all real code, no LLM call.

## Explanation and objective generation

`objectiveExplanation.ts` builds both strings deterministically from the *actual* gap explanation and recent evidence (counts, mistake categories, independence) — never a generic template. An optional AI polish pass (`polishObjectiveWithAI`) can rewrite the *wording* of the objective; it never originates the underlying claim, and if the AI provider is unavailable the deterministic text is used verbatim (see `CODEFORGE_MASTERY_MODEL.md`... actually see `CODEFORGE_FINAL_REPORT.md`'s AI section, and `tests/integration/aiFallback.test.ts` for a real, non-mocked test of this fallback).

## Traceability (Phase 44)

Every persisted `recommendation` row stores `gap_type`, `intervention_type`, `learning_objective`, `reason`, `ranking_score`, and a full `evidence_snapshot_json` (the skill state, difficulty decision, candidate count, winning score breakdown, and the last 5 evidence rows considered). `GET /api/recommendations/next` returns this snapshot to the client, so "why was this recommended?" always has a real, inspectable answer.
