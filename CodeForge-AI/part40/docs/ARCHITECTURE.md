# Feature 40 — Security, Audit & Reliability Layer

## Architecture

## 0. Context and scope of this document

No CodeForge repository was available to inspect in this environment (this
has been the case for every Feature 40-scale build in this project — see
`codeforge-reasoning-engine` and `codeforge-growth-intelligence`). This is
therefore delivered the same way those were: a standalone, adapter-based
module built against the stack CodeForge has consistently used
(TypeScript/Node, PostgreSQL with Row-Level Security, a Supabase-issued
JWT for auth), meant to be **merged into** the real backend, not run as
its own service. Every integration seam is called out explicitly — see
`INTEGRATION_GUIDE.md`.

Everything described below was actually built and, where it's a runtime
behavior rather than a static design choice, actually verified against a
live PostgreSQL 16 instance and a real Express app under test — not
inferred from the code by inspection. See `COMPLETION_REPORT.md` for the
Implemented / Verified / Not Applicable / Requires Infrastructure
breakdown and exact test counts.

## 1. Request pipeline

```
Request
  → Correlation ID           (backend/src/lib/correlationId.ts)
  → Security headers / CORS  (helmet, fail-closed origin allow-list)
  → Structured request log   (pino, secret-redacted)
  → [public] health probes   (routes/health.routes.ts — no auth, mounted before identity)
  → Authentication            (middleware/identity.ts — verifies Supabase JWT, builds IdentityContext)
  → Default rate limit        (middleware/rateLimit.ts, per-user)
  → Authorization + Tenant    (per-route: requirePermission / requireOrgParamMatch / resource-owner checks)
  → Feature handler           (the actual route logic)
  → Audit / security telemetry (audit.service.ts / securityEvents.service.ts)
  → Central error handler      (middleware/errorHandler.ts — always last, never leaks internals)
```

This mirrors the pipeline in the original brief
(`Authentication → Authorization → Tenant Validation → Security/Abuse
Controls → Existing Feature → Audit/Reliability Telemetry`) mapped onto
Express middleware order — see `backend/src/app.ts`.

## 2. Identity and authorization

CodeForge already authenticates users through Supabase. This feature does
**not** reimplement login, password reset, or MFA — `middleware/identity.ts`
verifies the Supabase-issued access token's signature and reconstructs a
server-side `IdentityContext` (`userId`, `organizationId`, `role`,
`sessionId`, `authTime`) from **verified claims only**. Nothing downstream
ever trusts a client-supplied role, org id, or user id.

Authorization is centralized (`middleware/authorize.ts`):

- `requirePermission(permission)` — role → permission lookup
  (`types/identity.ts`'s `ROLE_PERMISSIONS`), fails closed if identity is
  somehow missing.
- `requireResourceInOrg(loadOwnerOrgId)` — resource-level / IDOR
  protection: looks up which org actually owns the requested resource and
  denies (404, not 403 — never confirms existence) if it doesn't match
  the caller's org.
- `requireRecentAuth` — step-up gate for destructive admin actions
  (checks the JWT's `iat` against a configurable window, not just token
  validity).

The five-role hierarchy (`STUDENT < TRAINER < TPO < ADMIN <
PLATFORM_OPERATOR`) and its permission matrix are a best-effort mapping
from the roles named in the Feature 40 brief — **not** a confirmed schema
from the real CodeForge role/permission tables. This is the one piece
most likely to need reconciliation on integration; see
`INTEGRATION_GUIDE.md` §2.

## 3. Tenant isolation — defense in depth, not a single check

Tenant isolation is enforced at **two independent layers**:

1. **Application layer** — `middleware/tenantIsolation.ts` resolves the
   effective organization scope for a request from the verified identity
   (never from a query param, for anyone but `PLATFORM_OPERATOR`).
2. **Database layer** — every tenant-scoped table has Postgres Row-Level
   Security enabled and forced (`db/migrations/007_rls_policies.sql`),
   keyed on a transaction-local `app.current_org_id` set by
   `db/tenantContext.ts`'s `runInTenantContext()`. The **runtime API
   connects as a least-privilege database role (`codeforge_app`) that owns
   no tables**, so RLS cannot be bypassed by table ownership.

The second layer is the important one: if the application-layer check
ever has a bug, a cross-organization query still returns zero rows,
because Postgres itself won't show them. This was proven, not assumed —
see `COMPLETION_REPORT.md` §Testing for the actual `psql` output.

## 4. Central audit system

One table (`audit_event`), one write path
(`audit/audit.service.ts#recordAuditEvent`), one search path
(`searchAuditEvents`, always tenant-scoped). Immutability is enforced
**twice**:

- The least-privilege runtime role has no `UPDATE`/`DELETE` grant on
  `audit_event` at all.
- A `BEFORE UPDATE OR DELETE` trigger additionally rejects any mutation
  unless a specific session flag is set — which only the retention
  function (`purge_expired_events`, `SECURITY DEFINER`) sets, and only for
  `DELETE`, never `UPDATE`.

Two ways to write an audit event, both landing in the same table:

- **Declarative** (`middleware/auditMiddleware.ts#withAudit`) — wraps a
  route handler; records SUCCESS/DENIED/ERROR automatically from the
  handler's outcome. Used by the alert acknowledge/resolve routes.
- **Direct** (`recordAuditEvent(...)`) — for routes where the audit detail
  needs explicit control (e.g. distinguishing *which* incident transition
  happened). Used by the incident routes.

## 5. Security events, detection, and alerting

`security/securityEvents.service.ts#emitSecurityEvent` is the single
write path for `security_event` rows (login failures, authorization
denials, tenant-isolation violations, rate-limit hits, etc.) — middleware
calls it inline wherever a security-relevant decision is made.

Every emitted event is hand ed to `security/alertEngine.ts`, which runs a
small registry of **evidence-based, threshold-based** detection rules
(repeated login failures, repeated authorization denials, tenant-isolation
violations, sustained rate-limit violations, repeated denied admin
actions) against real counts queried from `security_event` — never
pattern-matching on vibes. Matching events **deduplicate** into a single
`security_alert` row via a correlation key and a partial unique index
(`ON CONFLICT ... WHERE status = 'OPEN'`), so a burst of a thousand
identical events becomes one alert with an occurrence count, not a
thousand notifications. A `CRITICAL`-severity alert automatically opens an
incident.

Alert evaluation is intentionally **fire-and-forget** from the request's
perspective (`security/securityEvents.service.ts` tracks but does not
await it) — a slow or broken detection rule must never add latency to, or
fail, the request that triggered the underlying event.

## 6. Incident management

A strict state machine (`incidents/incident.service.ts`):

```
OPEN → INVESTIGATING → MITIGATING → MONITORING → RESOLVED
         ↑_______________________________|   (regression during monitoring)
```

Every transition is rejected outright (409) if it isn't in the allowed-transitions
table, and every transition (plus the original detection) appends an
`incident_timeline_event` row — the timeline is the authoritative record,
not a derived view. Incidents opened automatically from a `CRITICAL` alert
get `DETECTION` + `ALERT` timeline entries seeded immediately.
`recordPostmortem` captures impact/root cause/detection/mitigation/
recovery/corrective-actions for resolved incidents.

## 7. Reliability primitives

Small, dependency-free, independently unit-tested (`backend/tests/unit.*`):

- **`lib/circuitBreaker.ts`** — CLOSED → OPEN → HALF_OPEN state machine.
- **`lib/retry.ts`** — bounded timeout wrapper + exponential-backoff-with-
  full-jitter retry, with a retryability classifier that treats
  authorization/authentication/validation failures as **permanent**
  (never retried) and network/5xx/429/timeout as **transient**.
- **`lib/rateLimiter.ts`** — pluggable-store rate limiter (in-memory
  default; swap in a Redis-backed store for multi-instance deployments —
  the interface is the integration point).

## 8. Health checks and failure containment

`reliability/health.service.ts` computes health **live**, on demand, by
actually calling each dependency's checker (`reliability/dependencies.ts`)
— nothing here is a fabricated status. The critical design decision is the
**essential vs. non-essential** flag per dependency and the rollup rule:

```
any ESSENTIAL dependency UNAVAILABLE        → overall UNAVAILABLE
any dependency DEGRADED (or non-essential UNAVAILABLE) → overall DEGRADED
otherwise                                    → overall HEALTHY
```

Only the database is marked essential. The AI gateway (Feature 39) and
the code-execution sandbox (Feature 8) are marked non-essential — this is
what makes "AI provider down → AI feature degraded → core platform still
operational" a real, tested code path (`golden.failureRecovery.test.ts`)
rather than only a diagram. Readiness (`/health/ready`) only fails on an
essential-dependency outage, so a non-essential blip never pulls a healthy
instance out of a load balancer.

Liveness (`/health/live`) and readiness (`/health/ready`) are public,
pre-authentication, and deliberately lightweight (liveness touches
nothing; readiness only checks essential dependencies) — matching
standard infra-probe expectations. The detailed per-dependency view
(`/api/health/dependencies`) is authenticated and permission-gated, since
per-dependency error detail is internal infrastructure information.

## 9. Integration seams (Feature 39 / Feature 8)

Feature 40 does not duplicate Feature 39 (AI cost/routing/policy/budget)
or Feature 8 (code execution sandbox). It only needs to know "is this
dependency reachable" for health monitoring, via two narrow interfaces:

- `adapters/aiProviderAdapter.ts` — `AIProviderAdapter.checkHealth()`
- `adapters/sandboxAdapter.ts` — `SandboxAdapter.checkHealth()`

Both ship with a deterministic mock implementation (used by tests and
local dev) and are the explicit integration point for wiring to the real
Feature 39/Feature 8 clients — see `INTEGRATION_GUIDE.md` §4.

## 10. Data model

Seven tables (`db/migrations/001`–`006`, RLS in `007`):

| Table | Purpose | Mutability |
|---|---|---|
| `app_session` | App-level session tracking layered on Supabase JWTs, for revocation/visibility | status/last_active updatable |
| `security_event` | Normalized security signal log | insert-only from the app |
| `audit_event` | Central, authoritative audit log | insert-only, trigger-enforced |
| `security_alert` | Deduplicated detection-rule output | status/severity/occurrence updatable |
| `incident` + `incident_timeline_event` | Incident state machine + timeline | status/postmortem updatable; timeline is insert-only |
| `dependency_health_snapshot` | Historical trend data for the reliability dashboard | insert-only, short retention |

All tenant-scoped tables carry `organization_id` and an RLS policy; see
§3. Retention is a single `SECURITY DEFINER` function
(`purge_expired_events`), the only path by which old rows are ever
deleted, callable by the runtime role via `EXECUTE` only.
