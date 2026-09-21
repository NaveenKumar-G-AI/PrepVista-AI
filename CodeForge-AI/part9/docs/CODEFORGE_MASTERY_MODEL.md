# CodeForge Mastery Model

## States

`UNKNOWN → EXPOSED → LEARNING → DEVELOPING → FUNCTIONAL → STRONG → MASTERED`,
with `STALE` as a decay condition layered on top of `STRONG`/`MASTERED`.

The single most important rule (PHASE 6): **no evidence means `UNKNOWN`,
never a downgraded-to-weak state.** `calculateMastery([])` returns `UNKNOWN`
unconditionally — see `__tests__/masteryCalculation.test.ts`.

| State | Meaning | Example gate |
|---|---|---|
| UNKNOWN | No evidence at all | 0 evidence records |
| EXPOSED | Attempted, never passed | passes = 0 |
| LEARNING | Passed with guidance only | independent passes = 0, guided passes > 0 |
| DEVELOPING | Early or inconsistent independent success | < 2 independent passes, or a recent fail streak |
| FUNCTIONAL | Solid independent success, one difficulty band | ≥ 2 independent passes, < 2 distinct difficulties, no transfer |
| STRONG | Independent success across difficulty bands, or a transfer pass | see `domain/masteryCalculation.ts` |
| MASTERED | Independent + transfer + high-stakes evidence together | ≥ 4 independent passes AND ≥ 1 transfer AND ≥ 1 high-stakes (timed/interview/retention) |
| STALE | Was STRONG/MASTERED, no qualifying evidence inside the decay window | 60 days (STRONG) / 90 days (MASTERED), both configurable |

All thresholds live in one place: `src/domain/config.ts`. Nothing is
scattered as a magic number elsewhere in the codebase (PHASE 9).

## Confidence is separate from state

State answers "what can this student do?" Confidence answers "how much
should we trust that?" A skill can be `STRONG` with low confidence (thin,
recent-only evidence) or `DEVELOPING` with moderate confidence (a
consistent, if early, pattern). Confidence is a weighted blend of evidence
volume (diminishing returns), source diversity, recency, and consistency —
see `CONFIDENCE_WEIGHTS` in `config.ts`.

## Evidence weighting (PHASE 9)

Every piece of evidence is scored by three independent multipliers before
it contributes to the raw mastery score:

1. **Base quality** — what kind of evidence is this? Solution-viewed-then-passed
   scores far lower than an independent hard pass, which scores lower than
   a transfer pass or a timed-assessment pass.
2. **Recency** — evidence value halves every 45 days (configurable). It is
   never deleted, only discounted, which keeps history intact for
   explainability (PHASE 47).
3. **Repetition discount** — the k-th attempt at the *same* problem is
   worth `1/(1+k)` of a fresh attempt (floor 0.08). Twenty submissions of
   one problem are worth roughly 3–4x a single submission, not 20x — see
   the "caps the contribution of solving the same problem many times" test.

## Independence vs. guidance

`independent`, `hintsUsed`, and `solutionViewed` are tracked separately and
affect weighting differently:

- Solution viewed → passes still count as evidence the student *engaged*,
  but contribute almost nothing to independent mastery (0.05 base quality)
  and never count toward `independentPassCount`.
- Guided with hints → valid *learning* evidence (state can reach
  `LEARNING`), but explicitly excluded from independent-pass counts.
- Fully independent, no hints, no solution → full weight for its difficulty.

## Language vs. concept mastery (PHASE 11)

`student_skill_language_state` tracks fluency in a specific language
separately from `student_skill_state`, which tracks the underlying concept.
A student can be `STRONG` on Binary Search as a concept while `UNKNOWN` on
implementing it in C++ — the concept table is never downgraded because of a
language gap.

## What would sharpen this further (honest limitations)

- The state-machine thresholds (e.g. "4 independent passes for MASTERED")
  are defensible starting points, not calibrated against real outcome data,
  because no real student data exists yet. Tune `config.ts` once you have some.
- Gap classification (`EDGE_CASE_GAP`, `COMPLEXITY_GAP`, etc.) depends on
  your execution/test engine populating `failureReason` on each failed
  submission. Without that signal, gaps fall back to `NEEDS_REVIEW` rather
  than guessing — see `CODEFORGE_EVIDENCE_MODEL.md`.
