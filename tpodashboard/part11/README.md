# PrepVista AI — Part 11: Administration, Security, Governance & Audit

A real, running backend (Node.js + TypeScript + Express, `node:sqlite`, no
ORM) plus a static dashboard, implementing the security-critical core of
the Part 11 spec: authentication, database-backed sessions, RBAC, tenant
isolation, audit logging, user/role/policy administration, and a working
data-quality engine.

**Start here:** `docs/PART11_BUILD_STATUS.md` is an honest, section-by-
section account of what's real vs. not attempted. `docs/ARCHITECTURE.md`
explains the non-obvious decisions (why no ORM, why sessions instead of
JWT, a documented finding from adversarial self-review). This was built
with no existing repository to integrate into — see
`docs/PART11_RECONNAISSANCE.md`.

## Quick start

```bash
npm install
npm run migrate     # creates db/dev.db from db/schema.sql
npm run seed         # creates a demo institution with one user per role
npm run dev           # http://localhost:3000
```

Open `http://localhost:3000` for the dashboard, or drive the API directly.

**Demo accounts** (all share the password `DemoPass!2026` — rotate or
remove before any real deployment):

| Email | Role |
|---|---|
| `super.admin@meridian.demo` | SUPER_ADMIN |
| `tpo.head@meridian.demo` | TPO_HEAD |
| `placement.officer@meridian.demo` | PLACEMENT_OFFICER |
| `coordinator.cse@meridian.demo` | DEPARTMENT_COORDINATOR (CSE) |
| `faculty.cse@meridian.demo` | FACULTY (CSE) |
| `management@meridian.demo` | MANAGEMENT |
| `student.demo@meridian.demo` | STUDENT |
| `coordinator.ece@meridian.demo` | DEPARTMENT_COORDINATOR (ECE — deliberately left assigned to an archived department so Data Quality has a real issue to show) |

## Running the tests

```bash
npm test
```

Runs Node's built-in test runner against a freshly-migrated, freshly-seeded
SQLite database (`db/test.db`, wiped and recreated on every run — see the
`pretest` script). 23 tests, covering tenant isolation, privilege
escalation, session revocation, audit immutability, data quality, and
policy versioning, all via real HTTP requests against the real app
(`supertest`), not mocks.

## Production build

```bash
npm run build   # tsc -> dist/
npm start        # runs the compiled output
```

## Project layout

```
db/                    schema.sql (raw SQL), migrate.ts, seed.ts, repositories/*
                        (the only files that contain SQL)
services/               business logic — auth, sessions, users, roles,
                        policy, audit, data-quality, ai-governance,
                        authorization (permission registry + RBAC),
                        bootstrap (new-institution setup), integration
                        (Part 10 bridge functions)
api/
  security/             auth, sessions, audit routes
  admin/                users, roles, departments, policies, data-quality,
                        system, ai-governance routes
  self/                 /api/me — student/self-service, ownership-scoped
src/
  lib/                  db connection, crypto helpers, error types
  middleware/           authenticate, RBAC guard, rate limiter, error handler
  types/                shared TS types (AuthUser, DB row shapes)
public/                 static dashboard (plain HTML/CSS/JS, no build step,
                        no framework — served by Express itself)
tests/
  security/              tenant isolation, privilege escalation, session/
                        deactivation — the spec's own adversarial scenarios
  admin/                 audit immutability, data quality, policy versioning
docs/                   the documents referenced above
module.manifest.json    routes/tables/services this module exposes, and
                        what it expects to depend on once Parts 1-10 exist
```

Folder ownership follows the spec's own preferred paths (section 85:
`services/auth/**`, `services/audit/**`, `api/admin/**`, `tests/security/**`,
etc.) so this can be dropped into a larger monorepo later without a
restructure.

## Configuration

`.env` ships with working SQLite defaults (no real secret in it — it's a
local file path). For anything else:

```
DATABASE_URL="file:./db/dev.db"     # swap for a Postgres URL in production — see ARCHITECTURE.md
PORT=3000
NODE_ENV=development                 # set to "production" to disable the dev outbox debug route
CORS_ORIGIN=http://localhost:3000
```

Left unset on purpose: `SMTP_HOST`, `SMS_PROVIDER_KEY`,
`WHATSAPP_PROVIDER_KEY`, `DOCUMENT_STORAGE_URL`, `ANTHROPIC_API_KEY`. With
these unset, `/api/admin/system/integrations` correctly reports every one
of them as `NOT_CONFIGURED` — that's the honest state, not a bug.

## What "invitations" and "password resets" actually do here

There's no real email provider wired up (nothing was configured to connect
to one in this environment — see `docs/ARCHITECTURE.md`). Outside of
`NODE_ENV=production`, whatever *would* have been emailed is written to a
`dev_outbox_messages` table instead, visible at `GET /api/auth/dev/outbox`.
This never claims a message was delivered — it wasn't. A real deployment
needs a real provider wired into `services/system/systemService.ts`'s
`pushDevOutbox` call sites.

## Known, accepted items

- Node prints `ExperimentalWarning: SQLite is an experimental feature` on
  every start. This is expected — `node:sqlite` was chosen deliberately
  and verified directly in this environment; see ARCHITECTURE.md.
- `npm audit` reports advisories in the `tsx`/esbuild dev-tooling chain.
  These affect esbuild's local dev server, which this project never runs
  exposed (tests run via `node --test`, not a dev server) — noted here
  rather than silently ignored.
