# CodeForge Recommendation Engine

## The pipeline

```
role requirements + current mastery + prerequisite states + relationships
  → gap diagnosis (is this really the skill to work on, or a prerequisite?)
  → candidate list (one per required skill, resolved to the right target)
  → deterministic ranking (domain/recommendationRanking.ts)
  → take #1 as PRIMARY, next 2–3 as secondary (PHASE 64)
  → deterministic explanation from the same facts used to rank it
  → (optional) AI polish of the prose — facts unchanged either way
```

## Ranking is deterministic and configurable (PHASE 20)

`rankRecommendations()` in `domain/recommendationRanking.ts` is a weighted
sum — role importance, mastery gap size, prerequisite bonus, retention
risk, transfer gap, a small recency penalty against re-suggesting something
just dismissed. Every weight lives in `RECOMMENDATION_WEIGHTS` in
`config.ts`. There is no hidden model, no learned scoring, and nothing an
AI provider touches before the ranking is decided.

## Explanations are never AI-invented (PHASE 21, 62)

`explainRecommendation()` builds the reason list from the exact facts
already computed for ranking: the role's requirement, the current mastery
state and confidence, the gap category, and the mastery calculation's own
`reasons` array. An `AIProvider` may be used afterward *only* to smooth the
sentence-level prose (see `RecommendationService.polishReasons()`) — never
to add a fact, and the deterministic text is what's shown if AI is
unavailable. The UI never says "AI recommends this"; it shows the reasons.

## Prerequisite-first (PHASE 18)

Before recommending more practice on a struggling skill, the service checks
whether a prerequisite (a `PREREQUISITE`/`DEPENDS_ON` edge in
`skill_relationships`) is itself below a competence threshold. If so, the
recommendation targets the prerequisite, and the originally-struggling
skill is carried through only as context (`blockingSkillId`) for the
explanation text — see the smoke test output for a real example (Dynamic
Programming blocked by a weak DP State Modeling prerequisite, with
Recursion correctly excluded because it's already `STRONG`).

## AI's actual role here

Per PHASE 38/52/73: AI is never authoritative for mastery state, ranking,
or facts, and the system must keep working if every AI provider is down.
Concretely, `AIProviderRouter` tries Groq, then Gemini, then falls back to
returning the deterministic reason text unchanged — see
`__tests__/aiProviderFallback.test.ts`, which asserts the fallback path
actually engages when every provider throws.

## What's not here yet

- `learning_recommendations` persistence is written by the schema but the
  service doesn't yet write ranked results into it or read
  `lastRecommendedDaysAgo` back out — currently hardcoded to `null` in
  `RecommendationService`. Wiring that loop closed is mechanical (insert
  after ranking, query it back in on the next call) but untested here.
- Student feedback ("too easy" / "not relevant", PHASE 49) has a
  `recommendation_history.feedback` column but no endpoint writes to it yet.
