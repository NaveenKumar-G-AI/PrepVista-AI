# CodeForge — Feature 40: Security, Audit & Reliability Layer

Standalone, adapter-based delivery — no CodeForge repository was
available to inspect in this environment, so this is built to be
**merged into** the real backend/frontend, not run as its own service.
See `docs/INTEGRATION_GUIDE.md` for exactly how.

**Start here:**
1. `docs/COMPLETION_REPORT.md` — what's actually built, tested, and
   verified, and an honest list of what isn't (read this first).
2. `docs/ARCHITECTURE.md` — how it fits together and why.
3. `docs/INTEGRATION_GUIDE.md` — concrete steps to wire it into the real
   CodeForge codebase.

## Layout

```
backend/    TypeScript/Express/PostgreSQL — the actual feature
  src/
    config/       env loading, fail-closed validation
    types/        identity, roles/permissions, event taxonomy
    lib/          logger, redaction, circuit breaker, retry, rate limiter, CORS
    db/           connection pool, tenant-context transaction helper, migrations
    middleware/   identity, authorization, tenant validation, rate limit, audit, errors
    security/     security events, alert engine, session service
    audit/        the central audit log
    incidents/    incident state machine
    reliability/  health checks, dependency checkers
    adapters/     Feature 39 (AI) / Feature 8 (sandbox) / notification integration points
    routes/       the API
  tests/        57 tests, 10 files — golden scenarios, unit tests, concurrency tests
frontend/   React/TypeScript source for the 4 ops dashboards (not a built app)
docs/       ARCHITECTURE.md, INTEGRATION_GUIDE.md, COMPLETION_REPORT.md
```

## Quickstart (to run this module's own tests, not to deploy it)

```bash
cd backend
cp .env.example .env   # fill in a real Postgres connection + Supabase JWT secret
npm install
npm run migrate        # requires DATABASE_ADMIN_URL — see .env.example
npm test                # 57 tests against a real Postgres instance
```

```bash
cd frontend
npm install
npm run typecheck
```
