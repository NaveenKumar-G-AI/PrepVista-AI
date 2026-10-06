# PrepVista Old-Push College Production Batch 1: Authentication Reliability

Date: 2026-10-04 (Asia/Calcutta).

Decision: **A — Batch 1 qualified for Batch 2**. Backend: **508 passed**;
frontend: **56 passed**; typecheck, lint and diff checks pass. Temporary auth
infrastructure failures preserve sessions and stored drafts. This is local
stabilization qualification, not production release approval. Do not deploy.

Workspace: `G:\PrepVista-Old-Push`; branch `main`; unchanged HEAD:
`24649a003336255b3d2830d9e3b9b8447bbf6cad`. No commit or push.

## Actual flow map (recorded before patches)

`frontend/src/lib/auth-context.tsx` loads Supabase's session and the API client's
stored access token (sessionStorage) and refresh token (localStorage).
Pages call `frontend/src/lib/api.ts::ApiClient.request` (or the OAuth/PDF paths).
The client attaches Bearer auth and sends requests to `app.main:app`.
FastAPI routes use `app/dependencies.py::get_current_user`: token extraction,
memory cache, Redis cache, HS256 JWT verification, or Supabase `/auth/v1/user`.
An uncached identity resolves through `auth_identity_links`, then `profiles`.
College-student membership comes from `profiles.org_student`, not a separate
membership lookup. Plan synchronization builds `UserProfile`, which is cached.
`/auth/me` separately reads `is_org_admin`, `org_student`, `organization_id`.
College-admin authorization uses `get_org_admin` to join organization_admins
and organizations and check both statuses; this context is not Redis-cached.
Main middleware/global handlers convert backend exceptions to HTTP responses.
The frontend retries requests, refreshes through `/auth/refresh`, and emits
`prepvista:auth-required` on final rejection. AuthProvider listens and routes
to login. Explicit logout also calls Supabase signOut.

Google sign-in uses Supabase signInWithOAuth, `/auth/callback`, code exchange,
`/auth/oauth/complete`, `/auth/me`, then the role-specific workspace.

Observed defects: all non-200 user verification and failed refresh responses
become 401; transport retry index controls refresh eligibility; every refresh
failure clears tokens; AuthProvider clears tokens on every profile failure;
Redis drops is_org_student; every callback failure signs out and clears tokens.

## Corrections and status contract

| Root cause | Correction |
| --- | --- |
| Every non-200 Supabase user response became 401, including outages. | Shared `auth_failures` classification in the dependency and OAuth identity resolution; only credential rejection becomes 401. |
| Refresh/password responses used blanket failure-to-401 conversion. | Classify HTTP status before reading success JSON. Supabase 400 invalid-credential codes/invalid_grant become 401; unrelated provider errors do not. Login outage does not increment failed-credential counters. |
| Signup converted provider outages into input errors; broad auth catches hid database outages. | Signup/provider and database outages return 503; genuine signup validation retains its existing contract. |
| Raw pool/query timeouts and connection failures reached generic 500 handling. | Global handlers and the CORS-safe response builder classify known database availability exceptions as 503. Unknown server failures remain 500. |
| Redis serialized/deserialized no college-student flag. | Include is_org_student, require complete current context and validate boolean/plan/counter types. |
| API refresh eligibility depended on transport attempt zero. | Independent transport counter and refresh-attempt flag. A transport retry cannot spend the request's one auth-refresh opportunity. |
| All refresh failures cleared credentials. | Only refresh 401 confirms rejection. Temporary/malformed provider responses throw a temporary renewal error and preserve recoverable material. |
| Profile refresh cleared auth on all failures; cold page guards could redirect. | Preserve the last authoritative profile. Cold-start failures keep guards waiting and display Retry. Remove fabricated free-student login/signup profiles. |
| College billing/student helpers interpreted 403 and message substrings as logout conditions. | Require structured status 401. Forbidden access and temporary failures retain the session. |
| Every Google callback error signed out, and retried consumed codes after completion outages. | Explicit terminal/temporary handling, retained exchanged session, shared callback attempt and retry UI. |

Backend outcomes:

| Condition | HTTP outcome |
| --- | --- |
| Missing/malformed credential, detected expiry, provider-confirmed rejection | 401 |
| Authenticated but unregistered/forbidden, suspended admin/organization | 403 |
| Supabase 500/502/503, request timeout/network error, provider 408/429 | 503 |
| Known database pool/query availability error | 503 |
| Unexpected provider status or incomplete success identity/session | 502 or safe server failure, never invented 401 |
| Unknown server failure | 500 |

The local HS256 expiry check now precedes cache returns, so caching cannot
extend a detected expired token. The existing JWT issuer/algorithm and local
verification model remain. This batch does not add online revocation
introspection or claim instantaneous access-token revocation by Supabase.

Provider response bodies and exception messages were removed from the changed
auth error logs. Logs use exception type only; existing global scrubbing remains.
No JWT, token, authorization header, password, verifier or Google code logging
was added. Callback error URLs use a generic error instead of provider text.

## Frontend request, refresh and session behavior

`request()` tracks `transportRetries` independently from `refreshAttempted`.
GET transport failures retain the existing bounded retry/backoff behavior.
Mutating requests are not automatically replayed for transport failures; an
authentication replay remains available following successful refresh.
Each fetch/replay gets a fresh timeout controller; one logical request retains
one request correlation ID. A 401 after an earlier transport retry can still
refresh, including with the transport budget exhausted.

Maximum authentication refresh cycles per logical request: **1**. Concurrent
401s share `refreshInFlight`; an already rotated token can be replayed without
starting another refresh. Refresh success followed by genuine replay 401 ends
authentication without a second refresh. A temporary refresh failure ends that
request with a temporary error; a later logical request can recover using the
preserved credentials. Background/new-tab restore failures are handled without
an unhandled rejection or loss of the persisted refresh token.

| Response/failure | Tokens and profile | Final auth-required event |
| --- | --- | --- |
| 403 | Preserved | No |
| 500/502/503 | Preserved | No |
| Network/timeout | Preserved | No |
| 401, refresh succeeds, replay succeeds | Rotated session, role profile preserved | No |
| 401, refresh temporarily unavailable | Recoverable access/refresh material preserved | No |
| Confirmed refresh rejection or genuine replay 401 | Cleared; response cache invalidated | Yes on protected paths |

Temporary paths do not remove coding/workspace storage keys. Tests place
unsaved-code and active-workspace sentinels in both storage surfaces and assert
preservation. This does not add a new draft persistence mechanism.
Explicit logout and genuine cross-tab logout remain. The cross-tab listener
is attached once rather than repeatedly during profile refresh.

AuthProvider keeps a known college/admin profile after a failed lookup. With
no authoritative profile yet, it keeps `loading` true for existing protected
page guards and exposes a retry alert. Successful login/signup waits for actual
role data before workspace routing. OAuth callback bootstrap leaves exchange
to the callback handler, avoiding a competing pre-completion profile request.

## Google callback

Success paths remain `/dashboard`, `/student-dashboard`, `/org-admin`, based
on actual `/auth/me` roles. Code-based callbacks are exchanged by the handler;
implicit/hash callbacks retain SDK URL detection. Google sign-in's existing
provider, redirect and account-selection options are unchanged.

Terminal errors include missing PKCE verifier, missing/expired flow state,
invalid/consumed code and invalid verifier. They return to fresh sign-in; the
callback marks the attempt terminal and will not loop on the same code.
Provider 5xx, retryable provider errors, network and timeout failures expose
Retry and do not sign out or clear session material. Unknown failures remain
retryable rather than being asserted to be invalid credentials.

The locally installed SDK's `_exchangeCodeForSession` removes the stored
verifier even in its error catch. The wrapper preserves/restores that attempt's
existing verifier on temporary failure, only when the key is absent; it never
fabricates one or replaces a still-stored newer verifier. Terminal rejection
does not restore rejected verifier material. SDK code exchange at initialization
is disabled only on a code callback, preventing it consuming the code before
the retry-aware handler. A successful exchange is retained across downstream
backend failures, and already rotated credentials are not overwritten on retry.
Concurrent/StrictMode attempts share one operation.

## Cache and college authorization

Current serialized fields:

```text
id, email, plan, owned_plans, expired_plans, is_admin, premium_override,
is_org_student, interviews_used, subscription_status
```

Memory preserves the full UserProfile object. Redis preserves true and false
college membership exactly. Entries missing any current field, containing
unknown fields, non-boolean role flags or invalid plan/counter shapes cause a
cache miss. Legacy membership is recomputed from the existing profiles query;
no global Redis flush or silent membership default is used. The existing
15-second cache TTL and full SHA-256 token key remain.

Failed authoritative profile/plan resolution cannot reach either cache write.
Tests retain a known-good college profile, force acquisition/profile failures,
and verify no cache replacement or Redis write. The only student-membership
lookup in this dependency is `profiles.org_student`; no separate lookup was
invented. is_org_admin and organization_id remain resolved by /auth/me, while
college-admin enforcement still uses owner-filtered organization_admins joins
and both organization/admin status checks. No role or tenant filter changed.
Normal students remain non-admin; college students retain Career access; college
admins remain restricted to their organization and do not gain platform admin.
The actual admin ownership join is also exercised against two organizations
and an unrelated student in a local in-memory fixture.

## Validation

| Command | Final result |
| --- | --- |
| `python -m pytest tests/test_batch1_auth_reliability.py tests/test_auth_identity.py -q --tb=short` | 74 passed |
| `python -m pytest tests -q --tb=short` | 508 passed, 0 failures; two existing dependency warnings |
| `npm run test:auth` in frontend | 56 passed, 0 failures, 0 skipped |
| `npm run typecheck` in frontend | PASS |
| `npm run lint` in frontend | PASS; zero warnings |
| Final focused ESLint check after the final frontend edits | PASS |
| `git diff --check` | PASS |

The existing auth identity, production-contract and hardening group passed;
the final full suite includes those and all Batch 0 regressions. There was no
pre-existing frontend test script/suite; the new built-in Node suite executes
the actual TypeScript/TSX modules, request client, OAuth handler and state
transitions with mocked fetch/storage/hooks. It includes all five required
transport-failure-to-401 sequences, exactly-one/shared refresh, terminal and
temporary refresh outcomes, actual abort-signal handling, cold-start/profile
failures, role routing, verifier behavior and the callback retry UI.

Backend ASGI tests execute actual dependencies/auth routes and global handlers
with mocked Supabase, Redis and database boundaries. An in-memory SQLite test
executes the unchanged owner join. Socket/DNS guards remain active. No live
Supabase, Redis, PostgreSQL or production request ran. This is offline regression
evidence, not browser end-to-end or real provider integration attestation.

Frontend dependencies were installed with
`npm ci --offline --ignore-scripts --no-audit --no-fund` from the existing local
cache. Dependency versions and lockfile remain unchanged. Lint exposed two
existing `RailIcon | any` declarations and an unused interview STT import;
these received type/import-only corrections. No interview/STT behavior changed.
The Node harness uses ES modules and adds no dependency or lint suppression.

## Batch 0 preservation and remaining release work

Before/after SHA-256 comparison: **54 files unchanged**, comprising all **38
historical SQL files** and all **16 Batch 0 source/test/report files**.
Preservation manifest digest:
`e66889c15dfa560298141b6e332995bbb24ec460544b229bcd9e30c7240b4381`.
No history/finalization pruning or startup migration execution was reintroduced.
The earlier Batch 0 report was not edited or reopened.

Database changes: NONE. Migration changes: NONE. No schema work was required.
No production connectivity, deployment, commit or push. No access to or change
in `C:\PrepVista-AI`. Pre-existing check_db.py/check_db_insert.py were untouched
and not executed. Local ignored node_modules/typecheck outputs are validation
artifacts, not candidate deployment artifacts.

Before release, isolated browser/provider integration should verify Google
redirect/PKCE behavior and session restoration across actual browser tabs;
isolated PostgreSQL/Redis tests should attest real runtime failure behavior.
The existing Batch 0 production ledger/schema/legacy-constraint, database role,
cron/storage lifecycle and account-deletion review items remain release work.
Local auth/cache tests do not attest those external states. No automatic schema
repair or production operation was attempted.

Ready for Old-Push Batch 2: **YES**. Deployment: **NO**.

## Files changed in Batch 1 (18)

```text
app/dependencies.py
app/middleware/error_handler.py
app/routers/auth.py
app/services/auth_failures.py (new)
frontend/package.json
frontend/src/lib/api.ts
frontend/src/lib/auth-context.tsx
frontend/src/lib/supabase.ts
frontend/src/lib/oauth-callback.ts (new)
frontend/src/app/auth/callback/page.tsx
frontend/src/app/org-admin/billing/page.tsx
frontend/src/app/org-admin/students/[id]/page.tsx
frontend/src/components/main-side-rail.tsx
frontend/src/components/student-side-rail.tsx
frontend/src/app/interview/[id]/page.tsx
frontend/tests/auth-reliability.test.mjs (new)
tests/test_batch1_auth_reliability.py (new)
PREPVISTA_OLD_PUSH_COLLEGE_PRODUCTION_BATCH1_AUTH_REPORT.md (new)
```

## Files inspected (31)

29 focused repository files plus two installed dependency source files. Counts
exclude this report, user attachments, search-only hits and hash-only checks.

```text
app/database/connection.py
app/dependencies.py
app/main.py
app/middleware/error_handler.py
app/routers/auth.py
app/services/auth_identity.py
app/services/auth_failures.py
frontend/package.json
frontend/tsconfig.json
frontend/eslint.config.mjs
frontend/src/lib/api.ts
frontend/src/lib/api-types.ts
frontend/src/lib/auth-context.tsx
frontend/src/lib/supabase.ts
frontend/src/lib/oauth-callback.ts
frontend/src/app/auth/callback/page.tsx
frontend/src/app/dashboard/page.tsx
frontend/src/app/org-admin/billing/page.tsx
frontend/src/app/org-admin/students/[id]/page.tsx
frontend/src/app/interview/[id]/page.tsx
frontend/src/components/auth-header.tsx
frontend/src/components/main-side-rail.tsx
frontend/src/components/student-side-rail.tsx
frontend/src/components/icons.tsx
frontend/tests/auth-reliability.test.mjs
requirements-dev.txt
tests/conftest.py
tests/test_auth_identity.py
tests/test_batch1_auth_reliability.py
frontend/node_modules/@supabase/auth-js/src/GoTrueClient.ts
frontend/node_modules/@supabase/supabase-js/src/SupabaseClient.ts
```

STOP. DO NOT DEPLOY.
