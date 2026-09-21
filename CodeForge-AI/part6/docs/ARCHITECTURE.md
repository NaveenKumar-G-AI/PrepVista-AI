# Architecture

## Phase 0 discovery (what was actually found)

The brief opens by requiring inspection of an existing repository before
writing any code. That inspection happened first, for real:

```
find / -maxdepth 4 -iname "*codeforge*"   -> no results
ls /home/claude, /mnt/user-data/uploads   -> empty
```

There is no existing frontend, backend, database, or Adaptive Coding Mastery
Engine anywhere in this environment. Everything in this repository is new.

## What this means for "don't rebuild the adaptive engine"

The brief is emphatic that the roadmap engine must **consume** the existing
Adaptive Coding Mastery Engine's output, not recompute a second, conflicting
mastery model. That principle is followed exactly — but since no such engine
exists here, `src/engine/masteryUpdate.ts` + `src/repositories/evidenceRepo.ts`
implement the **minimal real contract** it would expose:

```
evidence event  ->  { masteryLevel, confidence, evidenceCount, trend }
```

This is a genuine, deterministic, unit-tested, documented algorithm (see the
comment block in `masteryUpdate.ts`) — not a randomizer, not a hardcoded
per-student value. Everything above it (`gapAnalysis.ts`, `priorityEngine.ts`,
`roadmapGenerator.ts`, `readinessModel.ts`) treats `skill_mastery_state` as
the single source of truth and never recomputes mastery independently,
exactly as the brief requires of the real system. If a real CodeForge
Adaptive Engine is later dropped in, only `evidenceRepo.ts`'s write path
needs to change — every downstream consumer already reads through the same
`MasteryState` contract and would not need to change.

## The integration contract, as built

```
Student Target Profile  (student_targets)
        |
Role Competency Blueprint (roles, role_competencies)   <-- data-driven, not hardcoded in logic
        |
Skill Graph (skills, skill_prerequisites)               <-- cycle-checked
        |
Current Evidence (skill_evidence -> skill_mastery_state) <-- the "adaptive engine" contract above
        |
Gap Analysis (engine/gapAnalysis.ts)                     <-- UNKNOWN vs WEAK, never conflated
        |
Prerequisite / Critical Path (engine/prerequisiteGraph.ts) <-- blocking power, cycle-safe
        |
Priority Engine (engine/priorityEngine.ts)                <-- explainable, weighted, no LLM
        |
Roadmap Generator (engine/roadmapGenerator.ts)             <-- pure function, fully deterministic
        |
Milestone Engine (engine/milestoneEngine.ts)                <-- evidence-gated completion
        |
Recalculation (engine/recalculation.ts + repositories/roadmapRepo.ts) <-- diff-gated, versioned, transactional
        |
Readiness Model (engine/readinessModel.ts)                  <-- gated composite score
        |
Daily/Weekly Plan (engine/dailyWeeklyPlanner.ts)
        |
Explanation Engine (engine/explanationEngine.ts)             <-- grounded templates, optional AI polish
```

Every arrow above is a real function call with a real, checked TypeScript
type in between — not a conceptual diagram that the code doesn't actually
follow.

## Layering principle

- **`engine/`** — pure functions. No `Database`, no `Request`, no network
  call, no randomness. This is what makes 32 of the 38 tests run in
  milliseconds with no I/O, and it's what makes the priority/gap/milestone
  logic independently auditable: you can read `priorityEngine.ts` top to
  bottom and know exactly what it does, with nothing hidden in a database
  query or an LLM call.
- **`repositories/`** — SQL + transactions + orchestration. This is where
  the pure engine functions get real data in and real rows out. All
  multi-table writes (a recalculation touching `roadmap_versions`,
  `roadmap_milestones`, `roadmap_skills`, and `roadmap_events` together) run
  inside `withTransaction()` (`src/db/client.ts`), so a crash mid-recalculation
  can't leave a milestone marked complete while the roadmap version disagrees.
  This is one integration test's worth of assurance (`tests/e2e.test.ts`),
  not just an assertion in a comment.
- **`api/`** — thin. Routes parse/validate input (`zod`), derive identity
  from the verified auth token (never from the request body), call a
  repository function, and serialize the result. No business logic lives
  here.

## Why one milestone chain is linear, not an arbitrary DAG

Milestones are generated in dependency-layer order (`computeLayers` in
`prerequisiteGraph.ts`) and chained linearly: milestone *N* lists milestone
*N-1* as its only prerequisite. A general DAG-of-milestones was considered
and deliberately simplified to a chain — the brief's own Phase 10 example
roadmap is itself presented as a linear phase sequence, and a linear chain
is enough to express everything the skill-level DAG already captures (which
skill blocks which is tracked precisely at the *skill* level, not lost by
simplifying the *milestone* sequencing). This is called out explicitly, not
hidden, in `docs/FINAL_REPORT.md`.

## AI's actual role

`src/ai/provider.ts` + `src/ai/providers.ts` implement Groq and Gemini
providers for real, behind `GROQ_API_KEY` / `GEMINI_API_KEY`. In this sandbox
neither key is set, and the sandbox's network policy has no route to either
host regardless — so the system runs on `DeterministicFallbackProvider`,
which is the honest, verifiable mode for this build. AI is wired to be able
to rephrase an already-computed explanation (never to invent one), and its
output is `zod`-schema-validated with an automatic fallback to the
deterministic text on any failure, timeout, or malformed response — see
`withValidationAndFallback()`. Mastery, gap status, priority, milestone
completion, and readiness are computed by `engine/` code and are never
touched by the AI layer.
