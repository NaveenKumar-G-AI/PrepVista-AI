# PART15_RESEARCH_UPGRADE.md
## Phase 73 — Research-Again Upgrade

Triggered directly by the hostile review (F1-F3 in PART15_HOSTILE_REVIEW.md).
One additional research question came up while diagnosing F3 that the
original research pass hadn't covered.

### New question: why does min/max-relative normalization structurally produce a top score near 1.0?

**Finding.** Ranking-system literature has a clean name for exactly what F3
did: "Rank Norm" (or min-max normalization more generally) transforms scores
by position in the current list rather than by any absolute reference — a
documented reference implementation (`ranx`, an open-source ranking-evaluation
library) states plainly that under this transform the top-ranked result
always receives a score of 1, *by construction*, regardless of how close or
far apart the underlying values actually are. Separately, weighted-scoring
guides aimed at product prioritization (Savio, SixSigma, PM Toolkit) converge
on the same practical warning stated less formally: scores from a purely
relative/in-batch normalization should not be read as an absolute measure of
severity, only as an ordering within that specific batch — comparing "this
week's top priority" against "last week's top priority" is meaningless if
both were independently rescaled to the same 0-1 band.

**Relevance.** This is precisely what F3 did wrong: `impact` was rescaled so
the largest of *this run's own* stage contributions always sat at 1.0. That
made the top recommendation look equally urgent whether the institution was
30 points off target or 2 points off target — an artifact of the
normalization, not a fact about the institution.

**Implementation impact.** Confirms the F3 fix was the right shape (anchor to
an external, stable reference — `requiredAdditionalPlacements` — rather than
to the batch's own max) rather than a narrower patch like "just don't round
so aggressively." It also flags a related question worth carrying into
Section 88 Pass 8 (Strategy correctness) for any *future* addition to this
codebase: any time a new score involves `Math.max(...currentBatch)` in its
own denominator, treat that as a hostile-review flag on sight, not just this
one instance. `OutreachPriorityService.pastHiring` was checked against this
same pattern — it *is* normalized against `maxHistoricalHires` within the
current batch of inactive companies, which is a narrower, more defensible
case (comparing this season's outreach candidates against each other is
exactly the right question — "which of these companies is relatively worth
approaching first" — unlike `impact`, which was answering "how urgent is
this problem," an absolute question). Left as-is, with this reasoning
recorded so a future reviewer doesn't have to re-derive it.

### Confirmed, not changed

- Weighted-pipeline forecasting and empirical Bayes shrinkage (Research #1-2)
  held up under the hostile review — F1's fix used more of the *same*
  methodology (extending pipeline projection to the department level) rather
  than replacing it, which is a sign the original methodology choice was
  sound rather than a sign it needed revisiting.
- Walk-forward/leave-one-out backtesting (Research #3) held up too; F2 and F6
  both extended *how the result is used* (feeding into confidence, disclosing
  fold count) rather than changing the backtest method itself.

### Applied

- F3's fix, and the `pastHiring` cross-check above, are both reflected in the
  current `services/strategy/RecommendationEngine.ts` and
  `services/opportunity-intelligence/OutreachPriorityService.ts`.
