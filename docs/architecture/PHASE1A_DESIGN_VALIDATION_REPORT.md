# Phase 1A Design Validation Report

Decision: **NO-GO for Phase 1B at this time**  
Completed: 2026-09-07  
Scope observed: design, isolated diagnostics/tests, and review-only SQL; no production feature, migration, route, auth, dashboard, readiness, pricing, or deployment change

## Deliverable register

| # | Deliverable | Artifact / result |
|---:|---|---|
| 1 | Provenance and licensing | `CODEFORGE_PROVENANCE_AND_LICENSING_REPORT.md`; verbatim reuse blocked |
| 2 | Clean Node 20 baseline | `CODEFORGE_NODE20_BASELINE.md`; install/tests pass, typecheck/build/lint/audit fail |
| 3 | Authored source allowlist | `CODEFORGE_SOURCE_ALLOWLIST.md`; hashes pinned, exclusions explicit |
| 4 | Expanded golden parity | `EXPANDED_GOLDEN_PARITY_FIXTURE_REPORT.md`; 54 fixtures + 2 boundary checks pass |
| 5 | Naming dictionary | `PREPVISTA_UNIFIED_FOUNDATION_V1.md` §1 |
| 6 | Reuse/extend/supersede matrix | Foundation §2 |
| 7 | Capability taxonomy V1 | Foundation §3 |
| 8 | Skill graph V1 | Foundation §4 |
| 9 | Target role taxonomy V1 | Foundation §5 |
| 10 | Evidence contract V1 | Foundation §6 |
| 11 | Tenancy/evidence ownership | Foundation §7 |
| 12 | Retention/deletion | Foundation §8; privacy/legal approval outstanding |
| 13 | Entitlement architecture | Foundation §9; numeric quota approval outstanding |
| 14 | TPO privacy | Foundation §10; aggregate minimum 10 |
| 15 | Shadow readiness V1 | Foundation §11 |
| 16 | Unknown-versus-weak migration | Foundation §12 and Appendix A |
| 17 | Blocker/hysteresis | Foundation §13 |
| 18 | NBA stability | Foundation §13 |
| 19 | Report snapshot | Foundation §15 |
| 20 | Sidecar/Python ADR | `ADR-001-TECHNICAL-ENGINE-SIDECAR.md`; conditional |
| 21 | Technical security boundary | `TECHNICAL_SERVICE_SECURITY_BOUNDARY.md` plus passing static checks |
| 22 | Language support | `TECHNICAL_LANGUAGE_SUPPORT_MATRIX.md`; explicitly non-executing |
| 23 | CI expansion | `PHASE1A_CI_EXPANSION_PLAN.md`; workflow unchanged |
| 24 | Proposed additive SQL | `sql/036_unified_foundations_PROPOSED.sql`; outside migration runner, not executed |
| 25 | Phase 1B implementation plan | `PHASE1B_IMPLEMENTATION_PLAN.md`; not authorized |

## Blocking risks

1. **Ownership/license — critical.** No origin, commit, owner, complete license, or permission exists. Copying authored source may create copyright and commercial-distribution exposure.
2. **Build integrity — critical.** The Node 20 application does not typecheck or build due to runtime use of type-only imports in readiness routes.
3. **Security/dependencies — high.** The full dependency graph has three moderate advisories, and excluded execution modules invoke shell/process mechanisms. The snapshot server must not enter production.
4. **Semantic harm — critical.** Current technical readiness converts missing evidence to zero/not-ready. PrepVista also has legacy no-session-to-at-risk behavior. Unifying them naively would mislabel unevaluated students and could affect placement workflows.
5. **Tenancy/privacy — critical.** CodeForge trusts a client organization header and has in-memory ownership patterns. Direct integration could allow cross-tenant access or expose raw student code/transcripts to TPO roles.
6. **Database application — critical.** Placing the draft SQL in the active migration folder would allow startup migration execution. It remains in documentation only; its functions, RLS, PostgreSQL version, query plans, and rollback need ephemeral-DB review.
7. **Model/calibration — high.** Readiness, hiring bands, blocker thresholds, and NBA weights are uncalibrated. They cannot drive eligibility, placement, or adverse decisions.
8. **Retention/legal — high.** Proposed retention windows and organization-vs-student ownership rules require legal/privacy and contract approval before storage begins.
9. **Billing/product — high.** Existing prices and interview quotas must remain unchanged. Technical quota values and college allocations are not yet approved.
10. **Operational complexity — medium/high.** A Node sidecar adds deployment, observability, failure, latency, and incident ownership. Its ADR is intentionally conditional.
11. **Parity coverage — medium.** Fifty-four fixtures improve confidence but do not prove parser completeness, concurrency safety, malformed-input handling, performance, or fairness.
12. **Snapshot quality — medium.** Full lint fails, existing tests are sparse, smoke tests warn about in-memory repositories, and probe/debugging threshold behavior includes surprising results frozen only for analysis.

## Conditions required to change NO-GO

- Establish source ownership/license permission or approve and enforce a clean-room reimplementation process.
- Produce an owned minimal package that passes Node 20 install, typecheck, build, lint, tests, boundary guard, audit, license/SBOM, and lock-drift checks.
- Obtain privacy/legal approval for evidence ownership, raw artifacts, retention/deletion, TPO drill-down, and hiring-label language.
- Obtain product/billing approval for technical feature entitlements and quotas without altering existing prices/interview quotas.
- Review and validate the SQL on an ephemeral database, including RLS/tenant tests, migrations, indexes, operational backfill, and rollback.
- Approve shadow-only readiness calibration and acceptance criteria; forbid production decision use until those criteria pass.

Phase 1A stops here. No Phase 1B implementation should proceed on the current evidence.
