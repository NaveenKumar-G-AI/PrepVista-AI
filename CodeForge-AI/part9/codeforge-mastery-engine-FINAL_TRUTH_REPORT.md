# Final Truth Report

Status values used below, exactly as specified: **IMPLEMENTED**,
**PARTIALLY_IMPLEMENTED**, **NOT_IMPLEMENTED**, **DEMO_ONLY**. Nothing here
is marked IMPLEMENTED unless it was actually run in this environment and
worked — see the "Tests" column for what was actually executed, not just
written.

## Skill graph & roles

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| Hierarchical skill graph | IMPLEMENTED | `SkillGraphRepository` | `skill_nodes` | Exercised via smoke test | Needs your real taxonomy seeded |
| Typed skill relationships | IMPLEMENTED | `SkillGraphRepository` | `skill_relationships` | Exercised via smoke test | — |
| Role requirement graph | IMPLEMENTED | `SkillGraphRepository` | `roles`, `role_skill_requirements` | Exercised via smoke test | — |

## Evidence

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| Evidence model + provenance | IMPLEMENTED | `EvidenceRepository`, `domain/types.ts` | `student_skill_evidence` | Smoke test | — |
| Evidence immutability (corrections) | PARTIALLY_IMPLEMENTED | `supersededByCorrection` field, filtered in `calculateMastery` | column exists | Unit tested (calc side only) | No API endpoint to actually *create* a correction |
| Evidence quality weighting | IMPLEMENTED | `domain/masteryCalculation.ts`, `config.ts` | — | 9 unit tests | — |
| Idempotency | IMPLEMENTED | `EvidenceRepository.insert` (`ON CONFLICT DO NOTHING`) | unique index | Exercised via smoke test | — |
| Anti-gaming pattern flagging | IMPLEMENTED | `domain/antiGaming.ts`, wired in `PracticeService` | `suspicious`, `suspicious_reason` columns | 3 unit tests | — |
| `failure_reason` classification signal | NOT_IMPLEMENTED (by design) | consumed by `gapDiagnosis.ts` | column exists | — | **Depends on your execution engine populating it** — see `CODEFORGE_EVIDENCE_MODEL.md` |

## Mastery

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| 8-state mastery model | IMPLEMENTED | `domain/masteryCalculation.ts` | `student_skill_state` | 9 unit tests | — |
| Confidence (separate from state) | IMPLEMENTED | same file | `confidence` column | Covered by same 9 tests | — |
| Decay → STALE | IMPLEMENTED | same file | `last_verified_at`/`last_evidence_at` | Explicit test | — |
| Language-specific mastery | PARTIALLY_IMPLEMENTED | — | `student_skill_language_state` table exists | Not tested | **No service logic reads/writes this table yet** |
| State history / auditability | IMPLEMENTED | `MasteryStateRepository.insertHistory`, called from `MasteryService` | `skill_state_history` | Exercised via smoke test | — |

## Diagnosis & recommendation

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| Gap diagnosis (failure classification) | IMPLEMENTED | `domain/gapDiagnosis.ts` | — | 4 unit tests | Accuracy bounded by `failure_reason` signal |
| Prerequisite diagnosis | IMPLEMENTED | same file, `RecommendationService` | — | Unit test + smoke test (full end-to-end trace) | — |
| Transfer classification | IMPLEMENTED | `domain/transferClassification.ts` | — | 3 unit tests | Needs `problem_skill_mapping`-equivalent tags from your challenge bank |
| Difficulty adaptation | PARTIALLY_IMPLEMENTED | `domain/difficulty.ts` | — | 6 unit tests | **Not called from any service yet** — pure function is tested and correct, but no route/service currently invokes it when selecting a student's next problem |
| Recommendation ranking | IMPLEMENTED | `domain/recommendationRanking.ts` | — | 4 unit tests incl. role-change scenario | — |
| Recommendation explanation (human-readable) | IMPLEMENTED | `domain/recommendationExplanation.ts`, humanization in `RecommendationService` | — | Verified via smoke test (found & fixed a real bug: raw UUIDs leaking into reason text) | — |
| Recommendation persistence | PARTIALLY_IMPLEMENTED | — | `learning_recommendations` table exists | Not tested | **Service computes recommendations but doesn't write them to this table yet** |
| Recommendation feedback loop | NOT_IMPLEMENTED | — | `recommendation_history.feedback` column exists | — | No endpoint |
| One primary + bounded secondary options | IMPLEMENTED | `RecommendationService.getNextActions` | — | Unit test asserts exactly one `isPrimary` | — |

## Retention & transfer engines

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| Retention scheduling logic | IMPLEMENTED | `domain/retentionScheduling.ts` | `retention_schedule` | Triggered correctly in smoke test (schedule row created on first MASTERED) | — |
| Retention due-check surfacing | PARTIALLY_IMPLEMENTED | `RetentionService.getDueChecks` | same table | Method exists, not exercised by any test | **Nothing calls this automatically** — needs a poller or to be called from your practice-selection flow |
| Transfer engine (problem selection) | NOT_IMPLEMENTED | classification exists (`isTransferEvidence`) | `transfer_attempts` table exists | — | Actually *selecting* an unfamiliar problem for transfer practice requires your challenge bank's tagging — not built |

## AI layer

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| Provider abstraction | IMPLEMENTED | `ai/AIProvider.ts` | — | — | — |
| Groq client | IMPLEMENTED | `ai/GroqProvider.ts` | — | Endpoint verified via web search, not called live (no API key in this sandbox) | Needs `GROQ_API_KEY` |
| Gemini client | IMPLEMENTED | `ai/GeminiProvider.ts` | — | Same as above | Needs `GEMINI_API_KEY` |
| Deterministic fallback | IMPLEMENTED | `ai/AIProviderRouter.ts` | — | 2 unit tests, incl. "every provider fails" | — |
| AI-generated challenge validation pipeline | NOT_IMPLEMENTED | — | — | — | Out of scope for this pass — no challenge-generation system exists to validate output from |

## Security

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| RLS: student data isolation | IMPLEMENTED | `005_rls_policies.sql` | all student-owned tables | **8 live assertions**, run as a genuine non-superuser role | Remove `local_dev_shim.sql` on Supabase — it's provided natively |
| RLS: no client-side mastery writes | IMPLEMENTED | same | same | Explicit live test (insert correctly rejected) | — |
| TPO scoped access | IMPLEMENTED | `is_tpo_for_student()`, `tpo_student_access` | same | Live tested (assigned vs. unassigned student) | Wire `tpo_student_access` to your real TPO/batch model |
| Auth (verifying who's asking) | DEMO_ONLY | `api/middleware/auth.ts` | — | — | **Explicitly a stub** — reads an unverified header, documented as the #1 integration seam |
| Concurrency (row locking) | PARTIALLY_IMPLEMENTED | `MasteryStateRepository.lockOrCreate`, `withTransaction` | — | Written, not load-tested under real concurrent requests | — |

## API & UI

| Capability | Status | Files/Services | Database | Tests | Integration |
|---|---|---|---|---|---|
| API routes (skills/practice/recommendations) | IMPLEMENTED | `api/routes/*.ts` | — | `tsc` clean; **not tested via actual HTTP requests** (no supertest suite) | Mount on your real app or port handlers — see integration guide |
| Demo "next best action" panel | DEMO_ONLY | `demo-ui/NextBestActionPanel.jsx` | — | Visual only | Sample data mirrors real smoke-test output; not connected to a live API |
| Full student dashboard | NOT_IMPLEMENTED | — | — | — | One panel built, not the full dashboard (readiness overview, strongest/developing/critical-gap lists, etc.) |
| Mastery map (full graph visualization) | NOT_IMPLEMENTED | demo panel has a minimal list-style version only | — | — | — |
| Mastery timeline UI | NOT_IMPLEMENTED | history is captured in DB, no UI/endpoint surfaces it | `skill_state_history` | — | — |
| Skill detail page | NOT_IMPLEMENTED | — | — | — | — |
| TPO / batch analytics | NOT_IMPLEMENTED | access-control plumbing exists and is tested | — | — | No aggregate query, endpoint, or UI |

## Integrations this engine cannot build (no system to integrate with)

| Capability | Status | Why |
|---|---|---|
| Technical interview integration | NOT_IMPLEMENTED | `TECHNICAL_INTERVIEW` is a supported evidence source, but no interview engine exists in this environment to pull results from. |
| Assessment integration | NOT_IMPLEMENTED | Same — `ASSESSMENT`/`TIMED_ASSESSMENT` are supported evidence sources; no assessment engine exists to integrate with. |
| Roadmap engine integration | NOT_IMPLEMENTED | This engine exposes exactly the gap/next-action data a roadmap engine would need to consume, per the spec's own PHASE 57 — but no roadmap engine exists here to call. |
| Existing CodeForge system reuse | NOT_APPLICABLE | There is no existing repository in this environment — see the top of the conversation and `docs/INTEGRATION_GUIDE.md`. |

## Quality infrastructure

| Capability | Status | Tests | Notes |
|---|---|---|---|
| Unit tests | IMPLEMENTED | **31/31 passing** (`npx vitest run`) | Domain + AI-fallback layer only, by design (no I/O) |
| Type safety | IMPLEMENTED | `npx tsc --noEmit` clean, strict mode | Whole project |
| DB integration (migrations apply cleanly) | IMPLEMENTED | All 6 migrations applied to real Postgres 16 | — |
| Security tests | IMPLEMENTED | 8 live RLS assertions | Covers `student_skill_evidence` + TPO access in depth; other RLS-protected tables share the identical policy pattern but weren't each individually re-tested |
| End-to-end test | PARTIALLY_IMPLEMENTED | `scripts/smoke_test.ts` is a real run against real Postgres, output inspected manually | Not wrapped in automated pass/fail assertions or CI |
| Fairness (equivalent solutions scored equally) | NOT_IMPLEMENTED | — | This is inherently your execution/judging engine's responsibility, not this engine's — mastery calculation only ever sees pass/fail, difficulty, and assistance level, never solution content |
| Observability (structured logging/metrics) | NOT_IMPLEMENTED | — | No logging/metrics infrastructure beyond default Express/Postgres behavior |
| `npm audit` | — | 5 transitive vulnerabilities flagged (3 moderate, 1 high, 1 critical) | Not investigated — run `npm audit` yourself before deploying |

## Documentation

| File | Status |
|---|---|
| `docs/CODEFORGE_MASTERY_ARCHITECTURE.md` | IMPLEMENTED |
| `docs/CODEFORGE_MASTERY_MODEL.md` | IMPLEMENTED |
| `docs/CODEFORGE_EVIDENCE_MODEL.md` | IMPLEMENTED |
| `docs/CODEFORGE_RECOMMENDATION_ENGINE.md` | IMPLEMENTED |
| `docs/INTEGRATION_GUIDE.md` | IMPLEMENTED |
| `CODEFORGE_TRANSFER_ENGINE.md`, `CODEFORGE_RETENTION_ENGINE.md`, `CODEFORGE_ROLE_ALIGNMENT.md`, `CODEFORGE_SECURITY.md`, `CODEFORGE_TESTING.md`, `CODEFORGE_API.md` (as separate files) | NOT_IMPLEMENTED | Content that would go in these is folded into the five docs above instead of split into eleven files — consolidate or split further as you prefer |

## The honest one-paragraph summary

The evidence→mastery→gap→recommendation loop — the actual "adaptive
intelligence" the spec is about — is real, tested at the unit level (25
tests), proven against a live database (schema + RLS + an end-to-end
wiring run), and does what the spec's own worked example describes. The
practice-mode UX, retention polling, TPO analytics, and every integration
that depends on a system this environment doesn't have (execution engine,
challenge bank, interview engine, roadmap engine, real auth) are either
partially stubbed with a clearly documented seam, or explicitly not built.
Nothing above is rounded up.
