# CodeForge Cohort Intelligence — Feature 36

College Cohort Technical Intelligence: a privacy-aware institutional
intelligence layer that turns validated individual technical evidence
into cohort-level intelligence for TPOs, trainers, and admins, without
exposing individual student data unnecessarily.

This implements the architecture end to end — data model, aggregation
engine, privacy/tenant enforcement, event-driven incremental updates,
AI-grounded narrative summaries, and an API surface — as a runnable
service, plus a handful of illustrative dashboard components. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for what's fully built
vs. a documented extension point, and why.

## Quickstart (zero infrastructure)

```bash
npm install
cp .env.example .env
# Open .env and set JWT_SECRET to any random string — it's the one
# value the server won't start without, even in memory mode.

npm run dev
```

That's it — `DATABASE_PROVIDER`, `CACHE_PROVIDER`, and
`QUEUE_PROVIDER` all default to `memory`, so the whole service runs
in-process with no Postgres/Redis required. Mock adapters
(`src/integrations/mockAdapters.ts`) stand in for the rest of
CodeForge so you get realistic-looking data immediately — SQL is
deliberately under-covered so you can see the "insufficient evidence"
behavior (spec section 10) without seeding anything by hand.

Mint yourself a bearer token and try it:

```bash
npm run mint-token -- org_demo ORG_ADMIN
# copy the printed token

curl -X POST http://localhost:4000/api/v1/cohorts \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"name":"CSE 2026","kind":"DEPARTMENT","dimension":"DEPARTMENT"}'

# add >= PRIVACY_MIN_COHORT_SIZE (10) members, then:
curl -X POST http://localhost:4000/api/v1/cohorts/<id>/recompute -H "Authorization: Bearer <token>"
curl http://localhost:4000/api/v1/cohorts/<id>/overview -H "Authorization: Bearer <token>"
```

The last call returns the flagship "what's happening, why, and what
should we do next" executive overview (spec section 81).

## Moving to real infrastructure

```bash
docker compose up -d          # local Postgres + Redis
# in .env: DATABASE_PROVIDER=postgres, CACHE_PROVIDER=redis, QUEUE_PROVIDER=bullmq
npm run prisma:migrate
npm run dev                   # or: npm run build && npm start
npm run worker:dev            # separate process consuming the aggregation queue
```

`npx prisma generate` needs outbound access to Prisma's engine CDN
(`binaries.prisma.sh`) the first time — normal on a real machine, just
flagging it in case you're behind a restrictive proxy.

## Connecting real CodeForge systems

Feature 36 never recomputes mastery, readiness, or growth itself — it
consumes your existing Skill Signal Engine, Role Readiness Engine,
Technical Growth Tracking, and Next Best Action Engine. Right now
those are deterministic mock adapters
(`USE_MOCK_INTEGRATIONS=true`). To wire in the real ones:

1. Implement the interfaces in `src/integrations/ports.ts` against
   your actual services.
2. Construct them in `src/integrations/index.ts` instead of the
   `Mock*Adapter` classes.
3. Set `USE_MOCK_INTEGRATIONS=false`.

Everything downstream (aggregation, privacy thresholds, dashboards,
API) is unaffected by this swap.

## Project layout

```
prisma/schema.prisma       Feature-36-owned data model (see docs/DATA_MODEL.md)
src/domain/                 Shared enums + DTOs
src/core/                   Pure aggregation algorithms — coverage, distribution,
                             trend, gap priority, training priority, tenant guards.
                             No DB/HTTP dependency; this is what tests/unit/core.test.ts exercises.
src/integrations/           Ports (contracts) + mock adapters for existing CodeForge systems
src/repositories/           Persistence — in-memory (default) and Prisma-backed implementations
src/cache/, src/queue/      Swappable providers: in-memory by default, Redis/BullMQ in production
src/ai/                     AI-grounded narrative summaries (optional, off by default)
src/services/                Orchestration: cohort mgmt, aggregation, dashboards, comparison,
                             snapshots, export, audit
src/events/                  Idempotent event ingestion -> incremental aggregation
src/middleware/, src/api/   Auth, role authorization, tenant-scoped routes
web/components/             Illustrative React dashboard components (see web/README.md)
tests/                       Unit tests for core logic + a full HTTP integration suite
docs/                        Architecture, data model, and API reference
```

## Testing

```bash
npm run typecheck
npm test
```

`tests/unit/core.test.ts` exercises the aggregation algorithms
directly, including the spec's named golden scenarios (insufficient
evidence, small-cohort privacy restriction, trend claims requiring
coverage, tenant isolation, comparison guardrails).
`tests/integration/api.test.ts` drives the real Express app
end-to-end with signed tokens, including a cross-tenant access
attempt that must 404.

## What's fully implemented vs. an extension point

Fully implemented, tested, and running: cohort/membership management,
evidence-coverage-gated skill & role aggregation, trend detection,
gap/training-priority scoring, intervention classification, the
executive overview, TPO/Trainer/Admin dashboard compositions, cohort
comparison with guardrails, historical snapshots, JSON/CSV export,
idempotent event ingestion with incremental (student-scoped, not
institution-wide) recomputation, tenant isolation, role-based
authorization, audit logging, tenant-safe caching, and AI-grounded
narrative summaries that fail safe.

Documented extension points (clearly marked in code comments): real
integration adapters in place of the mocks; multi-period role
(not just skill) readiness trends; PDF export; a full frontend app
around the illustrative components in `web/`. None of these are
half-built — they're deliberately left as clean seams so you can
implement them against your actual systems rather than against
assumptions I'd have had to invent.
