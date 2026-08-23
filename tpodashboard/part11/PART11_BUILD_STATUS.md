# PART11_BUILD_STATUS.md

Honest status report, organized around the same A–AB structure the source
spec asks for in its own section 89. Every claim below was checked against
running code in this session — see `docs/PART11_RECONNAISSANCE.md` for how,
and the "Evidence" column for exactly what was run.

**Legend**: 🟢 IMPLEMENTED · 🟡 PARTIAL · 🔵 FOUNDATION / DEV-TEST ONLY · ⚪ NOT IMPLEMENTED

## A. Executive summary

This build is a from-scratch backend (Node/TypeScript/Express, `node:sqlite`,
no ORM) plus a static dashboard, covering the security- and
governance-critical core of the Part 11 spec as real, running, tested code:
authentication, session management, RBAC, tenant isolation, audit,
user/role/policy administration, and a working data-quality engine. It does
**not** cover the full 89-section spec — most of what's out of scope
depends on Parts 1–10 (students, drives, offers, documents...) that don't
exist anywhere in this environment. Nothing below claims more than what was
actually built and verified.

## B. Product boundary confirmation

🟢 **Student + TPO + Management only.** No recruiter account, role, login,
dashboard, or API exists anywhere in this codebase. `companies.read` /
`companies.write` exist only as *permission keys* a TPO-side role could
hold over company **records** — never as recruiter-facing access. Verified
by inspection: `grep -ri recruiter` across the project returns nothing
except this note.

## C. Authentication

| Control | Status | Evidence |
|---|---|---|
| Password hashing (bcrypt, cost 12) | 🟢 | `src/lib/crypto.ts`; no plaintext password ever touches disk |
| Session/token issuance & validation | 🟢 | live curl + `tests/security/*` |
| Session expiry (12h) | 🟢 | `services/sessions/sessionService.ts` |
| Logout / logout-all-other-sessions | 🟢 | tested |
| Login failure handling (generic message) | 🟢 | `authService.ts` — same message for wrong password, unknown email, unactivated account |
| Rate limiting | 🟢 | IP-based (`express-rate-limit`) + account lockout (5 attempts / 15 min), two independent layers |
| Password reset (single-use, expiring, generic response) | 🟢 | tested via dev outbox |
| Password change flow | 🟢 | revokes other sessions on change |
| Account lock strategy | 🟢 | `failed_login_attempts` / `locked_until` columns |
| MFA | 🔵 | schema field only (`mfa_enabled`); no TOTP, no verification step — see ARCHITECTURE.md |

## D. Session management

🟢 List active sessions (device, created, last activity, current-session
flag), revoke one, sign out all others. Database-backed opaque tokens, not
JWT, specifically so this all takes effect immediately — see
ARCHITECTURE.md for why.

## E. RBAC

🟢 User → Role → Permission → Resource → Action, enforced server-side in
`services/authorization/rbac.ts` and `src/middleware/authenticate.ts`.
No `if (role === 'admin')` anywhere in frontend code as a security boundary
— the dashboard's UI hides buttons the user can't use, but every single
action is re-checked server-side regardless of what the client sends.

## F. Permissions

🟡 The full registry from spec section 14 is seeded (`students.*`,
`companies.*`, `drives.*`, `applications.*`, `interviews.*`, `offers.*`,
`training.*`, `readiness.*`, `reports.*`, `communication.*`, `users.*`,
`roles.*`, `policies.*`, `audit.read`, `settings.*`, `sessions.*`,
`data_quality.read` — 35 keys total). Only the subset with a real
consuming module in this build (users, roles, departments, policies,
audit, sessions, data quality, settings) is actually enforced by a route
today. The rest exist so Parts 1–10 can consume the same registry without
Part 11 changing when they're built.

## G. Tenant isolation

🟢 Every repository query that touches institution-owned data takes
`institutionId` as a required parameter — there is no "list all X" code
path. Tested directly via the API (not just checking the UI hides things):
`tests/security/tenantIsolation.test.ts`, 4/4 passing, including a direct
cross-tenant role-change attempt via curl-equivalent supertest calls.

## H. Institution settings

🟡 Departments (create, list, archive — never hard-delete) are real.
Institution name/timezone exist. Everything else spec section 21 lists
(logo, address, academic batches/programs/graduation years, communication
channel config, readiness model config, report branding) is ⚪ not
implemented — those belong to modules (Parts 2, 9, 10) that don't exist.

## I. Placement policies

🟡 Real versioning: every write creates a new version, supersedes the
previous one, and is fully audited with before/after state
(`tests/admin/policyVersioning.test.ts`, 2/2 passing). ⚪ "This change may
affect N active students/drives" impact preview (spec section 23) is not
implemented — there's no student/drive data in this build to calculate
against.

## J. User administration

🟢 Invite → accept → activate, deactivate/suspend/reactivate, role change
— all rank-checked (a role can only act on strictly lower-ranked users,
and can only assign strictly lower-ranked roles than its own), all
audited, all force-revoke sessions where relevant. No destructive delete
anywhere — status transitions only, matching spec section 16.

## K. Data quality

🟡 A real, working check engine (`services/data-quality/`) with 5 checks
against this build's actual data: department-scoped roles missing a
department, expired unaccepted invitations, stale invited accounts, active
sessions belonging to inactive users, and inactive departments with active
users still assigned. Verified triggering a real issue and seeing it
appear (`tests/admin/dataQuality.test.ts`). ⚪ Checks that need Parts 1–10
data (duplicate students, orphan applications, offers without a final
selection) aren't implemented — there's nothing to check yet. ⚪ Duplicate/
merge management (spec sections 28–29) not implemented.

## L. Audit

🟢 Append-only (`audit_events` has no UPDATE/DELETE route anywhere in the
API — verified by testing that PUT/PATCH/DELETE against `/api/admin/audit/*`
return 404 even for a fully authorized Super Admin, not just 401 for lack
of auth). Filterable by actor, action, entity type, date range, paginated.

## M. Security events

🟢 A genuine filtered view over the same audit log (failed logins,
lockouts, role/status changes, session revocations, custom role creation)
— not a separate, fabricated table.

## N. Document governance

⚪ Not implemented. No document model exists in this build (Parts 1–10 own
document upload/storage, and none of them exist here).

## O. Privacy / sensitive field protection

🟡 Role-based read access is real and enforced (a Department Coordinator's
user list is department-scoped at the query level, not filtered
after the fact). A formal sensitive-field classification layer (salary,
offer documents, internal notes — spec section 33) is not implemented;
none of those fields exist in this build.

## P. Export security

⚪ Not implemented. `reports.export` exists in the permission registry but
nothing consumes it — there's no report data to export.

## Q. AI governance

🟡 `services/ai-governance/aiGovernanceService.ts` is a real, working
permission-boundary function set — `getAllowedAITools(user)` derives
strictly from the calling user's actual current RBAC permissions (verified
live: a Department Coordinator's allowed tools correctly exclude
`edit_students` and `send_communication`, which their role doesn't hold
permission for). What doesn't exist: any actual AI agent, tool dispatcher,
or LLM call in this build — this is the boundary with nothing behind it
yet to enforce it against.

## R. Integration governance

🟡 `/api/admin/system/integrations` reports real status (`CONNECTED` /
`NOT_CONFIGURED`) derived from actual environment variables — every one
of them correctly shows `NOT_CONFIGURED` in this environment because none
are set, not because the check is fake. No actual provider (email, SMS,
WhatsApp, storage, AI) is wired up. Secret masking has nothing to mask yet;
the pattern (env-var-backed, never in frontend source) is followed.

## S. System health

🟢 Real database ping with real latency. Queue, document storage, and
backups honestly report `NOT_CONFIGURED` — this build never claims a
health check passed for something that isn't connected.

## T. Backup / recovery foundation

🔵 System health correctly reports "Backup monitoring not configured" —
matching the spec's own requested exact phrasing for the unconfigured
case. ⚪ No actual backup process exists to monitor, and no
disaster-recovery runbook was written, because writing recovery
procedures for infrastructure that doesn't exist would itself be exactly
the kind of fabrication this spec repeatedly says not to do.

## U. Security review

🟡 Folded into the testing work below rather than produced as a separate
review document. See V.

## V. Hostile review

🟡 Real adversarial testing was performed and is committed as passing,
repeatable tests — not a one-time manual pass — covering direct-API
attacks (not just checking the UI hides buttons) for tenant isolation,
privilege escalation, rank-based access control, session tampering, and
audit immutability. One real design finding came out of this process (see
ARCHITECTURE.md: the last-Super-Admin guard's reachability). What wasn't
done: a separate formal `PART11_HOSTILE_REVIEW.md` write-up structured as
its own red-team narrative, and explicit document-URL/storage-credential
attacks (no documents exist in this build to attack).

## W. Research findings

⚪ No dedicated research phase or `PART11_RESEARCH.md`/
`PART11_RESEARCH_UPGRADE.md` documents were produced — this build did not
perform live lookups of current OWASP/framework guidance while working.
The security patterns used (bcrypt cost 12, single-use expiring tokens,
generic auth error messages to prevent enumeration, hashed-at-rest bearer
tokens, IP + account-level rate limiting) follow well-established,
widely-documented practice, but that's a different thing from a cited
research pass, and this section says so plainly rather than presenting one
as the other.

## X. Improvements after review

🟢 Real examples from this build, not hypothetical: the users-list
endpoint originally returned raw internal `roleId`/`departmentId` values
to the client and was changed to return readable role/department names
once the dashboard made that gap visible; the audit-immutability test was
initially wrong (asserting 404 for an *unauthenticated* mutating request,
which actually returns 401 because the auth middleware runs first) and
was corrected to test the real claim — that even an *authorized* Super
Admin has no such route available.

## Y. Tests and results

🟢 23/23 automated tests passing (`npm test`, Node's built-in test runner
+ `node:sqlite`, run against a freshly-migrated database each run):

- `tests/security/tenantIsolation.test.ts` — 4/4
- `tests/security/privilegeEscalation.test.ts` — 9/9
- `tests/security/sessionAndDeactivation.test.ts` — 4/4
- `tests/admin/auditImmutability.test.ts` — 2/2
- `tests/admin/dataQuality.test.ts` — 2/2
- `tests/admin/policyVersioning.test.ts` — 2/2

Plus a full clean-room regression performed manually in this session:
fresh DB → `tsc` production build → seed → boot the **compiled** server →
live curl through login, `/me`, wrong-password, missing-token, data
quality, policy creation, system health, and AI-governance endpoints —
all matching the dashboard's exact expected response shapes.

## Z. Integration with Parts 10, 12, 13, 14, 16

🟡 Real, working integration functions exist for Part 10
(`services/integration/part10Bridge.ts`: `getDataQuality`,
`getAuditEvidence`, `getPolicyConfiguration`, `getMetricConfiguration`,
`getReportReadiness`) and Part 12/14
(`services/ai-governance/aiGovernanceService.ts`). Nothing calls them,
because Parts 10/12/14 don't exist in this environment. ⚪ Part 13
(proactive AI notification permissions) and Part 16 hooks are not
implemented or stubbed — the source spec gives too little concrete detail
about either to build a real seam rather than a guess.

## AA. Demo walkthrough

🟡 Most of spec section 88's walkthrough works for real against the
seeded demo data: sign in as TPO Head, see real card counts, open Data
Quality, see the genuine seeded issue (ECE marked inactive with an active
coordinator still assigned), create a Department Coordinator, confirm
their access is department-scoped, deactivate a user and confirm their
session dies immediately. The exact cosmetic numbers in the spec's example
("42 Active Users, 3 Security Alerts...") aren't reproduced verbatim —
real seeded data produces different, real numbers instead, which is the
point.

## AB. This table

Is this document.
