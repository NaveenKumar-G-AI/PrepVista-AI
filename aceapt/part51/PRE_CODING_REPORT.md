# Feature 51 — Pre-Coding Report

Written against the spec's §146 checklist. The headline fact shaping every
answer below: **no ACEAPT repository was provided or available to inspect**
(confirmed with the person before starting, consistent with how Features
8/20/29/40 were built in this same project). Every "existing X" question
below is therefore answered as "not available to inspect" plus what Feature
51 does about it — not invented as if a real answer was found.

| # | Item | Finding |
|---|------|---------|
| 1 | Existing accuracy calculation | None to inspect. Built fresh, evidence-gated, in `src/domain/accuracyProfile.ts`. |
| 2 | Existing mistake classification | None to inspect. `MistakeClassificationPort` is the integration seam; a minimal heuristic default adapter exists only so the module runs standalone — real classification should come from the actual F13/14 service. |
| 3 | Existing personal mistake bank | None to inspect. `PersonalMistakeBankPort`'s default adapter computes real recurrence tallies from Feature 51's own attempt history — genuine working logic, not a stub, but still swappable for the real bank. |
| 4 | Existing error-pattern intelligence | None to inspect. `ErrorPatternIntelligencePort`'s default adapter wraps `domain/errorClassification.ts`'s `detectErrorClusters` — same "real local logic behind a swappable port" pattern as #3. |
| 5 | Existing first-error detection | None to inspect. Built directly: `stepResults` + `firstErrorStep` on every attempt, `firstErrorStepOf()` in the training engine. Verified in tests/unit/errorClassification.test.ts and the live walkthrough. |
| 6 | Existing question validation | None to inspect. `questionValid` is captured per attempt (from the caller, or read from the fixture Question table's `is_valid` column) and gates every accuracy computation — invalid attempts are recorded but never scored. |
| 7 | Existing mastery | None to inspect. Feature 51 never computes mastery — it only emits `MASTERY_EVIDENCE_SIGNAL` to the outbox for the (not-yet-existing) mastery engine to consume. |
| 8 | Existing speed training | None to inspect. `SpeedTrainingPort` + a pace-ratio derivation (`isUnderPressure`) stand in for it. |
| 9 | Existing novelty/transfer | None to inspect. `AntiMemorizationPort`; `isNovel` captured per attempt. |
| 10 | Existing hint intelligence | None to inspect. `HintIntelligencePort`; `hintLevel` captured per attempt. |
| 11 | Existing guided solving | None to inspect. Step-by-step results arrive on the attempt submission itself (`stepResults`). |
| 12 | Existing skill graph | None to inspect. `SkillGraphPort`'s default adapter honestly returns empty relations — there is no graph data anywhere in this standalone module to derive one from. |
| 13 | Existing goals | None to inspect. `targetAccuracyPct` is a flat constant (90) pending a real goal-derived target. |
| 14 | Existing retention | None to inspect. Only `RETENTION_EVIDENCE_SIGNAL` is emitted; no spacing/scheduling logic is built (§54 explicitly says not to duplicate it). |
| 15 | Existing analytics | None to inspect. One `track()` function (`src/services/analytics.ts`) as the seam — logs today, points at the real pipeline later. |
| 16 | Reusable services | None — no repository, nothing to reuse at the code level. The reuse this report can actually deliver is *contract-level*: ports shaped around each capability so the real service drops in later without touching Feature 51's domain or policy logic. |
| 17 | Required database changes | Four new owned tables (`accuracy_training_session`, `accuracy_training_attempt`, `accuracy_profile_snapshot`, `accuracy_intervention`) + one cross-feature `signal_outbox` table + three underscore-prefixed fixture tables standing in for canonical Student/Skill/Question tables. Full DDL in `db/01-schema.sql`. |
| 18 | Required APIs | `/accuracy/profile`, `/dashboard`, `/bottlenecks`, `/error-pattern-card`, `/training` (start), `/training/active`, `/training/:id`, `/training/:id/attempts/:seq`, `/training/:id/transition`, `/self-check`, `/training/:id/attempts/:seq/error-spotting`, `/training/:id/attempts/:seq/error-correction`. |
| 19 | Frontend changes | Five components (`AccuracyDashboard`, `ErrorPatternCard`, `PrecisionTrainingSession`, `SelfCorrectionExercise`, `ErrorSpottingExercise`) plus a shared `CalibrationScale` device and a token file — see README's design section. |
| 20 | Accuracy-training architecture | Layered: `types` → `domain` (pure functions) → `policy` (composes domain into decisions) → `services` (orchestration + I/O) → `api` (HTTP). External features are consumed through `ports` (inbound) and produced to through the `outbox` (outbound), never called directly from domain/policy code. |
| 21 | Security model | Three Postgres roles (owner/app/service) matching the pattern established on earlier features; RLS enabled **and forced** on every Feature 51 table; the app role authenticates every query with `SET`-via-`set_config` student context inside a transaction. Verified live, including a raw-SQL cross-student check (not just an application-level 404). |
| 22 | Testing strategy | Two tiers: (a) Vitest unit tests over pure domain/policy functions — no DB, no network, one test per numbered spec scenario where the scenario is a pure computation (§112-128); (b) a live-HTTP walkthrough script that boots the real Express app and hits a real local Postgres instance for the scenarios that are inherently systemic (§129-134: validation, AI fallback, security, recovery, concurrency). |
| 23 | Performance strategy | Indexes on `(student_id, skill_id)`, `(student_id, created_at)`, and `(student_id, error_type)` on the attempt table; per-role connection pools (max 10 each); the outbox is a polling table rather than a message broker, appropriate for this module's actual scale and honestly not load-tested beyond the walkthrough's traffic. |
| 24 | Risks | (1) The feature-numbering scheme in this spec doesn't fully match this project's own history (see design note below) — mitigated by integrating on capability contracts, not numbers. (2) Every F42-50 port has only a placeholder or self-referential default adapter — genuinely useful for a standalone demo, but real accuracy depends on the real services being wired in. (3) A single short precision-training session produces a noisy before/after accuracy comparison by nature of small sample size — the evidence-gating thresholds are deliberately conservative about this, but a product team should expect "insufficient evidence" to show up often early on. (4) No production auth, real Anthropic key, or real Question/Skill/Student tables exist in this environment — all three are explicit, documented integration points, not silent gaps. |

## Design note: feature numbers vs. capabilities

This spec's own internal references (Personal Mistake Bank as "F29", Error
Pattern Intelligence as "F30", etc.) don't line up 1:1 with the numbers used
for other features built earlier in this project's history (this project's
own Feature 29 was ALIGN, a capability-to-opportunity engine, not a mistake
bank). Rather than silently picking one numbering as "correct," every port
and comment in this codebase refers to the capability by name first and the
number parenthetically — `SkillGraphPort` documented as "stands in for the
Aptitude Skill Graph (spec calls it F45)" rather than a hard commitment to a
specific numeral. Whatever the real repository's numbering turns out to be,
the capability contract is what actually matters for wiring this in.
