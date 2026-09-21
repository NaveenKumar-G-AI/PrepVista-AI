# Integration Guide

This module was built without access to the real CodeForge repository. It
is structured to be **merged in**, not run standalone. This is the exact
list of things to check/change during that merge, roughly in the order
you'll hit them.

## 1. Environment

Copy `backend/.env.example` to `.env` and fill in every value — all of
them are intentionally blank. In particular:

- `DATABASE_URL` — the **least-privilege** runtime connection string,
  using the `codeforge_app` role created in migration 007 (or your
  equivalent). This is what makes tenant isolation via RLS actually
  apply — do not point the running API at a superuser/table-owner
  connection.
- `DATABASE_ADMIN_URL` — elevated connection used **only** by
  `npm run migrate`. Keep it out of the running API's environment in
  production.
- `SUPABASE_JWT_SECRET` (or `SUPABASE_JWKS_URL` if your project uses
  RS256/JWKS) — from Supabase's project settings.
- `CORS_ALLOWED_ORIGINS` — your real frontend origin(s). There is no
  wildcard fallback by design.

Run `npm run migrate` once against a database where the `codeforge_app`
role (or your chosen name) has already been created with
`CREATE ROLE codeforge_app LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE;`
and `GRANT USAGE, CREATE ON SCHEMA public TO codeforge_app;` — the
migrations grant table-level privileges to that role but don't create it
(creating login roles is usually a one-time DBA action, not something a
migration should own).

## 2. Reconcile the role/permission model

`backend/src/types/identity.ts` assumes a five-role hierarchy (`STUDENT <
TRAINER < TPO < ADMIN < PLATFORM_OPERATOR`) inferred from the Feature 40
brief's escalation-path example. **This is the piece most likely to need
changes.** Before wiring anything else:

1. Compare `ROLES` / `ROLE_HIERARCHY` against your actual roles table.
2. Compare `ROLE_PERMISSIONS` against your actual permission model — the
   permissions listed are a reasonable starting set (`security:config:write`,
   `audit:read:organization`, `incidents:manage:platform`, etc.) but were
   invented for this module, not read from a real permissions table.
3. If CodeForge's roles differ in name or count, update `ROLES` and
   `ROLE_HIERARCHY` and re-check every `requirePermission(...)` call in
   `routes/*.ts` still makes sense for your actual role set.

## 3. Wire identity to your real Supabase JWT shape

`backend/src/middleware/identity.ts` expects:

```
sub                            → userId
app_metadata.role              → Role
app_metadata.organization_id   → organizationId
iat                            → authTime
session_id (custom claim)      → ties to an app_session row (optional)
```

If your Supabase project stores role/org differently (a separate
`profiles` table lookup instead of `app_metadata`, a different claim
name, RS256/JWKS instead of a shared secret), this is the one function to
change — everything downstream consumes `IdentityContext`, not raw
claims, so nothing else needs to know.

If you want session revocation/visibility (`/api/sessions/me`,
`POST /api/sessions/:id/revoke`) to actually work, call
`security/session.service.ts#createSession` right after a successful
Supabase login (e.g. from your existing post-login hook) and put the
resulting row's id into a custom `session_id` JWT claim. If you skip
this, `identity.sessionId` is simply always `null` and the rest of
Feature 40 is unaffected.

## 4. Wire the Feature 39 / Feature 8 adapters

Replace the mock implementations with real ones:

- `backend/src/adapters/aiProviderAdapter.ts` — implement
  `AIProviderAdapter.checkHealth()` against Feature 39's real health
  signal (`AI_GATEWAY_INTERNAL_URL` is the placeholder env var for this).
- `backend/src/adapters/sandboxAdapter.ts` — implement
  `SandboxAdapter.checkHealth()` against Feature 8's real sandbox status.
- `backend/src/adapters/notificationAdapter.ts` — implement
  `NotificationAdapter.notifyOperators()` against your real
  email/notification infrastructure (`ALERT_EMAIL_*` env vars are
  placeholders). Until this is wired, alerts still fire and are visible
  on the Security Operations dashboard — they just aren't emailed.

Each interface is intentionally narrow (one method) — you are not
expected to reimplement Feature 39 or Feature 8's actual functionality
here, only to answer "is it reachable right now."

## 5. Mount the router

```ts
import { createApp } from "./feature40/src/app"; // or compose the pieces into your existing app.ts
```

If CodeForge already has its own Express app rather than using
`app.ts`/`server.ts` as-is, take the middleware stack from `app.ts` (in
order) and the router from `routes/index.ts` (`apiRouter`, mounted after
your existing authentication if you already have equivalent middleware —
don't double-authenticate) and merge them into your existing app
assembly, rather than running two Express apps side by side.

## 6. Frontend

`frontend/src/` ships as plain source (not a built package) — copy the
`api/`, `components/ops/`, and `pages/ops/` directories into your
frontend, then:

```tsx
import { createOpsClient } from "./api/opsClient";
import { SecurityOperationsDashboard } from "./pages/ops/SecurityOperationsDashboard";

const opsClient = createOpsClient({
  baseUrl: "/api",
  getToken: () => supabase.auth.getSession().then((s) => s.data.session?.access_token ?? null)
});

<SecurityOperationsDashboard client={opsClient} />
```

Styling is plain CSS with `--ops-*` custom properties
(`components/ops/ops.css`) precisely because no real CodeForge design
system was available to match here — override those variables on a
parent element, or replace the stylesheet outright with your actual
design tokens. The component logic/markup doesn't depend on the specific
styling approach.

Route each of the four pages behind whatever admin/operator-only routing
guard CodeForge already uses — the API enforces permissions
server-side regardless, but there's no reason to render an ops dashboard
shell for a student.

## 7. Retention job

`audit/audit.service.ts#purgeExpiredEvents()` wraps the
`purge_expired_events` SQL function. Nothing calls it automatically —
schedule it (a daily cron, a queue job, whatever CodeForge's existing
background-job infrastructure is) rather than calling it per-request.

## 8. Business features should emit their own security-relevant events

Feature 40 owns the security/audit/alert/incident *infrastructure*, not
every possible security-relevant event in the platform. Business
features (assessments, submissions, AI coaching, etc.) that want their
actions audited or their abuse patterns detected should call
`emitSecurityEvent` / `recordAuditEvent` directly — see
`security/securityEvents.service.ts` and `audit/audit.service.ts` for the
exported functions. For example, "abnormal submission volume" or
"excessive AI requests" detection rules would live in
`security/alertEngine.ts`'s rule registry, evaluated against
`security_event` rows that the submission/AI features would need to
start emitting — that emission wasn't built here, because it belongs to
those features' own code, which wasn't available to inspect.

## 9. What was deliberately left as a checklist, not code

See `COMPLETION_REPORT.md`'s "Not Applicable in this context" /
"Requires infrastructure configuration" rows — real CI/CD pipeline
integration, real backup infrastructure status, dependency vulnerability
scanning, and production-scale load testing all require infrastructure
(a real CI system, real backup tooling, a real scanner, a real staging
environment under real traffic) that doesn't exist in this delivery
context. Building fake versions of any of these was avoided on purpose —
see the brief's own "ABSOLUTE QUALITY RULES."
