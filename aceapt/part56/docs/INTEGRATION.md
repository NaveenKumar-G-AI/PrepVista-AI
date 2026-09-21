# Integration guide

This scaffold is deliberately built as a set of small, swappable pieces. This
doc is the practical "how do I actually connect it" companion to the
architecture notes in README.md.

## 1. Swap the in-memory repositories for Postgres/Prisma

Everything in `src` depends only on the four interfaces in
`src/repositories/index.ts` (`FormulaRepository`, `StudentStateRepository`,
`TrainingAttemptRepository`, `TrainingSessionRepository`) - never on a
concrete database client. To go to production:

1. Run `prisma/schema.prisma` (or translate it to your own ORM/migration
   tool) against a real Postgres database.
2. Implement each repository interface against Prisma. Sketch for one of the
   four:

   ```ts
   import { PrismaClient } from '@prisma/client';
   import { Formula, FormulaRepository } from 'formula-intelligence-engine';

   export class PrismaFormulaRepository implements FormulaRepository {
     constructor(private prisma: PrismaClient) {}

     async getFormula(formulaId: string): Promise<Formula | null> {
       const row = await this.prisma.formula.findUnique({ where: { formulaId } });
       return row ? mapRowToFormula(row) : null; // variables/conditions/derivedForms are JSON columns - parse/cast them back into the typed shape
     }
     // ...listFormulas, saveFormula, getRelationships, saveRelationship
   }
   ```

3. Pass your real repositories into `buildApp({ formulaRepo, stateRepo,
   attemptRepo, sessionRepo })` (see `src/server.ts` for the in-memory
   version being replaced).

`npx prisma generate` needs network access to Prisma's engine CDN and a real
`DATABASE_URL` - run it in your own environment, not this sandbox.

## 2. Wire Features 45-55, mastery, and retention scheduling

Every reuse point the spec calls for is a small interface in
`src/integrations/ports.ts`, each with a conservative default adapter:

| Port | Spec feature | Default adapter behavior |
|---|---|---|
| `SkillGraphPort` | 45 - Aptitude Skill Graph | returns `null` / `[]` |
| `HintEnginePort` | 48 - Hint Intelligence | hint level always `0` |
| `NoveltyPort` | 49 - Anti-Memorization | always `FAMILIAR` |
| `PerformanceContextPort` | 50/51/52 - Speed/Accuracy/Timed | timed mode always `false` |
| `QuestionValidationPort` | 53/54 - Quality & Validation | treats every question as valid |
| `DifficultyPort` | 55 - Difficulty Calibration | always suggests `MEDIUM` |
| `MasteryPort` | 36/37 - General mastery | no-op |
| `RetentionSchedulerPort` | 40 - Retention scheduling | no-op |
| `AIGatewayPort` | AI gateway | throws (engine still works - see below) |

Write a real adapter class implementing the interface (calling your actual
Feature 45/48/... service), then pass it into `FormulaTrainingPolicy`'s
constructor in `src/api/app.ts` instead of the `Default*`/`Null*` adapter.
Nothing else needs to change - the policy and engine only ever call the
interface methods.

`MasteryPort` and `RetentionSchedulerPort` are not called anywhere yet in
`FormulaTrainingEngine` - the natural hook points are the end of
`submitAttempt` (report dimension evidence to mastery) and wherever your
retention scheduler wants to be told "this formula is now due for spaced
review" (after a run of `STRONG` evidence, or after a `FORMULA_REGRESSION`
signal). Wire these once your real Feature 36/37 and Feature 40 clients
exist.

## 3. Question content (Feature 53/54)

`FormulaTrainingEngine.getNextActivity` returns a **directive**, not a
question: formula, activity type, difficulty, novelty, support level, and
(for SELECT) which confusable formulas should be offered as distractors.
Your orchestration layer combines that directive with a validated question
from your Question Bank, shows it to the student, then calls `submitAttempt`
with the ground truth your Question Bank already knows (`correctFormulaId`,
`expectedMapping`, `expectedAnswer`, ...). This engine never authors or
validates question text itself - see the `AttemptInput` doc comment in
`src/types/index.ts`.

## 4. Real authentication

`src/api/middleware.ts`'s `attachAuthContext` is a **dev-only stub** that
reads `x-user-id` / `x-user-role` / `x-tenant-id` headers. Replace it with
real session/JWT verification before any real traffic reaches this API -
everything downstream (`requireRole`, `requireSelfOrRole`) only depends on
`req.auth` being populated correctly, so swapping the population mechanism
is enough.

Known gap: session/attempt routes (`POST /training/sessions`, `.../next`,
`.../attempts`) do not currently verify the caller is the student named in
the request. Add a `requireSelfOrRole('studentId', ...)`-style guard once
sessions carry an authenticated studentId end to end - the pattern already
exists on the profile/weakness routes in `src/api/routes.ts`.

## 5. Multi-tenant isolation

`Formula.tenantId` exists for tenant-private content, and
`FormulaTrainingSession.tenantId` is captured at session start, but
student-state tenant isolation is **not** enforced end-to-end in this
scaffold - there's no student/user directory here to resolve "which tenant
does this student belong to" against. Add that check once your session
creation and analytics routes have access to a real tenant directory.

## 6. AI gateway

Implement `AIGatewayPort.complete()` against your actual model provider and
pass it to `FormulaTrainingEngine.explainMistakeWithAI()` wherever you want
a friendlier phrasing of a mistake explanation. Always call
`buildSafeCoachingPrompt()` (or an equivalent that keeps user/content text
out of the instruction string) when passing student-authored or
community-sourced text into any prompt - never string-concatenate it into
the instruction itself.
