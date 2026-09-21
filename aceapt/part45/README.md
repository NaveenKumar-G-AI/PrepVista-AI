# ACEAPT Feature 45 — Aptitude Skill Graph

A working reference implementation of the Aptitude Skill Graph: the
machine-readable intelligence infrastructure described in the Feature 45
brief — not a decorative skill tree. Two parts:

- **`service/`** — the backend: schema, graph traversal/validation engines,
  evidence-driven student state, root-cause and priority signals, admin
  graph management, REST API. Start here — see `service/README.md`.
- **`web/`** — the student skill-map UI and admin console, built against
  that API. See `web/README.md`.

## Why this is standalone rather than integrated into ACEAPT directly

No existing ACEAPT codebase was provided or accessible to inspect — Phases
1–3 of the brief (repository audit, feature dependency map, canonical
entity discovery) had nothing to run against. Rather than guess at a
codebase that isn't there, this was built as a **self-contained,
integration-ready service**: real schema, real algorithms, real tests, and
a narrow, swappable adapter interface everywhere it would otherwise
duplicate an existing ACEAPT system (Mastery, Mistake, Retention, Goals,
roster/auth). Wiring it into the real ACEAPT codebase means implementing
those adapters against the real systems — see "Wiring in real ACEAPT
systems" in `service/README.md` — not rewriting anything above that layer.

One architecture change worth flagging: this was originally built on
Prisma; its query-engine binary download is blocked by this environment's
network policy, so it now runs on **Drizzle ORM + better-sqlite3** instead.
Functionally equivalent, verified working, and equally portable to Postgres
(see `service/README.md`).

## Quick start

```bash
cd service && npm install && npm run db:generate && npm run db:migrate && npm run db:seed && npm run dev
# in another terminal
cd web && npm install && npm run dev
```

## What's implemented, against the spec's own checklist (section 86)

| Requirement | Status |
|---|---|
| Global graph (skills, typed relationships, hierarchy) | ✅ 47 skills, 39 relationships, 7 relationship types, seeded from sections 11–13 |
| Versioning (DRAFT→REVIEW→VALIDATED→PUBLISHED→ARCHIVED) | ✅ gated publish, gated on validation |
| Integrity validation (cycles, duplicates, orphans, invalid refs/hierarchy) | ✅ pure functions, fully unit-tested |
| Personal graph / student state | ✅ evidence-driven, materialized + recomputed on events |
| Unknown ≠ weak | ✅ enforced structurally (capability stays `null`), tested at unit + API level |
| Root-cause signals | ✅ hedged language, confidence-aware, matches spec's own JSON shape |
| Priority / highest-leverage signals | ✅ combines goal relevance + weakness + evidence + structure, never structure alone |
| Mastery/Mistake/Retention integration | ✅ as adapters (stubbed — no real systems exist to integrate against) |
| Goal integration (Feature 44) | ✅ as an adapter (stubbed — Feature 44 doesn't exist in this build) |
| Assessment → graph evidence | ✅ via the event bus (`QUESTION_ATTEMPTED`, `ASSESSMENT_COMPLETED`) |
| Cohort/institutional aggregate | ✅ percentage distributions, tenant-isolated |
| Explainability | ✅ every priority signal and relationship carries a plain-language reason |
| Admin graph management | ✅ create/edit skill & relationship, validate, publish, simplified rollback |
| Security (student isolation, roles, tenant isolation) | ✅ enforced + tested (401/403/409/400 cases in the integration suite) |
| Performance (indexing, caching, depth-limited traversal) | ✅ indexes on all FK/lookup columns, 30s graph-structure cache, depth-limited BFS |
| Accessibility | ✅ text-first relationship sentences, `aria-*`, reduced-motion support |
| Testing | ✅ 62 tests, unit + integration + security, all passing |
| AI cost/dependency control | ✅ never called on read paths; graceful no-op with no API key |

## Files

```
service/
  drizzle/                    generated SQL migration
  src/db/                     schema, client, seed script
  src/domain/                 enums + pure types
  src/services/                traversal, validation, evidence, root-cause,
                                priority, versioning/admin, cohort, event-driven
                                state recompute
  src/repositories/            thin Drizzle query wrappers
  src/integrations/            adapter interfaces + stubs + AI adapter
  src/events/                   in-process event bus + handlers
  src/analytics/                 event catalog
  src/api/                       middleware, controllers, routes, app, server
  tests/                          62 tests (unit + integration + security)
  README.md                       full architecture + integration guide

web/
  src/api/                       types + fetch client
  src/components/                 8 components (see web/README.md)
  src/App.tsx                     demo harness
  README.md                       component map + design rationale
```

## Known limitations (see each README for detail)

- Rollback repoints the "active version" marker; it doesn't reconstruct
  prior field-level edits (no audit/diff log in this build).
- Stub adapters only know this service's own evidence log — they're a
  runnable stand-in, not production-accurate mastery/mistake/retention
  numbers.
- No production observability/tracing stack, just structured JSON logs.
- `SkillDetailPanel` doesn't show a raw mistake/attempt history — no
  backend endpoint exposes one in this build.
