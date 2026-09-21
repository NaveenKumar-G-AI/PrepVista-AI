# ACEAPT Feature 45 — Aptitude Skill Graph (service)

A reference implementation of the Aptitude Skill Graph backend: the global
curriculum graph, the personal (student) graph, evidence-driven state,
root-cause and priority signals, admin graph management, and a REST API —
all working end to end against a real (SQLite, dev) database.

**Context this was built under:** no existing ACEAPT codebase was available
to inspect or integrate against. Everything here is therefore a standalone,
integration-ready service rather than a patch to a real repo. Every place
this would normally call one of ACEAPT's other systems (Mastery, Mistake,
Retention, Goals, roster/institutions) instead calls a narrow adapter
interface with a clearly-labeled stub implementation — see "Wiring in real
ACEAPT systems" below. Swapping a stub for the real thing is a one-file
change; nothing above the adapter layer needs to know.

## Stack

Node.js + TypeScript + Express + **Drizzle ORM** + better-sqlite3 (dev/test),
zod for runtime validation. Originally built on Prisma; switched because
Prisma's query-engine binary download is blocked by this environment's
network egress policy. Drizzle has no such dependency and is equally
suitable for production use — see "Moving to Postgres" below.

## Quick start

```bash
npm install
npm run db:generate   # writes SQL migration files from src/db/schema.ts (only needed after a schema change)
npm run db:migrate    # applies drizzle/*.sql to the local SQLite file
npm run db:seed       # loads the Quant/Logical/Verbal curriculum + demo student evidence
npm run dev            # starts the API on http://localhost:4045
npm test                # 62 unit + integration + security tests
```

`npm run db:push` (drizzle-kit's own push command) is also wired up but hits
a driver incompatibility with this better-sqlite3 version in this sandbox
(`This statement does not return data. Use run() instead`) — `db:generate` +
`db:migrate` is the reliable path and is also what you'd want in CI/prod
anyway (checked-in, reviewable SQL rather than an inferred diff).

All requests need `Authorization: Bearer <userId>:<role>[:<institutionId>]`
— see "Auth is a stub" below. Try:

```bash
curl -H "Authorization: Bearer student_demo_1:student" \
  http://localhost:4045/api/students/student_demo_1/skill-graph/priorities
```

## Architecture

### Two graph layers (spec section 8)

- **Global graph** — `skills` + `skill_relationships`: the curriculum
  structure (Quant/Logical/Verbal → categories → skills), typed directed
  edges (PREREQUISITE, DEPENDS_ON, RELATED_TO, BUILDS, TRANSFER_TO,
  PART_OF, COMMON_ERROR_SOURCE), versioned via `graph_versions`.
- **Personal graph** — `student_skill_states` (a materialized, cached
  projection) derived from `skill_evidence_events` (the append-only source
  of truth). Capability is `null` and state is `UNKNOWN` until real
  evidence exists — this is enforced structurally in
  `evidenceAggregation.service.ts`, not just by convention.

### Where the "intelligence" lives

| Concern | File |
|---|---|
| Traversal (`getPrerequisites`, `getUpstreamSkills`, `getSkillPath`, …) | `src/services/graphTraversal.service.ts` |
| Integrity validation (cycles, duplicates, orphans, invalid refs/hierarchy) | `src/services/graphValidation.service.ts` |
| Evidence → capability/state/trend/confidence | `src/services/evidenceAggregation.service.ts` |
| Root-cause / prerequisite-gap signal | `src/services/rootCause.service.ts` |
| Priority / "highest-leverage skill" signal | `src/services/prioritySignal.service.ts` |
| Admin mutation + publish/rollback gate | `src/services/graphAdmin.service.ts` |
| Cohort aggregation | `src/services/cohortGraph.service.ts` |

The traversal/validation/root-cause/priority engines are pure functions with
no DB coupling — that's why they're fully unit-tested without a database.

### Versioning model — a deliberate simplification

Skills/relationships are edited **in place** (stable `id` and `code` for the
life of the skill) rather than as full immutable per-version snapshots.
`GraphVersion` is a publication checkpoint (DRAFT → REVIEW → VALIDATED →
PUBLISHED → ARCHIVED, `effective_from`/`effective_to`) rather than a
container that gets copied on every edit. This satisfies the spec's
versioning requirements without the schema complexity of reconciling
duplicate rows that share one stable code across snapshots. The trade-off is
named explicitly in `graphAdmin.service.ts` and under "Known limitations"
below.

### Adapter pattern (sections 7, 22, 39–41, 47, 68–69)

`src/integrations/types.ts` defines `MasteryEngineAdapter`,
`MistakeEngineAdapter`, `RetentionEngineAdapter`, `GoalEngineAdapter`,
`RosterAdapter`, `AISuggestionAdapter`. `src/integrations/index.ts` resolves
each to its stub (today) or a "live" implementation you register (once you
have one), keyed by `*_ADAPTER_MODE` in `.env`. Every stub is in
`src/integrations/stubs/` with a comment explaining exactly what it fakes.

The AI adapter is the one real external call in this codebase: it hits the
actual Anthropic API (`claude-sonnet-5` by default) when
`ANTHROPIC_API_KEY` is set, and returns `null`/"unavailable" cleanly when
it's blank — every other endpoint is completely unaffected either way
(section 69). AI output is always `source: AI_SUGGESTED, status: DRAFT` and
requires a normal admin `POST /relationships` to become real — the adapter
itself cannot write to the graph (section 19).

### Auth is a stub

There is no real ACEAPT auth system to integrate against. `src/api/middleware/auth.middleware.ts`
reads `Authorization: Bearer <userId>:<role>[:<institutionId>]` so that
ownership checks (`requireSelfOrRole`), role checks (`requireRole`), and
institution scoping (`requireInstitutionMatch`) are **actually enforced and
tested**, not just planned. Replace `parseAuthHeader` with real JWT/session
verification — nothing downstream needs to change, since everything else
only reads `req.user`.

## API

```
GET    /api/skill-graph                                  ?domain=
GET    /api/skill-graph/:skillId                          (id or stable code)
GET    /api/skill-graph/:skillId/prerequisites
GET    /api/skill-graph/:skillId/dependents
GET    /api/skill-graph/:skillId/related
GET    /api/skill-graph/:skillId/path/:targetSkillId

GET    /api/students/:studentId/skill-graph                ?domain=
GET    /api/students/:studentId/skill-graph/gaps           ?threshold=
GET    /api/students/:studentId/skill-graph/priorities
GET    /api/students/:studentId/skill-graph/coverage       ?goalScoped=true
GET    /api/students/:studentId/skill-graph/root-cause/:skillCode

GET    /api/institutions/:institutionId/skill-graph/cohort  ?domain=

POST   /api/admin/skill-graph/skills
PATCH  /api/admin/skill-graph/skills/:skillId
POST   /api/admin/skill-graph/relationships
PATCH  /api/admin/skill-graph/relationships/:relationshipId
POST   /api/admin/skill-graph/validate
POST   /api/admin/skill-graph/publish
POST   /api/admin/skill-graph/versions/:versionId/rollback
GET    /api/admin/skill-graph/versions
POST   /api/admin/skill-graph/ai-suggestions
```

`root-cause`, `coverage`, and the cohort route aren't in the spec's section-60
list verbatim but are direct, named capabilities from sections 29–30, 46–48 —
added as the natural REST surface for those, not scope creep.

## Wiring in real ACEAPT systems

1. Implement the relevant interface from `src/integrations/types.ts` against
   your real system (e.g. `class LiveMasteryEngineAdapter implements MasteryEngineAdapter`).
2. Register it in `src/integrations/index.ts`'s `resolve*()` function under
   the `mode === 'live'` branch (currently a `throw` placeholder).
3. Set `MASTERY_ADAPTER_MODE=live` (etc.) in `.env`.
4. If your platform has a real event/message bus, subscribe to it and call
   the functions in `src/events/handlers.ts` directly instead of going
   through `src/events/eventBus.ts` — that in-process `EventEmitter` is a
   stand-in for "wherever ACEAPT's real bus is" (section 67).

## Moving to Postgres

`src/db/schema.ts` uses `drizzle-orm/sqlite-core`. To move to Postgres:
swap those imports for `drizzle-orm/pg-core` equivalents (`sqliteTable` →
`pgTable`, `integer(..., {mode:'timestamp'})` → `timestamp(...)`,
`integer(..., {mode:'boolean'})` → `boolean(...)`), point `src/db/client.ts`
at a `pg`/`postgres.js` driver instead of `better-sqlite3`, and regenerate
migrations. Column names, indexes, and every repository/service built on
top are unaffected — none of them import `better-sqlite3` directly.

## Testing

`npm test` runs 62 tests across 5 suites:

- `tests/unit/traversal.test.ts` — prerequisite/dependent/path traversal
- `tests/unit/validation.test.ts` — cycles, duplicates, orphans, invalid refs/hierarchy
- `tests/unit/evidence.test.ts` — the unknown-vs-weak rule, confidence tiers, trend, recency weighting
- `tests/unit/rootCauseAndPriority.test.ts` — hedged root-cause language, "structure alone never wins" priority
- `tests/integration/api.test.ts` — real HTTP requests via supertest: auth (401), student ownership (403), admin role (403), tenant isolation (403), duplicate-code rejection (409), invalid enum rejection (400), and that gaps/root-cause reflect genuinely seeded data rather than fixtures baked into the assertions

## Known limitations

Named explicitly rather than glossed over:

- **Rollback is a version-pointer swap, not a content revert.** Because
  editing is in-place rather than full-snapshot, rolling back to an
  archived `GraphVersion` doesn't reconstruct the exact prior field values
  of skills/relationships edited since then. A real implementation of
  that needs an audit/diff log — a reasonable next increment, not included
  here.
- **The stub Mastery/Mistake/Retention adapters only know this service's
  own evidence log.** They can't see anything ACEAPT's real engines know
  that never arrived here as an event. This is intentional (better than a
  fake engine that pretends to be authoritative) but means the numbers
  from the stub path shouldn't be treated as production-accurate mastery
  values — that's exactly why `MasteryEngineAdapter` exists as a swappable
  seam instead of being hardcoded.
- **No production observability stack.** `src/utils/logger.ts` emits
  structured JSON lines; wiring that into real APM/tracing is a config
  change at the logging call sites, not included here.
- **Cohort tenant scoping is minimal.** `RosterAdapter` resolves an
  institution's student IDs from a static stub map; a real deployment's
  multi-tenant boundaries likely need more than that one interface.
- **Duplicate detection is a normalized-name heuristic**, flagged as
  WARNING (human review), not an NLP/embedding-based similarity check.
