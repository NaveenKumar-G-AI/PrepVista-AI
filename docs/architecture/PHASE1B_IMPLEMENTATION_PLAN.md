# Phase 1B Implementation Plan

Status: **NOT AUTHORIZED**

## Preconditions

Resolve or explicitly choose clean-room treatment for provenance; approve privacy/retention defaults and technical quotas; repair all Node 20 gates in an isolated owned package; approve the proposed SQL after database review; and confirm an ephemeral migration/RLS test environment.

## Small reversible sequence

1. Create feature flags defaulting off: evidence ingestion, technical analysis, shadow readiness, unified report, and TPO aggregate views.
2. Create a PrepVista-owned contract package and clean-room deterministic engine skeleton with no service dependencies.
3. Make the 50 Phase 1A fixtures and boundary tests pass; add malformed/size/tenant tests.
4. Implement migration `036` from the reviewed draft, first in ephemeral DB; test upgrade, rollback strategy, indexes, constraints, RLS, and empty/large datasets.
5. Add transactional outbox adapters for existing interview evidence. Backfill idempotently in batches with checkpoint/reconciliation; do not change source rows.
6. Build capability projections and readiness V1 as background shadow computations. Compare only; no production consumer switch.
7. Add internal/admin-only diagnostics with redacted evidence and model/version details.
8. Calibrate on approved historical outcomes, evaluate quality/fairness/stability, and obtain release approval.
9. Enable student read-only capability views for an internal cohort, then small opt-in percentage; retain instant flag rollback.
10. Enable thresholded TPO aggregates only after tenant/privacy penetration tests and access-log verification.

## Rollback

Every step is additive. Disable flags and workers, stop outbox consumption, and continue using current tables/routes/UI. Never drop or rewrite legacy readiness during Phase 1B. New data remains quarantined until an approved deletion or later migration.

## Stop conditions

Stop on cross-tenant visibility, unknown-to-zero conversion, evidence duplication, report non-reproducibility, golden parity drift, dependency boundary violation, unresolved audit/license issue, readiness calibration regression, or inability to restore current behavior solely by disabling flags.

