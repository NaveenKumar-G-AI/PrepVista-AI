# Difficulty Engine

## Multi-dimensional difficulty model

Every challenge (`challenges` table) carries a composite `difficulty_level` (`EASY`/`MEDIUM`/`HARD`/`ADVANCED`) and `difficulty_score` (1–10), plus five independent dimensions used in the seed data and available to any future ranking refinement: `concept_difficulty`, `implementation_complexity`, `constraint_complexity`, `reasoning_complexity`, `ambiguity`. This satisfies Phase 16's requirement to model difficulty as more than a single enum, while the ranking/adaptation logic itself currently keys off the composite score+level for simplicity — see "Known limitations" below.

## Adaptation (escalate on success, recover — not escalate — on failure)

`decideDifficulty` (`src/difficulty/difficultyEngine.ts`) is a pure function over a skill's recent evidence and its current difficulty level:

- **`consecutiveSuccessesToIncrease = 2`** independent successes at the current level → `ADVANCE` to the next level.
- **`consecutiveFailuresToDecrease = 2`** consecutive failures → `RECOVER`, stepping **down** one level, never continuing to escalate. At `EASY`, recovery floors there (no negative level) — the correct next move at that point is a `PREREQUISITE_REVIEW` intervention, decided separately by the gap/intervention layer, not a difficulty level that doesn't exist.
- Mixed/inconclusive recent evidence → `HOLD` at the current level.

This is exactly the Phase 17 recovery path (`Advanced → Intermediate → Prerequisite → Success → Intermediate → Advanced`), implemented as a real state machine and tested in `tests/unit/difficulty.test.ts` for both the escalation and recovery directions, including the "repeated failure at ADVANCED steps back through HARD, not further up" case.

## Fatigue signal (Phase 33)

`detectFatigueSignal` looks at two purely observable product signals — recent failure rate (≥ 75% of the last 4 attempts) and at least one unusually long attempt (≥ 240s) — and returns a signal to reduce difficulty or suggest a review, never a medical or psychological claim about the student. Tested in `tests/unit/difficulty.test.ts`.

## Known limitations

- The five extra difficulty dimensions are captured in the schema and seed data but are not yet independently weighted in the ranking formula (`difficultyFit` currently compares the composite `difficulty_level` only). Wiring them in is a ranking-engine change, not a schema change.
- Difficulty adaptation currently operates per-skill from the evidence history directly (recomputed on each call) rather than persisting an explicit "current difficulty pointer" column — this is simpler and still correct (it's a pure function of history), but a high-traffic production system might want to cache the pointer rather than recompute it per request.
