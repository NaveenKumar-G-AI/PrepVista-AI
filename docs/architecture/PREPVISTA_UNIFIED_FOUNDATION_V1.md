# PrepVista Unified Foundation V1

Status: Phase 1A design validation; no runtime implementation  
Canonical owner: PrepVista Python/FastAPI application and Supabase/PostgreSQL database

## 1. Canonical naming dictionary

| Canonical term | Stable key / column | Definition | Forbidden aliases in new work |
|---|---|---|---|
| Person profile | `profile_id`, FK `profiles.id` | PrepVista application identity linked to Supabase auth | CodeForge user, learner account |
| Student | `student_profile_id` | A profile producing learning/interview evidence | `student_id` when the FK target is unclear |
| Organization | `organization_id`, FK `organizations.id` | The canonical B2B tenant | institution, college tenant, CodeForge org |
| Organization membership | `organization_student_id`, FK `organization_students.id` | Student enrollment and scope inside one organization | institution student |
| Capability | `capability_id`, `capability_key` | Versioned skill/behavior being evidenced | CodeForge skill, rubric bucket |
| Capability edge | `capability_edge` | Versioned prerequisite/support relationship | dependency array |
| Target role | `target_role_id`, `target_role_key` | Versioned employability profile | job name, arbitrary role string |
| Evidence event | `evidence_event` | Immutable observation of performance with provenance | score row, signal blob |
| Capability state | `capability_state` | Rebuildable current projection from evidence | truth, permanent mastery |
| Readiness snapshot | `readiness_snapshot_v2` | Immutable, versioned role/readiness result | live mutable readiness |
| Hiring probability | `hiring_probability_band` | Calibrated probability band, never a guarantee | pass chance, placement promise |
| Next best action | `next_best_action` | Ranked, explainable recommendation | hardcoded intervention |
| Report snapshot | `report_snapshot` | Immutable reproducible report inputs/results | live report query |
| Entitlement | `entitlement_grant` | Independent permission/quota for a feature | inferred plan check |
| Unknown | `UNKNOWN` | No sufficient evidence exists | zero, weak, at risk |
| Weak | `WEAK` | Sufficient evidence indicates low performance | unknown |
| Blocked | `BLOCKED` | Cannot progress because an evidenced prerequisite is below its gate | missing evidence |

New SQL and APIs use `organization`, never `institution`. Existing `institution_id` columns remain legacy until an explicit backfill proves a one-to-one mapping; no blind rename is permitted.

## 2. Current table reuse / extend / supersede matrix

| Current table | Decision | V1 treatment |
|---|---|---|
| `profiles` | REUSE | Canonical person/student FK; do not create CodeForge users |
| `auth_identity_links` | REUSE | Only Supabase-auth-to-profile bridge |
| `organizations` | REUSE | Canonical tenant |
| `organization_admins` | REUSE | Canonical organization role/scope source |
| `organization_students` | REUSE + EXTEND LATER | Canonical membership; keep denormalized legacy readiness during shadow period |
| `institutions`, `institution_admins` | SUPERSEDE/FREEZE | Legacy compatibility only; no new technical tables point to them |
| `interview_sessions` | REUSE | Existing interview remains a source of evidence; no schema rewrite in Phase 1B |
| `conversation_messages`, `question_evaluations`, `skill_scores`, `answer_quality_flags` | REUSE AS SOURCES | Adapters emit normalized evidence; original records remain authoritative for interviews |
| `reports` | REUSE FOR EXISTING REPORTS | Add separate immutable `report_snapshot`; do not overload current report lifecycle |
| `user_plan_entitlements` | REUSE FOR LEGACY PLAN STATE | Add feature-level grants separately; do not conflate interview counts and technical attempts |
| `taxonomy_term` | SUPERSEDE FOR CAPABILITIES | Its enum is organization-scoped and limited to training/assessment/intervention; V1 needs globally versioned hierarchy and lifecycle |
| `assessment`, `assessment_version`, `assessment_question`, `assessment_attempt`, `assessment_result` | EXTEND | Reuse assessment shells; add explicit owner/member linkage, technical artifact relation, and evidence outbox rather than duplicate CodeForge assessments |
| `skill_measurement` | SUPERSEDE FOR NEW WRITES | Legacy projection has ambiguous `student_id` and insufficient provenance/version fields; adapter may read it |
| `readiness_snapshot` | SUPERSEDE FOR NEW WRITES | Keep for existing dashboards; shadow `readiness_snapshot_v2` supports unknown/coverage/model version |
| `intervention`, `intervention_assignment` | EXTEND | Link future NBA records; current workflows stay intact |
| `student_success_event` | REUSE AS LEGACY DOMAIN EVENT | Do not treat its free-form payload as evidence ledger; bridge through idempotent adapter |
| `audit_log`, `organization_access_log` | REUSE | Security/audit events; neither is the evidence outbox |
| CodeForge users/orgs/auth/repositories | DO NOT IMPORT | Duplicate ownership and tenancy models |

## 3. Capability taxonomy V1

Each item has `stable_key`, `slug`, `name`, `description`, `parent_key`, integer `version`, and lifecycle `status` (`DRAFT`, `ACTIVE`, `RETIRED`). Stable keys never contain a source brand.

| Stable key | Slug | Name | Parent | Version | Status |
|---|---|---|---|---:|---|
| `pv.capability.technical` | `technical` | Technical Capability | — | 1 | ACTIVE |
| `pv.capability.technical.problem_understanding` | `problem-understanding` | Problem Understanding | technical | 1 | ACTIVE |
| `pv.capability.technical.correctness` | `correctness` | Correctness | technical | 1 | ACTIVE |
| `pv.capability.technical.requirement_coverage` | `requirement-coverage` | Requirement Coverage | correctness | 1 | ACTIVE |
| `pv.capability.technical.algorithmic_reasoning` | `algorithmic-reasoning` | Algorithmic Reasoning | technical | 1 | ACTIVE |
| `pv.capability.technical.data_structures` | `data-structures` | Data Structures | technical | 1 | ACTIVE |
| `pv.capability.technical.complexity` | `complexity` | Complexity Analysis | technical | 1 | ACTIVE |
| `pv.capability.technical.code_quality` | `code-quality` | Code Quality | technical | 1 | ACTIVE |
| `pv.capability.technical.error_handling` | `error-handling` | Error Handling | code-quality | 1 | ACTIVE |
| `pv.capability.technical.debugging` | `debugging` | Debugging | technical | 1 | ACTIVE |
| `pv.capability.technical.root_cause` | `root-cause-analysis` | Root Cause Analysis | debugging | 1 | ACTIVE |
| `pv.capability.technical.regression_verification` | `regression-verification` | Regression Verification | debugging | 1 | ACTIVE |
| `pv.capability.technical.transfer` | `transfer` | Transfer | technical | 1 | ACTIVE |
| `pv.capability.interview` | `interview` | Interview Capability | — | 1 | ACTIVE |
| `pv.capability.interview.communication` | `communication` | Communication | interview | 1 | ACTIVE |
| `pv.capability.interview.reasoning` | `reasoning` | Reasoning | interview | 1 | ACTIVE |
| `pv.capability.interview.project_ownership` | `project-ownership` | Project Ownership | interview | 1 | ACTIVE |
| `pv.capability.interview.behavioral` | `behavioral` | Behavioral Evidence | interview | 1 | ACTIVE |
| `pv.capability.interview.situational_judgment` | `situational-judgment` | Situational Judgment | interview | 1 | ACTIVE |
| `pv.capability.interview.ai_tool_fluency` | `ai-tool-fluency` | AI Tool Fluency | interview | 1 | ACTIVE |

`Reasoning` and `Communication` are reserved cross-surface concepts. Technical child measurements may contribute to them only through an explicit versioned mapping; engines must not merge same-looking labels by string.

## 4. Skill graph V1

Edges are directed `prerequisite -> dependent`, carry `edge_type`, `weight`, `minimum_state`, and graph version. V1 edges:

| Prerequisite | Dependent | Type | Minimum evidenced state |
|---|---|---|---|
| Problem Understanding | Correctness | REQUIRED | DEVELOPING |
| Problem Understanding | Algorithmic Reasoning | REQUIRED | DEVELOPING |
| Data Structures | Algorithmic Reasoning | SUPPORTING | DEVELOPING |
| Algorithmic Reasoning | Complexity Analysis | REQUIRED | DEVELOPING |
| Correctness | Regression Verification | REQUIRED | DEVELOPING |
| Error Handling | Debugging | SUPPORTING | DEVELOPING |
| Debugging | Root Cause Analysis | REQUIRED | DEVELOPING |
| Correctness | Transfer | REQUIRED | COMPETENT |
| Algorithmic Reasoning | Transfer | REQUIRED | COMPETENT |
| Communication | Project Ownership | SUPPORTING | DEVELOPING |

Rules: reject cycles at publish time; never infer an unmet prerequisite from absence alone; version graphs immutably; retain the graph version on every state/readiness/report snapshot.

## 5. Target role taxonomy V1

Only roles credible with current interview and proposed non-executing technical evidence are active.

| Stable key | Role | Status | Core capability targets (0–100) |
|---|---|---|---|
| `pv.role.software_engineer.v1` | Software Engineer | ACTIVE | problem understanding 70, correctness 75, algorithmic reasoning 70, data structures 65, debugging 65, communication 65 |
| `pv.role.backend_engineer.v1` | Backend Engineer | ACTIVE | correctness 80, error handling 75, debugging 70, data structures 70, communication 60 |
| `pv.role.frontend_engineer.v1` | Frontend Engineer | ACTIVE | correctness 75, code quality 70, debugging 70, communication 65 |
| `pv.role.full_stack_engineer.v1` | Full Stack Engineer | ACTIVE | correctness 75, code quality 70, debugging 70, communication 65, project ownership 65 |
| `pv.role.data_analyst.v1` | Data Analyst | DRAFT | Not publishable until SQL/data-analysis evidence exists |
| `pv.role.ml_engineer.v1` | ML Engineer | DRAFT | Not publishable until statistics/model evidence exists |

Role profiles are immutable once published. New thresholds require a new role-profile version and shadow calibration.

## 6. Unified evidence contract V1

An evidence event is immutable and includes:

```text
event_id, idempotency_key, schema_version, occurred_at, recorded_at,
student_profile_id, organization_id?, organization_student_id?,
source_type, source_id, source_version, capability_key,
observation_kind, value, value_scale, confidence,
difficulty, assistance_level, independence_class,
context_type, transfer_group?, language?, artifact_id?,
evaluation_policy_version, evaluator_type, evaluator_version,
correction_of_event_id?, supersedes_event_id?, metadata
```

Contract rules:

- Producers write their domain result and an outbox row in one transaction. A worker appends evidence using `idempotency_key = source_type:source_id:source_version:capability_key:observation_kind`.
- Duplicate keys return the existing event; they never create a second contribution.
- Late events retain original `occurred_at`; projections recalculate the affected window and set `computed_at` separately.
- Evidence is never updated. Corrections append a compensating event referencing `correction_of_event_id`; invalidated evidence receives zero projection weight but remains auditable.
- AI interpretation may create evidence only with `evaluator_type=AI`, explicit model/prompt policy version, confidence, and grounding references. It cannot overwrite deterministic facts.
- Capability state is a cacheable projection. It is rebuildable by replay and stores the latest included event boundary plus policy version.

## 7. Tenancy and evidence ownership policy

| Scenario | Data owner/control plane | Allowed viewers | On membership end |
|---|---|---|---|
| B2C user-created session | User profile | User; platform support under audited least privilege | User keeps it; account deletion policy applies |
| Organization-assigned activity | Organization controls assignment; student remains data subject | Student and authorized organization roles within scope | Org access ends; statutory/contract retention applies; student copy only if contract/consent permits |
| Student self-practice while org membership is active | Student by default | Student; organization only when a clear org-sharing flag/contract basis exists | Sharing is revoked; user copy remains |
| Imported/TPO evaluation | Organization | Authorized org roles and student where policy permits | Retain per organization contract, then delete/anonymize |

Every organization-scoped row carries `organization_id` and, for student data, `organization_student_id`. Authorization derives tenant from the authenticated profile and membership; a client-supplied organization header is never trusted. Cross-tenant joins and global cohort exports are forbidden. Service-role access is backend-only and audited.

## 8. Retention and deletion architecture

These are conservative technical defaults and require privacy/legal sign-off before production activation.

| Data class | Default retention | Deletion behavior |
|---|---|---|
| Raw resume upload | 30 days after parse; 90-day absolute maximum | Object deleted; parse audit retained without content |
| Parsed resume/profile facts | Account life + 30-day deletion queue | Cascade/anonymize with profile |
| Raw interview audio | Existing configured 90 days | Object deletion plus tombstone/audit |
| Interview transcript/messages | Account life; org contract may set shorter period | Delete on account/domain request unless legal hold |
| Raw code/artifact text | 30 days after completed/abandoned attempt | Delete content; retain non-reversible metrics and deletion tombstone |
| Test outputs/traces | 30 days | Delete raw output; retain bounded classifications |
| Evidence events | 24 months after last activity, or shorter contract term | Delete identifiers/content or cryptographically anonymize; preserve aggregate only |
| Capability projections | While source evidence exists | Rebuild or delete automatically with evidence |
| Readiness/report snapshots | 13 months | Delete; generated PDF/object follows same deadline |
| Cohort aggregates | 24 months if thresholded and non-identifying | Delete or keep only irreversibly anonymized statistics |
| Security/audit logs | 13 months | Restricted deletion job; legal hold supported |
| Billing records | Statutory period configured by jurisdiction | Pseudonymize non-required profile fields |

Deletion is an idempotent job with discovery, object deletion, relational deletion/anonymization, projection rebuild, cache purge, and signed completion manifest. Legal holds override physical deletion but must be scoped and audited. Backups expire by normal rotation; deleted data is not selectively restored into live service.

## 9. Entitlement architecture

Technical entitlements are separate from interview quotas and existing prices. Introducing technical work must not decrement `interviews_per_month`.

| Capability | Free | Pro | Career | College student |
|---|---|---|---|---|
| View technical sample/diagnostic | Allowed | Allowed | Allowed | Allowed with active membership/access |
| Technical attempt | Feature grant with configurable low quota | Feature grant with configurable quota | Feature grant, policy may be unlimited | Organization allocation; independent of interview seats |
| Debugging/defence/transfer modes | Locked | Allowed | Allowed | Organization-plan controlled |
| Detailed technical evidence | Summary | Full | Full | Full to student; scoped aggregate/detail to authorized TPO |
| Unified report/PDF | Existing plan policy remains; no new free PDF | Allowed | Allowed | Organization-plan controlled |

Numeric technical quotas are deliberately not encoded in V1 schema or existing plan constants. They are entitlement policy data with effective dates. Product/billing approval of actual quota values is a Phase 1B activation blocker.

## 10. TPO privacy policy

- Default and hard minimum aggregate cohort size: **10** students. Counts, percentages, readiness bands, skill distributions, and exports are suppressed below 10.
- `org_admin` and `placement_officer` may view student-level evidence only inside their organization and only for active membership/contract purpose.
- `dept_admin`/department coordinator is limited to their department. Faculty access requires an explicit active assignment; no organization-wide browsing.
- `viewer` and management receive thresholded aggregates only. No raw transcripts, code, resume content, or model prompts.
- Drill-down exposes bounded evidence summaries and source timestamps, not raw hidden tests or other students’ data.
- Every detail view/export records actor, tenant, filters, purpose, row count, and timestamp in the access log. CSV formula injection protection and export expiry are mandatory.

## 11. Shadow readiness V1

### Inputs and states

For each required role capability, calculate an evidenced score only when minimum coverage is met: at least 3 valid events, at least 1 independent event, and evidence from at least 2 distinct challenges/contexts. Otherwise its state is `UNKNOWN`, never zero.

Capability weight is `role_weight × evidence_coverage × confidence`. Readiness is:

```text
weighted_score = sum(score × effective_weight) / sum(effective_weight)
coverage = sum(role_weight for known capabilities) / sum(all role_weight)
```

No overall band is published when coverage is below 0.60 or any core capability is `UNKNOWN`; return `INSUFFICIENT_EVIDENCE`. With adequate coverage: `READY >= 75`, `ALMOST_READY >= 60`, `DEVELOPING >= 40`, otherwise `AT_RISK`, subject to blockers.

Core blockers require sufficient evidence, a score below 40, confidence at least 0.60, and two consecutive snapshot breaches. Unknown never blocks. Clearing requires two consecutive snapshots at 45+ (5-point hysteresis). Trend requires three comparable snapshots.

### Shadow operation and acceptance

V1 writes shadow snapshots only and never changes current dashboards, eligibility, placement drives, or interventions. Compare against current readiness by cohort and outcome without exposing V1.

Acceptance requires: 100% tenant isolation tests; unknown never rendered as weak/at-risk; deterministic replay equality; at least 95% snapshot completion for eligible records; calibration sample at least 500 outcomes across at least 3 organizations (or a documented statistically justified equivalent); Brier score and calibration error no worse than the current model; subgroup calibration reviewed by organization/department without using protected traits for scoring; and no automated adverse decision.

## 12. Unknown-versus-weak migration strategy

Current zero/no-session data is ambiguous and cannot be relabeled in place. Migration is projection-only:

1. Classify `total_sessions_completed = 0`, null score, or no valid evidence as `UNKNOWN` in V1.
2. Preserve current `organization_students.readiness_tier`, `profiles.readiness_tier`, and legacy snapshots unchanged during shadow.
3. Dual-read only in diagnostics: legacy value plus V1 state/coverage/reason.
4. Backfill V1 from source records, not denormalized zeros.
5. Run reconciliation reports for `legacy at_risk + V1 unknown` and exclude those rows from performance conclusions.
6. Switch consumers individually behind flags only after acceptance; retain rollback to legacy read.
7. Retire legacy at-risk semantics in a separate approved migration after all consumers and tests are updated.

Known affected legacy consumers include organization admin/college dashboards, analytics services, placement readiness and drive eligibility, leaderboard/charts, and command-centre/placement tests. A Phase 1B change must inventory them mechanically before any flag is enabled.

## 13. Blocker and next-best-action stability policy

Blockers use the two-breach/two-clear hysteresis above and a seven-day minimum hold unless corrected/invalidated evidence changes the result. A blocker may not be based on one assessment, AI-only evidence, stale evidence alone, or missing evidence.

NBA candidates are eligible only when prerequisites, entitlement, language, time, content health, and tenant scope pass. Ranking features are versioned and normalized. Stability rules:

- keep the existing action unless a new candidate exceeds it by at least 0.10 normalized score;
- impose a 72-hour cooldown after acceptance/dismissal;
- no same challenge within 30 days unless explicitly marked review/retry;
- cap one active NBA per capability and three overall;
- attach the exact evidence snapshot and component breakdown;
- do not hardcode final weights until offline replay/simulation meets diversity, completion, no-loop, and subgroup checks.

## 14. Hiring-probability labels

V1 bands are `INSUFFICIENT_EVIDENCE`, `LOW`, `GUARDED`, `COMPETITIVE`, and `STRONG_SIGNAL`. They mean calibrated historical likelihood under a named role/outcome definition; they are not an employment prediction or guarantee. Numeric probabilities remain internal until calibration acceptance. Student UI must say “based on available evidence,” show coverage, model/version/date, and never claim selection certainty. TPO use is advisory only and cannot be the sole eligibility or adverse-decision basis.

## 15. Report snapshot architecture

A report is reproducible from immutable references: report ID/type/schema version, subject/tenant/scope, role profile version, taxonomy and graph versions, evidence event high-water mark and included IDs/hash, readiness/model/policy versions, entitlement at generation, locale, generated-at timestamp, deterministic section payloads, AI narrative input/output/model/prompt version, artifact checksum, and superseded-by link.

Regeneration with the same snapshot must reproduce deterministic sections byte-for-byte. Corrections create a new report snapshot; they do not mutate an issued report. AI narrative is labeled interpretive and cannot alter deterministic scores.

## 16. Dashboard composition

PrepVista keeps one authentication and provider shell, but does not force B2C and organization students into one identical page. The existing B2C dashboard owns individual plan, billing, referrals, launch-state compatibility, personal history, and account controls. The organization-student dashboard owns membership/access, assigned training/assessments, college context, organization-provided Career access, and institution-scoped outcomes. Shared components may show personal interviews, evidence coverage, capability state, next action, and reports, but their data loaders must receive an explicit audience/tenant context.

No Phase 1B work may redirect one audience to the other dashboard, change colors/layout globally, expose billing/referrals to organization students, or expose organization assignment/cohort details to B2C users. New technical cards remain hidden behind audience-aware entitlements and feature flags.

## Appendix A: current unknown-to-at-risk blast radius

The current codebase has explicit `at_risk`, `readiness_tier`, or zero-offer-risk logic in the following files. Phase 1B must re-run this mechanical inventory and classify each occurrence before consumer rollout:

```text
app/database/migrations/001_initial_schema.sql
app/database/migrations/017_college_organization.sql
app/database/migrations/033_reconcile_org_student_integrity.sql
app/routers/org_admin.py
app/routers/org_admin_analytics.py
app/routers/org_admin_helpers.py
app/routers/org_college.py
app/routers/org_college_analytics.py
app/routers/org_college_helpers.py
app/routers/placement_drives.py
app/services/analytics.py
app/services/analytics_cohort.py
app/services/analytics_helpers.py
app/services/analytics_student.py
app/services/interview_summary.py
app/services/placement_readiness.py
frontend/src/app/org-admin/analytics/[[...slug]]/page.tsx
frontend/src/app/org-admin/drives/page.tsx
frontend/src/app/org-admin/layout.tsx
frontend/src/app/org-admin/leaderboard/page.tsx
frontend/src/app/org-admin/page.tsx
frontend/src/app/page.tsx
frontend/src/components/charts/charts.ts
frontend/src/lib/api.ts
tests/test_command_centre_contract.py
tests/test_placement_drives_rules.py
tests/test_placement_readiness.py
```

Two concrete production semantics require special treatment: `app/routers/org_college_helpers.py` maps no/zero sessions to at-risk, and `tests/test_command_centre_contract.py` freezes `None`/empty readiness as at-risk. Neither may be changed until shadow reconciliation and consumer-by-consumer approval.
