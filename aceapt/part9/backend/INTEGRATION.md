# Wiring Feature 9 into the real ACEAPT codebase

This module was built standalone because no existing ACEAPT repository was
available to inspect. Every seam the spec asks for ("reuse existing
systems", "do not duplicate models") is implemented as a small interface
with an in-memory mock behind it. Below is exactly what to replace, in the
order the spec's own Phase list (section 61) suggests.

## 1. Skill taxonomy (spec section 9)

`src/domain/types.ts` (`SkillId`) and `src/data/questionBank.ts` currently
define a 10-skill taxonomy invented for this build. Replace `SkillId` with
your real taxonomy, point `getQuestionById` / `getQuestionsBySkill` /
`getQuestionsBySkillAndDifficulty` at your real question repository, and
delete `questionBank.ts`. Everything downstream (`QuestionSelectionService`,
all analyzers, the report) only depends on the `Question` shape, not on
this file, so the swap is contained.

## 2. Assessment / blueprint configuration (spec section 11)

If ACEAPT already has an assessment-configuration model, implement
`BlueprintService.getOrThrow` (`src/services/blueprintService.ts`) against
it instead of `src/config/blueprints.ts`.

## 3. Persistence (spec section 47)

`src/repositories/simulationRepository.ts` exports `SimulationRepository`,
an interface, plus `InMemorySimulationRepository`. Write a real
implementation (Postgres/Mongo/whatever ACEAPT already uses) against the
same interface and pass it into `buildRouter(repo, integrations)` in
`src/server.ts`. Nothing in `src/services` talks to storage directly.

## 4. Features 3–8 (spec sections 36–41)

Each of `src/integrations/feature{3,4,5,6,7,8}.ts` defines a `FeatureNClient`
interface plus a `MockFeatureNClient`. Implement the interface against your
real Feature N service/repository and swap it in
`src/integrations/index.ts` (`createDefaultIntegrations`), or construct a
custom `Integrations` object and pass it directly into `new
SimulationEngine(repo, integrations)`.

Nothing else needs to change - `SimulationEngine`, `SimulationReportService`,
`ReadinessIntegrationService`, and `NextActionSignalService` all depend on
the interfaces, never the mocks.

## 5. Authentication (spec section 50)

`src/middleware/auth.ts` is a minimal JWT check so the API runs standalone.
Two options:

- Set a real `JWT_SECRET` and have your existing login issue tokens with a
  `studentId` claim, or
- Delete `auth.ts` and mount `buildRouter(...)` behind your real ACEAPT
  auth middleware, as long as it populates `req.studentId` the same way.

Also delete the `POST /api/dev/token` route in `src/api/routes.ts` (it is
already disabled automatically when `NODE_ENV=production`).

## 6. Question quality pipeline (spec section 44)

Not implemented - this build ships a small static, hand-authored question
bank instead of the AI-generation pipeline. If/when you need AI-generated
questions, build that pipeline as its own service that writes into
whatever replaces `questionBank.ts`; `QuestionSelectionService` doesn't
care where questions came from as long as they satisfy the `Question`
shape and have passed your quality gate before they're selectable.

## What does NOT need to change

`src/services/*` (the entire analytics/decision layer), `src/analytics/*`,
and `src/api/routes.ts` are all written against interfaces only. Once steps
1-5 above are done, the rest of this module should work unmodified against
the real ACEAPT platform.
