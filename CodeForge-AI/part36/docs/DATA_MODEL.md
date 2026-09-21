# Data Model

Full field-level detail lives in `prisma/schema.prisma` — this is the
narrative version.

Feature 36 owns seven entities, all scoped by `organizationId`. It
does **not** own Organization, Student, Skill, or Role — those are
external references into existing CodeForge services (see
docs/ARCHITECTURE.md for why).

| Entity | Purpose |
|---|---|
| `CohortDefinition` | A configurable cohort — academic, department, training, role, placement, or custom (section 7). Self-referential `parentCohortId` supports drill-down hierarchies (section 30). |
| `CohortMembership` | Student <-> cohort links. A student can be in many cohorts at once (academic, department, training, role, placement — section 8); membership is soft-deleted (`isActive`/`leftAt`) so history isn't lost. |
| `CohortSkillAggregate` | One row per (cohort, skill, computation run): eligible/with-evidence counts, coverage state, mastery distribution, dominant level, trend, confidence. Multiple rows over time form the trend history (section 40). |
| `CohortRoleAggregate` | Same idea for role readiness — coverage, readiness distribution, required-skill gaps with priority. |
| `CohortTrainingInsight` | Ranked, replaced-per-run training priorities with rationale bullets and intervention categories (sections 19-21, 59). |
| `CohortSnapshot` | Append-only historical snapshot of a cohort's full executive overview for a labeled period (section 37). Never overwritten; a `scoringMethodologyVersion` field means logic changes don't retroactively alter old snapshots (section 78). |
| `CohortIntelligenceEvent` | Idempotency ledger for incoming events (assessment/interview/skill-evidence-updated). `sourceEventId` is unique, so re-delivery is a no-op (section 76). |
| `AuditLogEntry` | Sensitive administrative actions — cohort creation, membership changes, intelligence views, exports, comparisons (section 53). |
| `OrganizationPrivacyPolicy` | Per-organization override of the minimum cohort size and minimum coverage required before aggregates are shown (sections 31, 62). |

## Why aggregates are append-only rows, not columns updated in place

`CohortSkillAggregate` and `CohortRoleAggregate` insert a new row per
computation run rather than updating one row per (cohort, skill).
`listLatestForCohort()` picks the newest row per skill/role for
current-state views, while `listHistoryForSkill()` reads the full
series for trend computation. This is what makes genuine trend
analysis possible (section 40) without a separate history table, and
it means nothing is ever silently overwritten — the same append-only
principle as `CohortSnapshot`, just at finer grain.

## Enums

All persisted enums are declared once in `prisma/schema.prisma` and
re-exported from `src/domain/enums.ts` as the single source of truth
for the rest of the app (services, core algorithms, API, and even the
in-memory repositories):

- `MasteryLevel`: NOT_ASSESSED, EMERGING, DEVELOPING, PROFICIENT, STRONG (section 12)
- `ReadinessState`: READY, NEAR_READY, DEVELOPING, NEEDS_SIGNIFICANT_PREPARATION, INSUFFICIENT_EVIDENCE (section 25)
- `EvidenceCoverageState`: INSUFFICIENT, LOW, MEDIUM, HIGH (section 11)
- `TrendDirection`: IMPROVING, STABLE, DECLINING, INSUFFICIENT_EVIDENCE (section 40)
- `GapPriority`: HIGH, MODERATE, EMERGING, INSUFFICIENT_EVIDENCE (section 14)
- `CohortKind` / `CohortDimension`: the configurable cohort types and dimensions from section 7

If your actual Skill Signal Engine / Role Readiness Engine already
define these scales, replace these enum values with theirs exactly —
the spec is explicit that Feature 36 should not invent a second
mastery scale (section 12).
