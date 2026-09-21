# Architecture

## The core loop

```
Individual Technical Evidence (existing CodeForge systems)
        |
Validated Skill/Role Signals   (src/integrations — ports + adapters)
        |
Evidence Coverage Check        (src/core/coverage.ts)
        |
Skill / Role Aggregation       (src/core/distribution.ts, src/services/aggregation.service.ts)
        |
Gap + Training Priority        (src/core/distribution.ts, src/core/prioritization.ts)
        |
Privacy + Tenant Filtering     (src/core/guards.ts, src/services/cohort.service.ts)
        |
TPO / Trainer / Admin Views    (src/services/dashboard.service.ts, src/api/routes.ts)
```

Every arrow above is a real, tested function — not a diagram of an
aspiration. `tests/unit/core.test.ts` exercises the middle three
stages directly; `tests/integration/api.test.ts` exercises the whole
chain over real HTTP.

## Decision: Feature 36 owns only its own bounded context

The spec repeatedly says to reuse existing organization, student,
skill, and role entities rather than re-model them (sections 9, 15,
20, 24, 50, 54). No existing schema was provided to build against, so
rather than invent a competing Student/Skill/Role data model that
would almost certainly conflict with your real one, this service:

- Stores `organizationId`, `studentId`, `skillId`, `roleId` as opaque
  string references it never owns or joins against directly.
- Defines interfaces (`src/integrations/ports.ts`) describing exactly
  what shape of data it needs from each existing system.
- Ships deterministic mock adapters implementing those interfaces
  (`src/integrations/mockAdapters.ts`) so the service is fully
  runnable today, and a single wiring point
  (`src/integrations/index.ts`) to swap them for real ones later.

This is the single biggest judgment call in this build. Everything
else follows from it.

## Decision: "Department Intelligence" is not a separate subsystem

Section 17 asks for department comparisons; section 7 says cohorts
must be configurable, not hardcoded to "college batch." Rather than
build a parallel department-specific code path, a department is
modeled as a `CohortDefinition` with `kind=DEPARTMENT` — so it's
served by the exact same overview/skills/roles/comparison endpoints
as any other cohort. One aggregation engine, one set of privacy rules,
one API surface, N cohort dimensions.

## Decision: evidence coverage gates every claim

Sections 10, 11, 26, 61-63 are emphatic about this, so it's enforced
structurally rather than left to callers to remember:
`canMakeStrengthClaim()` (src/core/coverage.ts) is the single choke
point every distribution, trend, and gap-priority function checks
before making any strength/weakness/trend claim. Below the coverage
floor, the only legitimate output is "insufficient evidence" — see the
golden-scenario tests for the exact behavior.

## Decision: privacy threshold and tenant isolation are structural, not incidental

- **Tenant isolation**: every repository read is scoped by
  `organizationId` in the query itself, AND every service call
  re-asserts the relationship via `assertBelongsToOrganization()`
  (src/core/guards.ts) — defense in depth, so a future refactor that
  drops a `WHERE` clause doesn't silently leak data. Cross-tenant
  access returns 404, not 403, so it can't even confirm a resource
  exists under someone else's organization.
- **Privacy threshold**: `cohortService.checkPrivacyGuard()` runs
  before any aggregate is computed for a request — small cohorts get a
  `restricted` response, never partial or approximate numbers.

## Decision: swappable infrastructure providers, in-memory by default

Repositories, cache, and the aggregation queue are all defined as
interfaces with an in-memory implementation (used by default) and a
production implementation (Postgres via Prisma / Redis / BullMQ,
enabled via env vars). This means:

- `npm run dev` and `npm test` need zero external infrastructure.
- The full request lifecycle — including the event-driven incremental
  aggregation path — is exercised by real tests in this sandbox, not
  just asserted to work.
- Moving to production infrastructure is a config change
  (`DATABASE_PROVIDER=postgres`, etc.), not a rewrite.

## Decision: AI is optional enrichment, structurally incapable of being the source of truth

Sections 54-56 are direct: AI must receive only structured aggregate
data, must never invent analytics, and its failure must never break
the dashboard. This is enforced rather than just requested of the
model:

- `aiInsight.service.ts` passes only the already-computed structured
  overview object into the prompt — never raw student records.
- `groundingCheck.ts` mechanically verifies every number in the
  generated narrative traces back to the structured input; on failure
  the narrative is dropped, not shown.
- Every failure mode (`AI_PROVIDER=none`, network error, malformed
  response, failed grounding check) returns `narrative: null` and lets
  the (already fully computed) structured response through unchanged.
  `tests/integration` implicitly covers this since `AI_PROVIDER=none`
  in the test environment and every endpoint still returns complete data.

## Decision: no fabricated scores

Section 60 explicitly rules out things like "73.42% Technical Health."
`scoreTrainingPriority()` keeps an internal numeric score for sorting
only — it's never serialized to the API response. What the API
returns instead is qualitative tiers (`GapPriority`, `ReadinessState`,
`TrendDirection`) plus rationale bullets, which is what
`docs/API.md` and the `web/` components render.

## What would change with real infrastructure

- **Repositories**: `DATABASE_PROVIDER=postgres` switches every
  repository from the in-memory Map-backed implementation to the
  Prisma-backed one (`src/repositories/prisma.ts`) with zero service-layer
  changes, since services only depend on the `Repositories` interface.
- **Queue**: `QUEUE_PROVIDER=bullmq` moves aggregation jobs from
  same-process `setImmediate` to a real BullMQ queue/worker split
  (`src/queue/index.ts`), so `src/worker.ts` becomes a separate
  deployable process.
- **Integrations**: `USE_MOCK_INTEGRATIONS=false` plus real adapter
  implementations replace the deterministic mock data with your actual
  Skill Signal Engine / Role Readiness Engine / Growth Tracking / Next
  Best Action Engine outputs — the aggregation math doesn't change at all.

## Known extension points (intentionally not built out)

These are real gaps, named honestly rather than quietly glossed over:

- **Multi-period role readiness trend**: skill trend is fully
  implemented (needs history in one table); role trend needs the same
  historical pattern applied to `CohortRoleAggregate`, left as
  `TrendDirection.INSUFFICIENT_EVIDENCE` for now rather than a
  half-correct guess.
- **PDF export**: JSON/CSV are implemented; PDF needs a rendering
  library (pdfkit/puppeteer) fed the same report payload already built
  in `export.service.ts`.
- **Real role-model/assessment-schema version metadata**: comparison
  guardrails currently use hardcoded version constants
  (`comparison.service.ts`) as a stand-in for reading real version
  metadata off the Role Readiness / Assessment engines once connected.
- **Full frontend**: `web/components/` are illustrative, reasonably
  polished starting components (section 57's pattern), not a complete
  routed application with the full component set from section 57-58.
