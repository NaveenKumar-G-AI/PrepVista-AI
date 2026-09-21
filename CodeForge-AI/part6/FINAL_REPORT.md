# Final Report

## 1. The demonstration scenario (Phase 64), with real numbers

Seeded exactly the profile the brief specifies: Python & Arrays → Strong,
Hash Maps → Competent, Algorithms (Searching/Sorting/Recursion/DP) &
Debugging → Developing, Graphs → no evidence. This is real seeded evidence
in `src/seed/seed.ts`, run through the real mastery-update formula (verified
by running it — the first attempt used the wrong evidence *counts* to hit
these levels, caught immediately by inspecting the actual output, see
`docs/TESTING.md`).

**v1 (initial roadmap, generated from that evidence, zero LLM calls):**
Debugging and Recursion come out as the top two GAP-status items. Queues —
which has *zero* evidence, same as Graphs — is pulled into the roadmap by
resolving Graphs' prerequisite chain (Graphs → Graph Traversal → BFS →
Queues), and edges out even Debugging for the single highest priority score
(**0.575 vs 0.560**), because the real, computed blocking-power term
rewards it for gating three downstream skills. That specific ranking was not
hand-scripted — it's what the weighted formula in `priorityEngine.ts`
produces from the real graph. Graphs/Graph Traversal/BFS all read as
`BLOCKED`, not `UNKNOWN`, in v1 itself — the engine is stricter here than
the brief's own narrative implies: an unresolved (`UNKNOWN`) prerequisite is
correctly treated as "not ready" from the very first version, not only once
a failure is later observed.

**v2** — one more independent Debugging success crosses the confidence
threshold into `COMPETENT`. Real diff: `skillsCompleted: [Debugging]`.
Debugging drops out of the active roadmap.

**v3** — a single independent `FAIL` on Queues is enough to flip it from
`UNKNOWN` to `CRITICAL_GAP` (real diff: `skillsRegressed: [Queues:
UNKNOWN→CRITICAL_GAP]`). A second `FAIL` submitted immediately after
correctly produces **no** third version — Queues' classification doesn't
change further, so Phase 21 ("don't regenerate unnecessarily") holds even
within a burst of evidence.

**v4** — three independent successes plus one independent `VERIFICATION`
success promote Queues to `COMPETENT` (`COMPLETE`). It drops out; **BFS
correctly unblocks** (`BLOCKED → UNKNOWN`); **Graph Traversal correctly
stays `BLOCKED`**, because it waits on BFS specifically, not on Queues — the
system doesn't let the student skip ahead just because the root of the
chain resolved.

This exact sequence — the real HTTP requests, the real responses, all four
real roadmap versions, the real event log, a real generated daily plan
(`Practice: Recursion` 33min → `Transfer: BFS` 16min → `Verification:
Recursion` 11min, summing to the full 60 available minutes), a real 3-student
cohort aggregate, and a real cross-student access attempt correctly
rejected with `404` — is in `demo-output/*.json`, produced by actually
running `npm run demo` against the live server, not authored by hand.

## 2. Review, from the personas the brief asks for

- **Is this genuinely personalized?** Two students with the same target role
  get different roadmaps because generation reads `skill_mastery_state`,
  which is per-student. Demonstrated concretely: the seeded cohort has 3
  students on the same role with different evidence, and `cohortSummary()`'s
  real aggregate output (0%/33%/33%... per skill) is only possible because
  each student's roadmap differs.
- **Does the roadmap change based on evidence?** Yes — shown four times over
  in one run (v1→v4 above), not asserted once.
- **Is mastery sourced from real evidence?** Yes — `skill_mastery_state` is
  written in exactly one place (`evidenceRepo.recordEvidence`), and it's
  always derived from an evidence row, never set directly by any route.
- **Can students manipulate readiness?** No API route accepts a mastery,
  gap status, or readiness value as input anywhere. The only way to change
  them is to submit evidence, which is itself append-only.
- **Can students access other students' data?** No — checked live in the
  demo run (STEP 10), not just in a unit test.
- **Can it survive AI failure?** Yes by construction — there is no AI call
  anywhere in the decision path; `withValidationAndFallback` degrades to the
  deterministic explanation on any AI failure and the roadmap never depends
  on that call succeeding.
- **Can it handle deadline pressure?** `computeAtRisk()` is a real (if
  intentionally simple, clearly-labeled heuristic) estimate comparing
  remaining weighted work to `dailyMinutes × daysRemaining`, and flips
  `atRisk` on the roadmap version rather than silently promising an
  unrealistic readiness date.
- **What would a Staff Engineer flag first?** The milestone-dependency model
  is a linear chain, not a general DAG (see `docs/ARCHITECTURE.md`); the
  at-risk effort estimate is a heuristic, not a calibrated model; there's no
  load testing. All three are named below, not hidden.

## 3. Truth table

Legend: **IMPLEMENTED** = real logic, real persistence, tested and/or
demonstrated in this build. **PARTIAL** = the real mechanism exists but
scope was deliberately narrowed. **DEMO ONLY** = works in the shipped demo
but would need more work to generalize. **NOT IMPLEMENTED** = out of scope
here, named honestly rather than silently skipped.

| Capability | Status | Note |
|---|---|---|
| Student target profile | IMPLEMENTED | `student_targets`, history preserved on change |
| Role competency blueprint | IMPLEMENTED | Fully data-driven; adding a role touches zero engine code |
| Skill gap engine (UNKNOWN vs weak) | IMPLEMENTED | Unit-tested; `evidenceCount === 0` is the only path to `UNKNOWN` |
| Prerequisite analysis | IMPLEMENTED | Real graph, real traversal, unit-tested |
| Cycle detection | IMPLEMENTED | 3-color DFS; unit-tested on a real 3-node cycle; corrupted skills are excluded and logged (`INVALID_SKILL_GRAPH_DETECTED`), not looped on |
| Critical path / blocking power | IMPLEMENTED | Iterative, cycle-safe (fixed a real stack-overflow bug caught by tests); feeds the priority score, not a separate cosmetic number |
| Priority engine | IMPLEMENTED | Deterministic, weighted, fully explainable breakdown persisted per skill; no LLM in the calculation |
| Roadmap generation | IMPLEMENTED | Pure function of role + evidence + graph + deadline; two students, two different roadmaps |
| Milestone engine | IMPLEMENTED | Evidence-gated completion (independent-evidence count + confidence + verification), not activity count |
| Milestone verification | IMPLEMENTED | Requires an independent `VERIFICATION`-source `SUCCESS`, not just repeated practice |
| Daily/weekly plans | IMPLEMENTED | Computed from available minutes, not a fixed template — verified by hand-checking the real 60-minute allocation in `demo-output/daily-plan.json` |
| Deadline adaptation | PARTIAL | Urgency term in the priority formula + a real `atRisk` heuristic; not a calibrated effort-estimation model |
| Time adaptation | IMPLEMENTED | Daily plan shape (review/transfer/verification blocks) scales with `dailyMinutes`, tested at multiple time budgets |
| Missed-day recovery | IMPLEMENTED | Regenerates fresh from current priorities; does not replay stale blocks as backlog |
| Role switching | IMPLEMENTED | Evidence is keyed by skill, not by role, so it's automatically reusable across a role change; history preserved |
| Goal switching | IMPLEMENTED | Same mechanism as role switching |
| Language adaptation | PARTIAL | Data model supports it (`evidence.language`, `evidence.failureCategory`); `SYNTAX`-category failures are weighted much less harshly than `LOGIC` failures in the mastery update. Full syntax-vs-logic classification depends on a real code-execution sandbox's output, which doesn't exist here |
| Exploration (unknown-skill capacity) | IMPLEMENTED | `UNKNOWN` skills get `EXPLORATION` activity type and moderate (not top, not zero) priority automatically |
| Interleaving | PARTIAL | Milestones interleave related skills naturally via layer + priority ordering; no dedicated spaced-interleaving scheduler beyond that |
| Spaced review | PARTIAL | `REVIEW_STALE_DAYS` config + a review block in the daily-plan allocation exist; a dedicated background job that proactively reinserts stale-mastery skills into the roadmap is not built |
| Readiness model | IMPLEMENTED | Weighted per-category dimensions, unit-tested |
| Readiness gates | IMPLEMENTED | A 0.9 composite score is verified (by test) to stay capped below READY without recent verification — the gate can only pull a state down, never manufacture one |
| Roadmap versioning | IMPLEMENTED | 4 real, immutable versions in the demo run; nothing UPDATEd in place |
| Roadmap events / audit log | IMPLEMENTED | Real event rows for every transition in the demo run |
| "Why this / why now" explanation | IMPLEMENTED | Templated from the real priority breakdown and gap status; optional AI polish is schema-validated with a safe fallback |
| Student dashboard / roadmap visualization | DEMO ONLY | A real interactive artifact rendering the actual v1–v4 captured JSON (see below) — not a production multi-page frontend with its own routing/auth/build pipeline |
| Skill detail view | IMPLEMENTED (API) / DEMO ONLY (UI) | `GET /roadmap/skills/:id` is real and complete; the dashboard artifact renders a subset of it |
| TPO/cohort aggregation | PARTIAL | One real, authorized, aggregate-only endpoint over real seeded multi-student data; no cohort/institution management CRUD around it |
| Security / ownership checks | IMPLEMENTED | Verified live in the demo run against a second real student, not just asserted |
| Auth mechanism itself | DEMO ONLY | Real signed-token verification and ownership enforcement; the *login* step is a stand-in for Supabase Auth/OAuth (see `docs/SECURITY.md`) |
| RLS | NOT IMPLEMENTED (SQLite has none) | Application-layer equivalent is implemented instead; reference Postgres RLS policies are included in `docs/SECURITY.md` |
| Idempotency | IMPLEMENTED | Unique partial indexes + diff-gated recalculation; tested (`generateOrGetRoadmap` called twice → same version; a second identical `FAIL` → no new version) |
| Transactions | IMPLEMENTED | `withTransaction()` wraps every multi-table recalculation write |
| Concurrency under real contention | NOT IMPLEMENTED | The mechanisms that should prevent it (unique indexes, transactions) are real; no test fires concurrent requests to prove it |
| Failure recovery (AI unavailable) | IMPLEMENTED | By construction — no code path depends on AI succeeding |
| Failure recovery (DB unavailable) | PARTIAL | SQLite/`better-sqlite3` failures propagate as errors rather than being silently swallowed; no retry/circuit-breaker layer |
| Background job architecture | NOT IMPLEMENTED | Recalculation runs synchronously in the request path; the function boundary (`recalculate()`) is already isolated enough to move behind a queue later without a rewrite, but no queue exists here (deliberately — Phase 54 says not to introduce infrastructure that isn't needed) |
| Tests | IMPLEMENTED | 38 tests, real run, real 3-bug catch — see `docs/TESTING.md` |
| Documentation | IMPLEMENTED | This set of docs describes only what's actually in the repository |

## 4. What I'd do next with more time/infrastructure

1. Stand up a real Postgres/Supabase project and port the schema + RLS
   policies already drafted in `docs/SECURITY.md`.
2. Replace `computeAtRisk()`'s heuristic with an effort model calibrated
   against real historical time-to-mastery data (which doesn't exist yet
   because there are no real students).
3. Build the spaced-review background job and a general milestone-DAG
   (rather than a linear chain) if a role blueprint ever needs one skill to
   gate two independent downstream branches simultaneously.
4. Move recalculation behind a real queue once request volume justifies it
   — the function boundary is already there.
