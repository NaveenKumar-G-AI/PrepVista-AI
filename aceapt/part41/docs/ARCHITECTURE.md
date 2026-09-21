# Architecture — Feature 41 (Adaptive Career Strategy Engine)

## Pipeline (spec #52)

```
ContextSourceRepository (read-only adapter to Features 34-40 + core data)
            │
            ▼
   contextBuilder.ts        — assembles the allowlisted StrategyContext
            │
            ▼
   signalEngine.ts          — deterministic, rule-based fact extraction
            │
            ▼
   guardEngines.ts          — constraint check, drift, contradiction
            │
            ▼
   bottleneckEngine.ts      — single, evidence-gated primary bottleneck
   nextBestMoveEngine.ts    — candidate generation + value-model scoring
   strategyHealthEngine.ts  — six independent dimensions + overall status
   momentumEngine.ts        — period-over-period comparison
            │
            ▼
   narrativeServices.ts     — LLM narrative (bounded, schema-validated,
                              safety-checked) with a deterministic fallback
            │
            ▼
   StrategyStore            — persists strategy/bottleneck/action/
                              experiment/recommendation/review records
            │
            ▼
   routes/*.ts               — HTTP surface
            │
            ▼
   CareerCommandCenter.tsx   — the UI that renders all of the above
```

## Why the LLM is bounded the way it is

The deterministic engines (bottleneck, next-best-move, health, momentum,
constraints, drift, contradiction) never call an LLM — they're plain
TypeScript functions over the context object, which is why they're
unit-testable and why `narrativeServices.ts` can always fall back to a
templated explanation built from the engines' own output when the LLM is
unavailable or its output fails validation. The LLM's only job
(`src/ai/pipeline.ts`) is turning an already-ranked result into a clearer
sentence — never re-ranking, never inventing a different bottleneck. This
is what makes `generatedByLLM: false` in a `Recommendation` a normal,
non-degraded state rather than an error state.

## Data ownership (spec #59)

Feature 41 does **not** own: student, goal, skill, evidence, opportunity,
application, decision, outcome, constraint. Those are read through
`ContextSourceRepository` (see `backend/src/repositories/types.ts`) and are
assumed to already exist in ACEAPT.

Feature 41 **does** own the ten entities in
`db/migrations/001_feature41_schema.sql`: `career_strategy`,
`strategy_version`, `strategy_signal`, `bottleneck`, `strategy_action`,
`career_experiment`, `experiment_outcome`, `recommendation`,
`recommendation_feedback`, `strategy_review`.

## Where cross-feature integration (34-40) actually happens

`ContextSourceRepository` is the seam. Every field it returns
(`getGoal`, `getSkills`, `getEvidence`, `getOpportunities`,
`getApplications`, `getRecentDecisions`, `getRecentOutcomes`,
`getConstraints`) is something Features 34-40 (or core student records)
already produce. This build implements that interface once, in-memory, as
`InMemoryContextSourceRepository`, seeded with the spec's own QA scenario —
there was no real Feature 34-40 implementation available in this
environment to integrate against, so this is the honest boundary: the
*shape* of the integration is real and typed; the actual data source behind
it is a stand-in.

## Event architecture (spec #61)

`src/events/eventBus.ts` emits every event named in the spec
(`strategy_created`, `bottleneck_detected`, `action_completed`, etc.) via a
plain Node `EventEmitter`. Swap the internals of `publish()` for your real
event bus (Kafka/SNS/whatever ACEAPT already runs) — call sites don't
change.
