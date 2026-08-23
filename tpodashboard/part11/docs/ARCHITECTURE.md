# ARCHITECTURE.md

Reasoning behind the non-obvious decisions in this build, so a future
maintainer (human or AI) doesn't have to reverse-engineer intent from code.

## Why no ORM

Prisma was the first choice — it's what most teams reach for with
TypeScript + SQL. It was actually installed and configured first. It was
removed after `npx prisma generate` failed:

```
Error: Failed to fetch sha256 checksum at
https://binaries.prisma.sh/.../libquery_engine.so.node.gz.sha256 - 403 Forbidden
```

Prisma's query engine ships as a native binary fetched at install/generate
time from `binaries.prisma.sh`. This sandbox's network allowlist doesn't
include that domain, and there's no reasonable way to "fix" that from
inside a build task — it's an environment constraint, not a bug. The same
failure mode would hit any network-restricted CI runner or an institution's
locked-down internal network, which is a realistic deployment target for a
college placement system. Rather than build on a dependency with an
unpredictable install-time network requirement, this build uses:

- **`node:sqlite`** (`DatabaseSync`) — built into Node 22+, zero network
  dependency, verified directly in this environment before committing to
  it (see the empirical checks that were run: return shapes of `.get()`,
  `.all()`, `.run()`, and that transactions via plain `BEGIN`/`COMMIT`/
  `ROLLBACK` work as expected).
- **A hand-written repository layer** (`db/repositories/*.ts`) as the only
  code that contains SQL. Every service imports repository functions, never
  the database connection directly. This is what makes the SQLite→Postgres
  swap contained: reimplement `db/repositories/*.ts` and `src/lib/db.ts`
  against `pg` (or any Postgres client) with the same function signatures,
  and nothing above that layer — the RBAC logic, the rank checks, the
  audit trail, the routes — needs to change.

`node:sqlite` is still flagged experimental by Node itself (you'll see
`ExperimentalWarning: SQLite is an experimental feature` on every start —
this is expected and harmless). If that's a concern for a given deployment,
`better-sqlite3` is a drop-in-shaped alternative with the same synchronous
`.prepare().get()/.all()/.run()` API and no native-binary network fetch
(it downloads prebuilt binaries from GitHub releases, or compiles from
source) — swapping `src/lib/db.ts`'s import would be the only change
required.

## Why database-backed sessions instead of JWT

Spec section 10 asks for: list active sessions, revoke a specific one, sign
out everywhere else, and section 57 requires that a role or status change
"must update safely... do not allow stale privileges indefinitely." A
stateless JWT can't satisfy that without extra machinery (a revocation
list, which is itself a database — at which point you've built sessions
anyway, with more moving parts).

Instead: `POST /api/auth/login` generates a random 32-byte token, returns
it once, and stores only its SHA-256 hash in the `sessions` table. Every
authenticated request looks up that hash, and if found, re-reads the
user's current role, permissions, department, and status **fresh from the
database** — nothing about authorization is cached in the token. A role
change, a deactivation, or an explicit session revocation all take effect
on literally the next request, which is what the tests in
`tests/security/sessionAndDeactivation.test.ts` verify directly.

## Why email is globally unique, not per-institution

`users.email` has a single global `UNIQUE` constraint rather than
`UNIQUE(institution_id, email)`. This means:

- Login is just `{email, password}` — no institution selector needed.
- A real person can only ever hold **one** PrepVista account, at one
  institution, tied to one email address.

The alternative (institution-scoped uniqueness) is what you'd want if the
same person could legitimately need separate accounts at two different
colleges. If that becomes a real requirement, the changes are: drop the
global unique constraint in `db/schema.sql`, add it back as
`UNIQUE(institution_id, email)`, and add an institution-selection step to
login (since "which account?" becomes ambiguous for a shared email). Every
other authorization/audit/scoping mechanism in this build is already keyed
by `institution_id`, not by email, so nothing else would need to change.

## Finding: the "last Super Admin" guard is currently unreachable — and why it's still there

`userService.ts` contains `assertNotLastActiveInRole()`, which blocks
demoting or deactivating an institution's only remaining active Super
Admin. Working through the actual call graph during the adversarial
self-review (spec section 72) surfaced something worth stating plainly:
**today, nothing can ever reach the state that guard is checking for.**

Here's why. Only a Super Admin may act on another Super Admin (the rank
check in `canActOnRank` exempts `SUPER_ADMIN` from the "must outrank the
target" rule, but every other role is still blocked from touching a
same-or-higher-ranked user). Separately, no one — Super Admin included —
may change their own role or status; that's checked unconditionally,
before the rank/last-admin logic even runs. Put those two together: the
only actor who could ever legally touch "the sole remaining Super Admin"
is that Super Admin themselves, and that path is closed off by the
self-action rule first. So the count-of-remaining-admins check never
actually gets to fire in this codebase as it stands.

The guard was kept anyway, deliberately, as defense-in-depth: if a future
change ever relaxes the self-action rule (e.g., to let an admin edit their
own profile fields through the same endpoint), or introduces a role that's
permitted to act on Super Admins under some other condition, this check is
what stops that change from silently making "zero active Super Admins" a
reachable state. `tests/security/privilegeEscalation.test.ts` tests the
invariant that's actually load-bearing today (a solo Super Admin cannot
deactivate themselves) rather than asserting on the unreachable branch.

## What "MFA-ready" means here, concretely

Spec section 12 asks for architecture capable of supporting MFA, not a
working MFA implementation, and this build takes that literally: `users`
has an `mfa_enabled` column and nothing else. There is no TOTP secret
storage, no verification step in the login flow, no recovery codes. Adding
real TOTP support later means: a `mfa_secret` column (which would need
encryption at rest — a column added purely to hold a value doesn't get you
that for free), a second step in `authService.login()` after password
verification succeeds and before a session is issued, and an endpoint to
enroll/disable it. None of that exists yet. See the truth table in
`PART11_BUILD_STATUS.md` — this is marked NOT IMPLEMENTED, not PARTIAL,
because a single unused boolean column isn't a control.

## Why the AI governance service has no AI to govern

Sections 42–44 and 80 ask Part 11 to expose the permission boundary a
future AI agent (Parts 12/14) must operate inside. `services/ai-governance/
aiGovernanceService.ts` implements that boundary for real: `getAllowedAITools(user)`
filters a tool→permission map against the calling user's actual, current
RBAC permissions — a Department Coordinator's list will never include a
tool mapped to `students.write`, because that role doesn't hold it. That's
a genuine, testable authorization function. What doesn't exist is
anything on the other end calling it — there is no AI agent, tool
dispatcher, or LLM integration in this build. The function is a real
boundary with nothing behind it yet to enforce it against.

## Why SQLite for this deliverable, and what changes for Postgres

SQLite (via `node:sqlite`) was chosen for the shipped dev/demo
configuration specifically because it requires no server process, no
connection string beyond a file path, and no network access to set up —
appropriate for something meant to run immediately after `npm install`.
For an actual multi-user production deployment, Postgres is the right
choice (concurrent writers, real connection pooling, proper `TIMESTAMPTZ`
instead of ISO-string `TEXT` columns). The migration path:

1. Reimplement `src/lib/db.ts`'s exports (`db`, `withTransaction`,
   `runMigrations`) against a Postgres client (e.g. `pg` with a pool).
2. Port `db/schema.sql` — mechanically similar, with `TEXT` timestamp
   columns becoming `TIMESTAMPTZ` and SQLite's `strftime(...)` defaults
   becoming `now()`.
3. Re-point each file in `db/repositories/*.ts` at the new client's query
   API (parameter placeholder syntax changes from `?` to `$1, $2, ...`;
   the function signatures — inputs and return shapes — do not need to
   change).

Nothing in `services/`, `api/`, or `src/middleware/` references SQLite
directly; they only ever import from `db/repositories/*`.
