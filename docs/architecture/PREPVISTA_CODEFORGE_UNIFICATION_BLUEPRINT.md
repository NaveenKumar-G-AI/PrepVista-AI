# PrepVista + CodeForge Unification Implementation Blueprint

Status: Phase 0 architecture for review. No production integration is authorized by this document.

Decision vocabulary: **REUSE** means keep as the authority; **EXTEND** means preserve and add through a later migration/interface; **SUPERSEDE** means run in parallel and retire only after validation; **KEEP DOMAIN-SPECIFIC** means retain behind an adapter; **DO NOT USE** means reject for the unified architecture; **NEEDS DECISION** means product/legal evidence is still required.

## Guardrails and architectural invariants

PrepVista remains the only owner of identity, authentication, tenancy, billing, entitlements, frontend shell, AI provider policy, evidence, readiness, reports, and deployment. CodeForge contributes assessed deterministic algorithms only. The current interview path remains authoritative and unchanged throughout shadowing.

The unified flow is:

`authenticated profile -> career target -> activity/session/attempt -> domain result -> adapter -> evidence ledger -> capability state -> shadow readiness -> blocker -> next action -> versioned report/aggregate`

Unknown is a coverage state, never a score of zero and never proof of weakness. No student source is executed in the PrepVista API or the proposed technical-intelligence service.

Repository evidence: PrepVista composes its routers in [`app/main.py`](../../app/main.py#L442), resolves users in [`app/dependencies.py`](../../app/dependencies.py#L405), and owns providers through [`app/ai/registry.py`](../../app/ai/registry.py#L39). CodeForge currently composes an independent server in [`CodeForge-AI/src/server.ts`](../../CodeForge-AI/src/server.ts#L80), so that composition is rejected.

## A. Existing PrepVista architecture affected

| Surface | Current authority | Future effect |
|---|---|---|
| Identity/auth | `profiles.id`, Supabase JWT resolution, `auth_identity_links`; [`dependencies.py`](../../app/dependencies.py#L328), [`auth_identity.py`](../../app/services/auth_identity.py#L55) | REUSE without a second identity |
| Tenancy | `organizations`, `organization_students`, `organization_admins`; migration 017 explicitly makes `organization_id` canonical ([`017_college_organization.sql`](../../app/database/migrations/017_college_organization.sql#L15)) | REUSE; reconcile migration 029's `institution_id` |
| Interview | `interview_sessions`, `conversation_messages`, `question_evaluations`, `skill_scores`, `answer_quality_flags`; [`001_initial_schema.sql`](../../app/database/migrations/001_initial_schema.sql#L198), [`interviewer_session.py`](../../app/services/interviewer_session.py#L290) | KEEP DOMAIN-SPECIFIC; add an asynchronous adapter later |
| Dashboard | `/dashboard` B2C and `/student-dashboard` organization student; redirect split in [`dashboard/page.tsx`](../../frontend/src/app/dashboard/page.tsx#L130) and [`student-dashboard/page.tsx`](../../frontend/src/app/student-dashboard/page.tsx#L72) | Preserve routes; converge shared capability components, not entitlements |
| Billing/entitlement | `profiles.plan`, `user_plan_entitlements`, `org_plan_allocations`, `organization_students.has_career_access`; [`plan_access.py`](../../app/services/plan_access.py#L176), [`quota.py`](../../app/services/quota.py#L124) | REUSE; technical quotas require a new product decision |
| Readiness | Interview score tiers, placement readiness heuristics, migration-029 snapshots; [`placement_readiness.py`](../../app/services/placement_readiness.py#L113), [`org_college_helpers.py`](../../app/routers/org_college_helpers.py#L167) | KEEP current user-facing; new model is shadow-only |
| Reports | `/reports/{session_id}`, current PDF and sharing; [`reports.py`](../../app/routers/reports.py#L72), [`report_generator.py`](../../app/services/report_generator.py#L358) | KEEP; unified reports use separate immutable snapshots |
| TPO | `/org/my/*` authorization and analytics; [`main.py`](../../app/main.py#L456), [`org_college_analytics.py`](../../app/routers/org_college_analytics.py#L43) | EXTEND inside existing Command Center |
| Analytics | `usage_events`, `/events`; [`001_initial_schema.sql`](../../app/database/migrations/001_initial_schema.sql#L468), [`events.py`](../../app/routers/events.py#L24) | EXTEND event names and metadata allow-list |
| Database migration | Ordered, checksummed SQL; [`connection.py`](../../app/database/connection.py#L593) | New additive migrations only; never edit history |
| Deployment | One Dockerized FastAPI backend plus heartbeat jobs; [`render.yaml`](../../render.yaml) | Unchanged in Phase 0; a private stateless sidecar is a later conditional addition |

CodeForge evidence: its server exposes its own `/api`, static UI, and lifecycle ([`server.ts`](../../CodeForge-AI/src/server.ts#L97)); these overlap every PrepVista authority above and must not be reused.

## B. Exact CodeForge engines to extract

“Extract” means first freeze and isolate into a dependency-minimal TypeScript library. It does not mean copy the entire directory.

| Candidate boundary | Exact source | Decision and constraint |
|---|---|---|
| Correctness/failure clustering | [`correctness/classify.ts`](../../CodeForge-AI/src/engine/correctness/classify.ts#L25), [`requirementCoverage.ts`](../../CodeForge-AI/src/engine/correctness/requirementCoverage.ts#L15), [`regression.ts`](../../CodeForge-AI/src/engine/correctness/regression.ts#L13), [`confidence.ts`](../../CodeForge-AI/src/engine/correctness/confidence.ts#L8) | EXTRACT after parity. Accept supplied test results only until sandboxing; never run tests here. |
| Deterministic code quality | [`quality/rules.ts`](../../CodeForge-AI/src/engine/quality/rules.ts#L387), [`quality/scoring.ts`](../../CodeForge-AI/src/engine/quality/scoring.ts#L12), [`parsers/ir.ts`](../../CodeForge-AI/src/parsers/ir.ts) | EXTRACT supported-language rules. AI findings remain non-scoring, as current scoring already enforces. |
| Understanding | [`understanding/engine.ts`](../../CodeForge-AI/src/engine/understanding/engine.ts#L37) | EXTRACT dimension aggregation and validated probe contracts. Replace `Date.now()` IDs with caller IDs; do not trust model grading without grounding. |
| Debugging process | [`debugging/stateMachine.ts`](../../CodeForge-AI/src/engine/debugging/stateMachine.ts#L58), [`debugging/skillModel.ts`](../../CodeForge-AI/src/engine/debugging/skillModel.ts#L18) | EXTRACT state and process scoring over supplied actions/results only. |
| Mastery principles | [`mastery.ts`](../../CodeForge-AI/src/engine/mastery.ts#L32) | REFERENCE/ADAPT, not direct authority. Preserve recency, difficulty, independence, repeated mistakes, prerequisites, transfer and verification after calibration. |
| Evidence signal | [`signal/normalizer.ts`](../../CodeForge-AI/src/engine/signal/normalizer.ts#L22) | DO NOT EXTRACT AS-IS: it defaults independence to `1.0` and transfer to `false` ([lines 42–43](../../CodeForge-AI/src/engine/signal/normalizer.ts#L42)). Use its fixtures to inform a PrepVista contract. |
| Gap/prerequisite analysis | [`gap/analyzer.ts`](../../CodeForge-AI/src/engine/gap/analyzer.ts#L33) | ADAPT. Preserve `UNKNOWN`, but remove the parallel weighted-readiness authority and never infer unknown magnitude as observed weakness. |
| Adaptive selection | [`adaptive/selector.ts`](../../CodeForge-AI/src/engine/adaptive/selector.ts#L386), [`adaptive/pathState.ts`](../../CodeForge-AI/src/engine/adaptive/pathState.ts#L32) | ADAPT after weight validation. Make clock, weights and candidate set explicit and versioned. |
| Technical readiness | [`readiness/engine.ts`](../../CodeForge-AI/src/engine/readiness/engine.ts#L31) | PARITY REFERENCE ONLY. It converts missing skills to zero and calculates a weighted average; it cannot be unified readiness authority. |
| Complexity | [`complexity/index.ts`](../../CodeForge-AI/src/engine/complexity/index.ts#L24) | CONDITIONAL EXTRACT for explicitly supported Python patterns with `analysis_method`, `language_support` and confidence. No multi-language claim. |
| Reasoning/defence | [`reasoning/verifiers.ts`](../../CodeForge-AI/src/engine/reasoning/verifiers.ts#L58), [`consistency/index.ts`](../../CodeForge-AI/src/engine/consistency/index.ts#L21) | ADAPT deterministic claim verification; model-extracted claims require strict schemas and evidence references. |
| Review | [`review/engine.ts`](../../CodeForge-AI/src/engine/review/engine.ts#L22) | ADAPT over deterministic quality findings. |
| Next-action concepts | [`coach/nextBestAction.ts`](../../CodeForge-AI/src/engine/coach/nextBestAction.ts#L30) | REFERENCE only; PrepVista owns cross-domain selection and entitlement filtering. |

The Phase 0 parity contract is executable in [`tests/phase0.golden-parity.test.ts`](../../CodeForge-AI/tests/phase0.golden-parity.test.ts). PrepVista has no corresponding technical engines yet; its current deterministic interview scoring remains in [`evaluator_scoring.py`](../../app/services/evaluator_scoring.py).

## C. CodeForge components explicitly rejected

- Express server/router/static frontend: [`server.ts`](../../CodeForge-AI/src/server.ts#L97).
- Repository registry and database schema/migrations: [`repositories/index.ts`](../../CodeForge-AI/src/repositories/index.ts#L654) and quarantined `CodeForge-AI/db/`.
- In-memory cohort/interview registries and empty intelligence ports: [`engine/index.ts`](../../CodeForge-AI/src/engine/index.ts#L202).
- Authentication, tenant identity, and client `x-org-id`: [`cohort-intelligence/index.ts`](../../CodeForge-AI/src/api/routes/cohort-intelligence/index.ts#L52). PrepVista's [`require_org_admin`](../../app/dependencies.py#L748) is authoritative.
- Billing, role authority, reports, analytics authority, and standalone UI.
- CodeForge AI provider/gateway and mock fallback: [`ai/providers.ts`](../../CodeForge-AI/src/ai/providers.ts#L610). Use PrepVista [`app/ai/registry.py`](../../app/ai/registry.py#L39).
- Every host-process executor: [`localProcessProvider.ts`](../../CodeForge-AI/src/execution/localProcessProvider.ts#L8), [`executor.ts`](../../CodeForge-AI/src/engine/personalized-challenge-engine/execution/executor.ts#L413), [`runner.ts`](../../CodeForge-AI/src/engine/hidden-test-engine/sandbox/runner.ts#L142), and [`validation-pipeline.ts`](../../CodeForge-AI/src/engine/hidden-test-engine/ai/validation-pipeline.ts#L112).
- Generated `dist/`, vendor `node_modules/`, `parts-archive/`, and database copies, enforced by [`.gitignore`](../../.gitignore).

## D. Domain ownership matrix

| Concern | PrepVista | Technical intelligence | Database authority |
|---|---|---|---|
| Identity/session | Owns | Receives opaque request context only | PrepVista |
| Organization/membership | Owns and derives server-side | Must not infer or persist | PrepVista |
| Billing/entitlement | Owns | Receives authorized operation limits | PrepVista |
| Activity lifecycle | Owns | Pure request/result computation | PrepVista |
| Technical artifact | Owns encrypted storage and retention | Processes bounded content transiently | PrepVista |
| Algorithm output | Validates and persists versioned result | Computes deterministic result | PrepVista |
| Evidence normalization | Owns canonical adapter | Returns domain facts, not readiness | PrepVista |
| Capability/readiness/blocker/NBA | Owns | No authority | PrepVista |
| AI | Owns provider policy, budgets and audit | No provider calls in V1 | PrepVista |
| UI/report/analytics | Owns | None | PrepVista |
| Execution | Future isolated gateway/worker | Not in intelligence service | Separate future sandbox plane |

This corrects CodeForge's independent authorities in [`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L4037) while preserving PrepVista's existing boundaries in [`main.py`](../../app/main.py#L442).

## E. Capability taxonomy

Authoritative top-level domains are stable slugs: `reasoning`, `technical`, `communication`, `interview`. They are product concepts, not implementation brands. Capabilities are versioned definitions; labels may change without changing IDs.

Initial technical capability slugs: `programming-fundamentals`, `problem-understanding`, `algorithmic-reasoning`, `data-structures`, `correctness`, `complexity-reasoning`, `space-reasoning`, `code-quality`, `debugging`, `edge-case-reasoning`, `technical-explanation`, `technical-defence`, `trade-off-reasoning`, `adaptation`, `transfer`.

Initial interview capability slugs: `answer-relevance`, `technical-depth`, `specificity`, `evidence-use`, `ownership`, `answer-structure`, `follow-up-resilience`, `project-defence`, `decision-defence`, `interview-execution`.

Migration 029's `taxonomy_term` supports only training, assessment, and intervention enum domains ([`029_training_readiness.sql`](../../app/database/migrations/029_training_readiness.sql#L5)); it therefore remains organization domain taxonomy and cannot be the global capability authority. CodeForge mixes many branded/part-specific types in [`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L2013); none become public taxonomy IDs.

## F. Skill taxonomy

A capability is a durable outcome area; a skill is an observable, evidence-bearing unit under one capability. Example: `technical/debugging` contains `failure-recognition`, `reproduction`, `localization`, `hypothesis-formation`, `evidence-gathering`, `experiment-design`, `root-cause-analysis`, `fix-quality`, and `regression-verification`, matching actual CodeForge dimensions in [`debugging/skillModel.ts`](../../CodeForge-AI/src/engine/debugging/skillModel.ts#L27).

Interview rubric mappings are explicit and versioned, never based on matching display text. PrepVista's current 14-category rubric is enumerated in [`org_college_helpers.py`](../../app/routers/org_college_helpers.py#L49). `technical_depth` may produce interview capability evidence and, only when a specific grounded explanation criterion exists, technical skill evidence. Generic scores such as confidence or role fit must not be silently mapped.

Every skill definition has stable slug, capability ID, description, measurement contract, supported source domains, active version, and deprecation link. CodeForge's `SkillEvidencePoint` ([`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L3367)) informs but does not define PrepVista taxonomy.

## G. Prerequisite graph

Use versioned directed edges between skill definitions. Initial graph:

`programming-fundamentals -> data-structures -> algorithmic-reasoning -> complexity-reasoning -> technical-defence`

Additional edges include `problem-understanding -> algorithmic-reasoning`, `correctness -> transfer`, `debugging/localization -> debugging/root-cause-analysis -> debugging/fix-quality`, and `answer-relevance -> follow-up-resilience` where validated.

Publishing a graph version requires cycle detection, no self-edge, active endpoints, and a documented rationale. State calculation reports both surface gap and nearest unmet root prerequisite. CodeForge currently treats a missing dependency as blocked in [`gap/analyzer.ts`](../../CodeForge-AI/src/engine/gap/analyzer.ts#L49); PrepVista must preserve the graph idea while retaining unknown coverage.

## H. Generic activity model

Canonical names are `learning_activities` (versioned templates), `activity_sessions` (one learner interaction), and `activity_attempts` (one submitted attempt). Types include `TECHNICAL_CHALLENGE`, `TECHNICAL_DEFENCE`, `DEBUGGING_WORKOUT`, `CODE_REVIEW`, `INTERVIEW_SESSION`, `COMMUNICATION_PRACTICE`, `APTITUDE_DIAGNOSTIC`, `RETENTION_CHECK`, and `TRANSFER_TEST`.

Existing `interview_sessions` is not migrated initially. An adapter associates it to an optional shadow activity/session reference. Migration 029's `training_session` and `assessment_attempt` remain their domain records ([`029_training_readiness.sql`](../../app/database/migrations/029_training_readiness.sql#L107)); they may emit events without being rewritten. CodeForge's learning-session functions ([`learning-session/index.ts`](../../CodeForge-AI/src/engine/learning-session/index.ts#L124)) are product references, not persistence authority.

## I. Unified evidence schema

Authoritative name: `capability_evidence`. One row is an immutable observation, not current state.

Required fields: `id` (UUIDv7), `schema_version`, `profile_id`, nullable `organization_id`, `visibility_scope`, `capability_id`, `skill_id`, `source_domain`, `source_type`, nullable `activity_id/session_id/attempt_id`, `source_record_type/source_record_id`, `measurement_type`, `raw_value_json` or protected artifact reference, nullable `normalized_value`, `polarity`, nullable `confidence`, nullable `evidence_quality`, nullable `difficulty`, nullable `independence_level`, nullable `verification_context`, nullable `transfer_context`, `algorithm_name/version`, nullable `rubric_version`, `observed_at`, `ingested_at`, `idempotency_key`, `correlation_id`, nullable `supersedes_evidence_id`, `status`, `reason_code`, and bounded `metadata_json`.

Unknown measured attributes are SQL `NULL`, not favorable defaults. This explicitly rejects CodeForge normalizer defaults at [`normalizer.ts`](../../CodeForge-AI/src/engine/signal/normalizer.ts#L38). Migration 029's `skill_measurement` lacks this provenance and has no canonical student/skill foreign keys ([`029_training_readiness.sql`](../../app/database/migrations/029_training_readiness.sql#L180)); it is a legacy bridge, not the new ledger.

Corrections append a replacement pointing to `supersedes_evidence_id`; retractions append/control status without rewriting historical meaning. State builders consider only the latest valid lineage.

## J. Evidence normalization contract

Input is a versioned domain result plus trusted server context. Output is zero or more canonical evidence commands. The adapter must:

1. validate source schema and ownership;
2. resolve canonical capability/skill mappings by mapping version;
3. preserve raw units and attach algorithm/rubric version;
4. normalize only when a published scale exists;
5. leave unobserved confidence/difficulty/independence/transfer/verification null;
6. flag suspicious or contradictory evidence without silently excluding it;
7. compute deterministic idempotency as `source_domain:source_type:source_record_id:skill_id:algorithm_version:mapping_version`;
8. emit through an outbox transaction and insert with a unique idempotency constraint.

CodeForge's `normalizeEvidence` generates a stable source-derived ID ([`normalizer.ts`](../../CodeForge-AI/src/engine/signal/normalizer.ts#L30)), which is useful; its hardcoded semantics are not. PrepVista's evaluators already normalize plan-specific scoring in [`evaluator_feedback.py`](../../app/services/evaluator_feedback.py#L1348), so adapters must consume stored final facts rather than rerun an evaluator.

## K. Interview adapter design

`InterviewEvidenceAdapter` reads only a finished `interview_sessions` row and its stored `question_evaluations`, `skill_scores`, and quality flags. It writes no current interview tables. Completion commits current behavior plus a future `domain_event_outbox` event in the same transaction; an idempotent worker creates evidence and recalculates shadow state. Adapter failure never fails interview completion.

Mappings require a question/evaluation criterion to support the target skill. An answer to a complexity follow-up may support `technical/complexity-reasoning`; a generic `technical_depth` score alone may not. Historical rows lacking rubric versions, independence, transfer, or verification leave those fields null.

Evidence: interview writes occur in [`interviewer_session.py`](../../app/services/interviewer_session.py#L1303) and reports read those stored evaluations in [`reports.py`](../../app/routers/reports.py#L123). CodeForge's separate technical interview repository is in-memory ([`engine/index.ts`](../../CodeForge-AI/src/engine/index.ts#L221)) and is rejected.

## L. Technical adapter design

`TechnicalEvidenceAdapter` receives a persisted, schema-validated `technical_analysis_result`; it never calls a shell. It maps deterministic facts such as correctness classification, quality findings, understanding responses, or debugging actions to canonical evidence. Each output references the PrepVista profile and activity lineage, exact engine/contract version, actual context, and protected artifact hash.

Correctness is accepted only from a trusted supplied-result source now, or a future sandbox attestation. Browser-claimed test results are `UNVERIFIED` and cannot satisfy independent verification. CodeForge separates deterministic correctness from AI in [`correctness/classify.ts`](../../CodeForge-AI/src/engine/correctness/classify.ts#L25); PrepVista enforces identity before all writes through [`get_current_user`](../../app/dependencies.py#L405).

## M. Technical service architecture

Future boundary: private stateless `technical-intelligence` service containing only extracted pure engines and schemas. Request includes `request_id`, operation, engine version, bounded source/context or supplied results, locale/language, and deadline. It contains no user DB, auth accounts, organization model, billing, frontend, report store, readiness logic, AI gateway, or execution provider. Response contains deterministic facts, limitations, timings, and content hash.

PrepVista authorizes and rate-limits, converts profile data to an opaque request, calls over a private network with short-lived service credentials, validates the response, and persists results. The service logs no raw source. Current CodeForge server violates this boundary by constructing repositories and serving UI ([`server.ts`](../../CodeForge-AI/src/server.ts#L80)); current PrepVista remains the public FastAPI entry point ([`main.py`](../../app/main.py#L442)).

## N. Service-vs-port decision

**Recommendation: TypeScript extraction followed by a private sidecar, conditional on gates.** Do not port algorithms to Python first.

| Criterion | TypeScript private service | Python port |
|---|---|---|
| Parity | Lower initial algorithm drift; current source and fixtures run directly | High drift across 340 source files and numerous implicit constants |
| Deployment | Adds one private Node service, auth, timeouts and circuit breaking | Keeps one runtime |
| Latency/cost | One internal hop; batchable; service cost | No hop; engineering/validation cost higher |
| Security | Small allow-listed package can be isolated; must strip executors | Same-process blast radius if unsafe logic is ported |
| Observability | Separate engine SLO/version metrics | Shared backend telemetry |
| Maintenance | Requires Node 20 and two-language ownership | One runtime after expensive parity proof |

Evidence favoring TypeScript preservation is the working pure fixture suite and engine sources such as [`quality/scoring.ts`](../../CodeForge-AI/src/engine/quality/scoring.ts#L12). Evidence against deploying the current service is its failed build and unsafe composition documented in [`CODEFORGE_PHASE0_BASELINE.md`](CODEFORGE_PHASE0_BASELINE.md). Re-evaluate a Python port only per engine after golden-corpus equivalence, not by preference.

## O. Capability-state algorithm

Authoritative materialized name: `student_capability_states`. Key is profile + target-role version + skill + model version. Public state enum: `NOT_ENOUGH_EVIDENCE`, `EMERGING`, `DEVELOPING`, `DEMONSTRATED`, `VERIFIED`.

Algorithm:

- Load valid evidence as of a calculation watermark; preserve event time and ingestion time.
- Compute coverage separately from strength.
- Weight only known attributes. Apply calibrated source reliability, recency by skill, observed difficulty, assistance/independence, and context diversity.
- Detect contradictions; lower confidence and request verification rather than averaging the conflict away.
- Apply repeated-mistake penalties and prerequisite caps only when configured/versioned.
- `VERIFIED` requires sufficient independent evidence plus an observed transfer/high-stakes criterion specified by the skill contract.
- Store explanation inputs, contributing evidence IDs, exclusions, model version, and watermark.

CodeForge already exposes useful primitives in [`mastery.ts`](../../CodeForge-AI/src/engine/mastery.ts#L110), but its empty evidence result is numeric zero and its states begin at novice. PrepVista's new public contract separates zero evidence from weakness.

## P. Readiness architecture

Authoritative shadow name: `unified_readiness_snapshots`. Readiness is target-role/version specific and hierarchical across reasoning, technical, communication, and interview. It stores `coverage_state`, optional score band, confidence, gates, primary blocker reference, explanations, contributing state versions, model version, and calculation watermark.

Rules:

- Any required critical skill with insufficient coverage yields `NOT_ENOUGH_EVIDENCE`, not `NOT_READY`.
- A confirmed critical gap gates `READY`, regardless of aggregate score.
- Domain summaries are confidence-aware; no unsupported hiring probability is emitted.
- Contradictory or stale critical evidence causes `VERIFICATION_REQUIRED` and an NBA, not a confident claim.
- A readiness snapshot never changes after creation.

Current user-facing readiness remains unchanged. PrepVista currently uses weighted pillars and hand-tuned fallback probability curves ([`placement_readiness.py`](../../app/services/placement_readiness.py#L31)); CodeForge also averages skills and maps absent skills to zero ([`readiness/engine.ts`](../../CodeForge-AI/src/engine/readiness/engine.ts#L40)). Neither becomes the unified model.

## Q. Blocker engine

`blocker_snapshots` ranks eligible blockers using versioned factors: target-role criticality, verified gap severity, confidence, prerequisite reach, placement-stage impact, recency, transfer failure, recurrence, and feasible intervention. Unknown areas are `EVIDENCE_GAP` blockers, not weakness blockers.

Expose one primary and optional secondary blockers with evidence IDs and plain-language reasons. Prevent oscillation with configurable hysteresis: a challenger must materially exceed the current blocker and persist across two recalculations or a time window; a verified critical regression may bypass cooldown. Exact thresholds require calibration.

CodeForge can identify root gaps in [`gap/analyzer.ts`](../../CodeForge-AI/src/engine/gap/analyzer.ts#L84), while PrepVista currently surfaces score/risk tiers in [`org_college_helpers.py`](../../app/routers/org_college_helpers.py#L78). The new engine stays shadow-only.

## R. Next Best Action engine

Authoritative name: `next_action_assignments`. Input is the primary blocker, role/version, prerequisites, evidence coverage, recency, transfer/verification need, available time, entitlement, recent activity, and candidate inventory. Output is one action with `what`, `why`, expected duration, proof required, eligibility reason, selector version, and expiry.

Deterministic hard filters precede ranking. The action may be technical practice, code defence, debugging, code review, interview retry, retention check, or transfer test. It cannot recommend an unavailable entitlement or unsafe execution. CodeForge's candidate filtering and scoring is in [`adaptive/selector.ts`](../../CodeForge-AI/src/engine/adaptive/selector.ts#L393); PrepVista quota enforcement remains in [`quota.py`](../../app/services/quota.py#L41).

## S. Student dashboard architecture

Do not collapse `/dashboard` and `/student-dashboard` routes in the first integration. Both use the same dashboard API today, but B2C includes plan/referral controls while organization students are redirected to a focused, college-managed workspace ([`dashboard/page.tsx`](../../frontend/src/app/dashboard/page.tsx#L140), [`student-dashboard/page.tsx`](../../frontend/src/app/student-dashboard/page.tsx#L3)). Auth callback routing also preserves this split ([`auth/callback/page.tsx`](../../frontend/src/app/auth/callback/page.tsx#L61)).

Convergence strategy: build shared read-only components—TargetRole, ShadowReadinessCard, CurrentBlocker, NextMission, PlacementTwin, RecentEvidence, Coverage—and compose them into each dashboard behind independent flags. B2C keeps billing; B2B uses organization entitlements and never displays self-purchase unless approved. Later, route convergence can occur only after entitlement and navigation parity tests.

## T. Technical experience architecture

Initial safe experiences inside the existing Next.js shell:

- code comprehension and defence over user-supplied text;
- deterministic, bounded static quality checks for an explicitly supported language;
- debugging reasoning from supplied failing-test output and action choices;
- code review and changed-constraint questions;
- supplied-result correctness clustering clearly labeled `unverified` unless attested.

No run button may invoke a host process. Requests have byte/line limits, supported-language declarations, abortable timeouts and retention consent. The landing demo remains browser-safe until an approved anonymous non-executing endpoint exists. CodeForge executors are listed in section C; PrepVista's active landing page remains [`frontend/src/app/page.tsx`](../../frontend/src/app/page.tsx).

## U. Unified report architecture

Authoritative name: `unified_report_snapshots`. A report stores the exact evidence/state/readiness/blocker/NBA versions used, generated-at time, target-role version, visibility scope, model versions, and a rendered payload/object reference. It never recalculates when reopened.

Existing interview report URLs, PDF generation, sharing, and premium locks remain unchanged ([`reports.py`](../../app/routers/reports.py#L381), [`report/[id]/page.tsx`](../../frontend/src/app/report/[id]/page.tsx#L209)). Unified reports are a new route/type with technical/interview sections, cross-domain findings, confidence, unknown areas, trajectory, evidence timeline, and proof required. CodeForge report services ([`report-generation-service.ts`](../../CodeForge-AI/src/engine/report/services/report-generation-service.ts)) are rejected as report authority.

## V. TPO Command Center architecture

Extend existing `/org/my` pages and authorization. Views: executive overview, capability heatmap, technical intelligence, interview intelligence, readiness distribution, role readiness, blockers, interventions, student drill-down, cohort comparison, drive readiness, growth, evidence coverage, reports and outcomes.

Privacy rules:

- organization is derived from authenticated `OrgAdminProfile`, never request headers;
- aggregate cells below a configurable minimum cohort size (proposed default 10, NEEDS DECISION) are suppressed, not zeroed;
- drill-down requires an active organization-student membership plus role permission and audit event;
- raw source, transcript and resume content is student-private unless explicit scoped consent/legal basis exists;
- removed students disappear from live drill-down and aggregates are rebuilt; lawful deidentified historical outcomes may remain;
- exports apply the same scope and suppression.

PrepVista already filters organization students in [`org_college_students.py`](../../app/routers/org_college_students.py#L356) and exposes Command Center data in [`org_college_analytics.py`](../../app/routers/org_college_analytics.py#L43). CodeForge's trusted `x-org-id` approach ([`cohort-intelligence/index.ts`](../../CodeForge-AI/src/api/routes/cohort-intelligence/index.ts#L52)) is prohibited.

## W. Analytics/event taxonomy

Extend `usage_events`; do not create a second analytics authority. Canonical names include `technical.activity_started`, `technical.attempt_submitted`, `technical.analysis_completed`, `technical.probe_answered`, `technical.debug_started/completed`, existing interview lifecycle equivalents, `evidence.created/retracted`, `capability.updated`, `shadow_readiness.updated`, `blocker.changed`, `mission.assigned/started/completed`, `report.generated`, `tpo.student_viewed`, `tpo.cohort_report_generated`, and `tpo.intervention_created`.

Every event has schema version, actor/profile/organization scope, correlation ID, source ID and bounded non-sensitive metadata. Raw code, answers, resumes, emails and transcripts are forbidden in analytics. Current ingestion is [`events.py`](../../app/routers/events.py#L24); CodeForge's broad event types in [`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L3568) are reference only.

## X. Security model

- Authenticate with PrepVista JWT dependencies and derive profile/organization server-side.
- Authorize own-profile, organization membership and staff role separately; deny cross-tenant identifiers before queries.
- RLS mirrors application rules and treats the service role as write-only through constrained backend paths.
- Apply per-user and per-organization rate limits, strict Zod/Pydantic contracts, source byte limits, content-type allow-lists and timeouts.
- Encrypt technical artifacts at rest; redact source/resume/transcript content from logs, traces and AI prompts.
- Deterministic operations stay deterministic. Any later AI call uses PrepVista's registry, budget, prompt-injection defenses, grounded structured output and audit.
- Sanitize rendered findings and PDFs against XSS/content injection.
- Internal calls use short-lived audience-bound credentials, replay-resistant request IDs, private networking and response validation.

PrepVista's auth boundary is [`dependencies.py`](../../app/dependencies.py#L405) and account deletion is [`account.py`](../../app/routers/account.py#L170). CodeForge's independent security control plane and host-process providers are not adopted.

Privacy/deletion semantics: B2C evidence is owned by the profile with `organization_id = NULL` and private visibility. Organization-managed evidence records the authorizing organization and scope at observation time; the student can view it, authorized staff can view permitted summaries while membership is active. On organization removal, staff access ends immediately, live aggregates rebuild, and raw artifacts follow the shorter applicable retention. Account deletion removes artifacts, direct identifiers and keys; where audit/legal retention is required, retain a tombstoned pseudonymous event without content. Corrections append superseding evidence; exports include active and corrected lineage. Retention periods for code, resume, transcript, report and derived evidence are **NEEDS DECISION** before migration.

## Y. Sandbox roadmap

Sandboxing is an independent later phase. Required flow: API -> execution gateway -> queue -> ephemeral isolated worker -> result sanitizer -> deterministic engines -> evidence adapter. Requirements: no PrepVista secrets/DB credentials, disabled network, read-only root, temporary writable volume, unprivileged user, seccomp/isolation, CPU/RAM/PID/wall-time/output/file limits, image allow-list/signing, cleanup, concurrency quotas, abuse detection and audit.

Evaluate managed Judge0, gVisor containers, Firecracker microVMs, or isolated cloud tasks through a threat model and load test. No choice is made now. CodeForge's `spawnSync("bash")` ([`executor.ts`](../../CodeForge-AI/src/engine/personalized-challenge-engine/execution/executor.ts#L413)) and `spawn("su")` ([`runner.ts`](../../CodeForge-AI/src/engine/hidden-test-engine/sandbox/runner.ts#L142)) are explicit negative evidence.

## Z. Database migrations

### Existing relevant tables

| Existing table | Classification | Reason |
|---|---|---|
| `profiles` | REUSE | Canonical student identity and current B2C readiness/plan fields |
| `auth_identity_links` | REUSE | Multiple auth identities to one profile |
| `organizations`, `organization_admins`, `organization_students` | REUSE | Canonical tenancy/membership |
| `user_plan_entitlements`, `org_plan_allocations` | REUSE | Existing billing authorities |
| `interview_sessions`, `conversation_messages`, `question_evaluations`, `skill_scores`, `answer_quality_flags` | KEEP DOMAIN-SPECIFIC | Preserve interview behavior; adapter emits evidence |
| `reports` | KEEP DOMAIN-SPECIFIC | Existing interview report lifecycle |
| `usage_events`, `product_funnel_events` | EXTEND | Unified event names, bounded metadata |
| `placement_drives`, eligibility snapshots/rules | EXTEND | Future drive-readiness consumer |
| `placement_outcomes`, `student_placement_outcomes`, `placement_parameters` | KEEP DOMAIN-SPECIFIC | Outcome/calibration facts; never fabricate probability |
| `taxonomy_term` | KEEP DOMAIN-SPECIFIC | Organization training/assessment/intervention taxonomy, not platform capability taxonomy |
| `training_attendance`, `training_cohort`, `training_cohort_member`, `training_enrollment`, `training_program`, `training_session` | KEEP DOMAIN-SPECIFIC | TPO training operations; future event sources |
| `assessment`, `assessment_version`, `assessment_question`, `assessment_attempt`, `assessment_result` | KEEP DOMAIN-SPECIFIC | TPO assessment operations; future adapter source |
| `skill_measurement` | SUPERSEDE | Too little provenance for unified evidence; keep reads/writes until ledger validation |
| `readiness_snapshot` | KEEP DOMAIN-SPECIFIC | Existing migration-029 readiness; not unified shadow readiness |
| `intervention`, `intervention_assignment` | EXTEND | Add canonical organization/capability/activity references later |
| `audit_log` | KEEP DOMAIN-SPECIFIC | Migration-029 audit; not evidence or general analytics |
| `student_success_event` | KEEP DOMAIN-SPECIFIC | Existing training-success event source; adapt to unified events later |

All migration-029 definitions are visible in [`029_training_readiness.sql`](../../app/database/migrations/029_training_readiness.sql#L39). Its missing canonical profile/organization foreign keys and `institution_id` use must be repaired only in a new additive migration. Migration checksums in [`connection.py`](../../app/database/connection.py#L619) prohibit historical edits.

### Authoritative proposed names and table contracts

No table below is created in Phase 0.

| Proposed table | Why / writer / reader / lifecycle | Index, tenancy, RLS, retention |
|---|---|---|
| `capability_definitions` | Global versioned capability catalog; platform migration/admin writes; all models read; deprecate, never rename IDs | Unique `(domain, slug, version)`; global read, platform write; retain permanently |
| `skill_definitions` | Observable units under capabilities; platform writes; adapters/models read; version/deprecate | Unique `(capability_id, slug, version)`; global read; permanent |
| `skill_prerequisites` | Versioned DAG edges; platform writes; gap/state engines read | Unique graph edge/version plus parent/child indexes; global read; permanent |
| `role_definitions` | Canonical career roles; platform writes; dashboards/TPO/models read | Unique slug/version; global read; permanent |
| `role_skill_requirements` | Role/version targets, criticality and gates; platform writes; readiness reads | Unique role-version/skill; global read; permanent/versioned |
| `student_target_roles` | One active target plus history; student or authorized org flow writes; models read | Partial unique active profile; profile owner and authorized org scope; retain until account deletion, history exportable |
| `learning_activities` | Versioned activity templates; platform/TPO-authorized creator writes; sessions read | Type/status/organization indexes; global or org-scoped RLS; retain definitions while referenced |
| `activity_sessions` | One learner interaction; backend writes; UI/adapters read | Profile/time and org/time; own-profile/org-authorized RLS; cascade/tombstone per source retention |
| `activity_attempts` | Immutable submitted attempts; backend writes; adapters read | Session/attempt number unique, profile/time; same scope; retain by activity policy |
| `technical_artifacts` | Protected source/context metadata and encrypted object ref; backend writes; engine/adapters read transiently | Profile/time/content hash; strict owner scope; short configurable retention, delete first |
| `technical_analysis_results` | Immutable deterministic engine output; backend writes after service validation; adapter/report reads | Attempt/engine/version/idempotency unique; owner/org scope; retain with evidence policy, raw detail shorter |
| `technical_debugging_sessions` | Debugging state/action lineage; backend writes; debugging engine/adapter reads | Activity session/state/time; owner/org scope; activity retention |
| `domain_event_outbox` | Transactional delivery without dual-write loss; backend source transactions write; worker reads | Status/available time and unique aggregate/event; service-only RLS; purge after bounded audit window |
| `capability_evidence` | Canonical immutable observation ledger; adapters write; state/report/audit read | Unique idempotency; profile/skill/time, org/skill/time, source ref; owner/org RLS; pseudonymize/tombstone per deletion policy |
| `student_capability_states` | Rebuildable materialized current state; state worker writes; UI/readiness reads | Unique profile/role/skill/model, org/state; owner/org RLS; replace by new versions, retain limited history |
| `unified_readiness_snapshots` | Immutable shadow readiness; readiness worker writes; UI/report/TPO reads | Profile/role/calculated, org/state; owner/org RLS; versioned long-term snapshot policy |
| `blocker_snapshots` | Explainable blocker selection history; blocker worker writes; UI/report reads | Profile/readiness rank; owner/org RLS; align with readiness retention |
| `next_action_assignments` | Mission lifecycle and outcome; NBA/backend/student writes state transitions; UI/adapters read | Profile/status/expiry and source blocker; owner/org RLS; retain for intervention-effect analysis |
| `unified_report_snapshots` | Reproducible report payload/object ref; report worker writes; authorized viewers read | Profile/time, org/time, immutable version; explicit sharing scope; report retention and deletion |

## AA. API contracts

Use PrepVista's current route families, not CodeForge `/api`. Proposed versioned contracts:

| Method/path | Purpose and authorization |
|---|---|
| `GET /capabilities/me` | Own capability states/coverage; `get_current_user` |
| `GET /readiness/me` | Current user-facing readiness plus separately flagged shadow payload for enrolled testers |
| `GET /placement-twin/me` | Own target, states, blocker, mission; no client profile ID |
| `GET /next-actions/me` | Own active mission |
| `GET /evidence/me` | Paginated/redacted own evidence with lineage |
| `POST /technical/activities` | Create authorized non-executing activity; entitlement + idempotency |
| `POST /technical/activities/{id}/attempts` | Store bounded attempt/artifact under owner |
| `POST /technical/attempts/{id}/analysis` | Allow-listed non-executing analysis; server derives profile/org |
| `POST /technical/attempts/{id}/probes` | Submit defence/comprehension response |
| `POST /technical/activities/{id}/debugging-events` | Append validated debugging action/result |
| `GET /technical/history` | Own technical activity history |
| `GET/POST /reports/unified` | Fetch/create versioned unified report; existing `/reports/{session_id}` unchanged |
| `GET /org/my/readiness` | Suppressed organization aggregate |
| `GET /org/my/capabilities` | Suppressed capability aggregate |
| `GET /org/my/blockers` | Suppressed blocker aggregate |
| `GET /org/my/students/{membership_id}/placement-twin` | Authorized active membership drill-down; audited |
| `GET /org/my/drives/{drive_id}/readiness` | Organization-owned drive readiness without hiring-probability claim |

Responses carry `schema_version`, `calculation_version`, `as_of`, `coverage`, `limitations`, and correlation ID. Mutations accept `Idempotency-Key`. Technical analysis rejects executable requests, unknown languages, excessive content and untrusted org IDs. Existing router conventions are enumerated in [`main.py`](../../app/main.py#L442) and frontend methods in [`api.ts`](../../frontend/src/lib/api.ts#L804); CodeForge's router tree in [`api/routes/index.ts`](../../CodeForge-AI/src/api/routes/index.ts) is not exposed.

## AB. Frontend routes/components

Preserve the Next.js app and auth provider in [`frontend/src/app`](../../frontend/src/app) and [`auth-context.tsx`](../../frontend/src/lib/auth-context.tsx). Proposed routes: `/readiness`, `/placement-twin`, `/mission`, `/technical-practice`, `/evidence`, `/progress`, and `/reports/unified`; existing `/interview/*`, `/history`, `/report/[id]`, `/dashboard`, and `/student-dashboard` remain.

TPO additions remain under `/org-admin`: `/readiness`, `/capabilities`, `/blockers`, `/interventions`, and drive/student detail tabs. Reuse existing side rails ([`main-side-rail.tsx`](../../frontend/src/components/main-side-rail.tsx), [`student-side-rail.tsx`](../../frontend/src/components/student-side-rail.tsx)) and organization layout ([`org-admin/layout.tsx`](../../frontend/src/app/org-admin/layout.tsx)). No CodeForge frontend/public asset is copied; its static UI is served by [`server.ts`](../../CodeForge-AI/src/server.ts#L105) and is explicitly rejected.

Every unknown renders “Not enough evidence” with a next verification action—not `0%`, red failure, or “At Risk.” Shadow data remains hidden unless flag + cohort enrollment are both true.

## AC. Testing strategy

Current CI covers PrepVista compile/pytest and frontend lint/type-check/build/audit ([`ci.yml`](../../.github/workflows/ci.yml#L24)). Extend before integration with:

- Node 20 `npm ci`, audit, lint, type-check and build for the extracted package;
- golden parity tests including [`phase0.golden-parity.test.ts`](../../CodeForge-AI/tests/phase0.golden-parity.test.ts), expanded with fixtures for edge cases and every supported language;
- cross-language contract tests for request/response JSON and algorithm versions;
- adapter idempotency, out-of-order, correction/retraction, retry and outbox crash recovery tests;
- migration upgrade/rollback and historical-checksum tests on PostgreSQL;
- RLS and application-level B2C/B2B/cross-tenant denial tests;
- database-backed interview completion regression proving adapter failure cannot block completion;
- unknown-not-weak, critical-gate, contradiction, recency, hysteresis, shadow-diff and explanation tests;
- authorization/privacy suppression/export/deletion tests;
- performance/load limits for ledger queries, state rebuilds, TPO aggregates and service timeouts;
- security tests proving no host process import/call exists in the extracted service.

The current CodeForge suite has only seven active tests; smoke tests instantiate in-memory repositories ([`production.smoke.test.ts`](../../CodeForge-AI/src/production.smoke.test.ts)). PrepVista's command-center test currently asserts empty sessions are “At Risk” ([`test_command_centre_contract.py`](../../tests/test_command_centre_contract.py#L41)); that behavior must remain until a separately approved migration.

## AD. Migration/backfill plan

1. Preserve current baseline and obtain CodeForge provenance/license.
2. Add global taxonomy/role definitions in an additive migration after 035; seed version 1 deterministically.
3. Add activity and outbox structures; no existing interview rewrite.
4. Add evidence and technical source/result structures with RLS.
5. Add state/shadow readiness/blocker/NBA/report structures.
6. Enable adapters for an internal allow-list, shadow-only.
7. Backfill only facts actually stored. Never infer independence, transfer, difficulty, confidence, verification or rubric version.
8. Mark unsupported historical areas `NOT_ENOUGH_EVIDENCE`; record backfill version/watermark/idempotency.
9. Compare old/new behavior, calibrate and seek separate approval before exposure.

Historical interview deletion cascades are already exercised by [`history_retention.py`](../../app/services/history_retention.py#L34); new derived rows must participate in the deletion/rebuild contract. CodeForge database copies remain ignored and unused.

### Missing-evidence → At Risk impact map

No change is made now. A future migration must address together:

- service/model: [`placement_readiness.py`](../../app/services/placement_readiness.py), [`interview_summary.py`](../../app/services/interview_summary.py), [`analytics_student.py`](../../app/services/analytics_student.py), [`analytics_cohort.py`](../../app/services/analytics_cohort.py);
- API/TPO calculation: [`org_college_helpers.py`](../../app/routers/org_college_helpers.py#L167), [`org_college_analytics.py`](../../app/routers/org_college_analytics.py), [`org_admin_analytics.py`](../../app/routers/org_admin_analytics.py), [`placement_drives.py`](../../app/routers/placement_drives.py);
- database: [`001_initial_schema.sql`](../../app/database/migrations/001_initial_schema.sql#L114), [`017_college_organization.sql`](../../app/database/migrations/017_college_organization.sql#L285), [`033_reconcile_org_student_integrity.sql`](../../app/database/migrations/033_reconcile_org_student_integrity.sql#L180);
- frontend/API adapters: [`api.ts`](../../frontend/src/lib/api.ts#L88), [`org-admin/page.tsx`](../../frontend/src/app/org-admin/page.tsx#L206), [`org-admin/layout.tsx`](../../frontend/src/app/org-admin/layout.tsx), analytics, leaderboard and drive pages;
- tests: [`test_command_centre_contract.py`](../../tests/test_command_centre_contract.py#L50), [`test_placement_readiness.py`](../../tests/test_placement_readiness.py), and [`test_placement_drives_rules.py`](../../tests/test_placement_drives_rules.py).

## AE. Feature flags

Server-authoritative flags, independently scoped by environment, profile and organization: `unified_taxonomy_v1`, `unified_activity_model`, `unified_evidence_write`, `interview_evidence_adapter`, `technical_practice`, `technical_engine_sidecar`, `capability_state_shadow`, `unified_readiness_shadow`, `placement_twin`, `global_blocker`, `next_best_action`, `unified_reports`, `tpo_capability_analytics`, and `landing_technical_api`.

Flags default off, are evaluated server-side for data access, and include kill switches. Existing UI visibility flags in [`feature-flags.ts`](../../frontend/src/lib/feature-flags.ts) are presentation controls only; CodeForge's feature/security controls in [`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L4037) are not adopted.

## AF. Rollback strategy

Rollback is flag-first: stop new technical activities, disable adapter consumption, leave outbox events retryable, stop state/readiness workers, and hide shadow UI. Current interview, readiness, reports and dashboards remain intact because no current table is rewritten. Additive tables stay for audit; forward-fix migrations are used instead of editing history. Rebuildable state can be regenerated from valid evidence by model version.

If a sidecar degrades, circuit-break and return “analysis temporarily unavailable”; never fabricate or fall back to a mock. This differs from CodeForge's mock fallback ([`providers.ts`](../../CodeForge-AI/src/ai/providers.ts#L610)) and preserves PrepVista's current interview fallbacks in [`evaluator_scoring.py`](../../app/services/evaluator_scoring.py).

## AG. Deployment topology

Phase 0 and initial schema phases keep the existing topology in [`render.yaml`](../../render.yaml). Conditional future topology:

`browser -> PrepVista Next.js -> public FastAPI -> PostgreSQL/object storage/queue`

`FastAPI -> private stateless technical-intelligence service` for bounded deterministic analysis only.

`FastAPI -> future execution gateway -> isolated worker pool` is a separate, later security project.

The sidecar must be private, horizontally scalable, non-persistent, pinned to Node 20, built from a minimal lockfile/SBOM, health-checked without dependencies, and observable by request/engine/version/latency/error—never raw code. No CodeForge Dockerfile/server is reused; current CodeForge listens independently in [`server.ts`](../../CodeForge-AI/src/server.ts#L136).

## AH. Hackathon demo path

Use a labeled seeded demo tenant and non-executing path:

1. Select Software Engineer target.
2. Open a supplied code sample and supplied test-result fixture.
3. Run deterministic quality/correctness clustering without executing code.
4. Answer a code-defence and changed-constraint probe.
5. Persist explicitly labeled demo evidence.
6. Start the existing PrepVista interview; ask a mapped follow-up.
7. Show shadow Placement Twin, one blocker and one mission with evidence links.
8. Generate a versioned unified demo report.
9. Show privacy-safe TPO aggregate above the suppression threshold.

The demo must display `DEMO/SUPPLIED RESULTS`, never suggest host execution or real hiring probability. It builds on PrepVista's existing interview UI [`interview/[id]/page.tsx`](../../frontend/src/app/interview/[id]/page.tsx) and CodeForge pure correctness/quality sources in section B.

## AI. SpeakForge extension contract

SpeakForge may later return a versioned `CommunicationDomainResult` containing observed fluency, clarity, structure, fillers/pauses/rate, relevance, content-vs-delivery, retry delta and confidence. `CommunicationEvidenceAdapter` maps only measured facts into the same activity/evidence contracts. It owns no identity, tenancy, readiness or UI and cannot overwrite technical/interview evidence.

PrepVista already retains STT/audio audit facts in [`023_audio_audit_trail.sql`](../../app/database/migrations/023_audio_audit_trail.sql#L23) and routes speech through [`stt_ws.py`](../../app/routers/stt_ws.py); those retention/consent rules constrain the extension. CodeForge's understanding evidence shape ([`domain/types.ts`](../../CodeForge-AI/src/domain/types.ts#L2825)) demonstrates the reusable versioned-result pattern, not a communication authority.

## AJ. ACEAPT extension contract

ACEAPT may later return a versioned `ReasoningDomainResult` containing observed concept accuracy, reasoning steps, speed, confidence calibration, pressure stability, root cause, retention, transfer and assistance. `ReasoningEvidenceAdapter` uses the same source lineage and unknown rules. Aptitude speed never becomes ability without a validated rubric; pressure/independence remain null unless observed.

PrepVista's existing assessment model in [`029_training_readiness.sql`](../../app/database/migrations/029_training_readiness.sql#L121) remains a possible source adapter. CodeForge's reasoning verifiers ([`verifiers.ts`](../../CodeForge-AI/src/engine/reasoning/verifiers.ts#L58)) may inform deterministic claims but do not define ACEAPT persistence.

## Phase 1 decision

**CONDITIONAL GO — architecture preparation only; NO-GO for the first production migration or integrated UI today.**

Before Phase 1 production work, all of the following are required:

1. Obtain CodeForge upstream provenance/commit, author ownership and application-code license approval.
2. Repeat baseline under declared Node 20; make extracted-package build, type-check, lint, tests and audit pass without changing fixture semantics.
3. Review and approve the authoritative names and migration-029 classification in section Z.
4. Decide retention/consent/deletion periods and legal ownership for B2C and organization-managed evidence.
5. Decide individual versus college technical entitlements and quotas.
6. Approve role/capability/skill taxonomy version 1 and mapping governance.
7. Approve shadow-readiness semantics, including unknown, critical gates, calibration, hysteresis and removal/relabeling of unsupported probability language.
8. Approve TPO minimum cohort threshold and drill-down roles.
9. Expand golden fixtures and establish CodeForge algorithm parity coverage; current eight fixtures are the minimum baseline, not full certification.
10. Add planned CI gates and PostgreSQL/RLS/tenant-isolation test infrastructure before any migration merges.
11. Threat-model the private service and verify the extracted dependency graph contains no process execution, server, DB, auth, AI, report or frontend code.
12. Obtain a separate explicit Phase 1 approval.

Until those gates close, preserve current PrepVista behavior and stop at architectural review.
