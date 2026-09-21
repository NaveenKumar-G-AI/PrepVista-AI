# CodeForge Data Model

`src/domain/types.ts` is the source of truth; this document explains the
*shape*, not every field (the file itself is heavily commented per-field).
`db/migrations/0001_init.sql` is the same model in Postgres/Supabase form.

## Challenge identity vs. content vs. state (§36, §37, §38)

Three things that are easy to conflate and deliberately aren't here:

- **Identity**: `challengeId` never changes. It's how an attempt refers back to
  "which challenge," forever.
- **Content**: versioned. `challenge_versions(challenge_id, version)` in SQL;
  in the TS domain model a `Challenge` object *is* one version's content — the
  in-memory store keeps the latest by challengeId, matching how the app
  actually uses it, while the SQL schema keeps every version because
  historical attempts need to resolve against the *exact* version they were
  attempted against (§36: "Never modify historical assessment meaning").
- **State**: `qualityStatus` (DRAFT → VALIDATING → REVIEW → APPROVED → ACTIVE →
  DEPRECATED, §37) and `qualityAnalytics` (§38) both change without changing
  content or identity. Analytics are `null` until real attempts exist —
  there's no synthetic starting value, because a fabricated pass rate would be
  exactly the kind of invented precision §10/§63 rule out.

## Difficulty is two things, on purpose (§10)

`DifficultyVector` (conceptual/implementation/reasoning/edge-case complexity,
prerequisite depth, expected time) is the internal, multi-dimensional model.
`DifficultyLabel` (FOUNDATION…EXPERT) is what a student sees and what the
selector reasons about externally. The vector carries a `calibrated: boolean`
flag that is **always `false`** in this codebase right now, because nothing
here has run against enough real attempts to justify calling a number
"calibrated" — see `docs/CODEFORGE_CHALLENGE_RESEARCH.md` for what calibration
would actually take.

## Skill vs. task type (a modeling decision worth stating explicitly)

A `Challenge` has one primary `skill` (a taxonomy key, e.g.
`data_structures.hashing`) and one `taskType` (DEBUGGING, IMPLEMENTATION, etc.,
§9). These are orthogonal: skill is *what concept*, task type is *how you're
tested on it*. A small, explicit table
(`TASK_TYPE_CROSS_CREDIT` in `src/service/codeforgeService.ts`) additionally
credits a cross-cutting engineering skill for certain task types — a DEBUGGING
challenge about hashing is real evidence for both `data_structures.hashing`
*and* `engineering.debugging`, which is what lets the demo's baseline
("Debugging — Developing" as its own tracked line, separate from the
algorithmic skill) actually move as evidence for both. This is a deliberate
resolution of an ambiguity in §12's example (which lists "Debugging" as its
own profile row) versus §6's schema (a single `skill` field per challenge) —
documented here rather than silently decided.

## Attempts are the evidence ledger (§22)

An `Attempt` is created in `STARTED` state by `startAttempt()` and finalized
exactly once by `submitAttempt()` — after that, the store's SQL trigger
(`enforce_attempt_immutability` in the migration) blocks changes to the fields
that define the graded outcome. A retry is a **new** `Attempt` row, not a
mutation of the old one — `attemptId`s are per-submission, chained together
only by sharing `(studentId, challengeId)`. This is what makes
"submission_count," "first-attempt pass ratio," and "total hints used across a
challenge sequence" (all inputs to `difficultyPolicy.ts`) computable after the
fact from real rows instead of needing separately-tracked counters that could
drift from the truth.

## Hidden tests are a property of the row, not the response (§18, §43)

`TestResult` never carries `actualOutput`/`expectedOutput` for a hidden test,
in either direction, regardless of pass/fail — enforced in
`src/execution/executor.ts` at the point the result is constructed, and backed
by a second, independent enforcement layer in SQL (`attempt_test_results`'
columns are nullable and the app never populates them for hidden rows; RLS on
`challenge_tests` additionally blocks the student role from selecting
`hidden = true` rows at all). Two enforcement points, not one, on purpose — see
`docs/CODEFORGE_CHALLENGE_SECURITY.md`.

## What's deliberately NOT modeled yet

- Multi-language challenges beyond Python/JavaScript having a *working
  executor* — the schema (`supported_language` enum, `starterCode` as a
  per-language map) already allows Java/C++/Go/Rust/C; only the two have a
  runnable harness. Adding a language is additive: a new harness template in
  `executor.ts`, no schema change.
- A normalized `misconception_evidence` table — evidence is a bounded JSONB
  array on `misconceptions` instead, because at the volumes this feature
  actually needs (last 10 pieces of evidence per student/skill/category) a
  join table is overhead without benefit. Worth revisiting if that changes.
