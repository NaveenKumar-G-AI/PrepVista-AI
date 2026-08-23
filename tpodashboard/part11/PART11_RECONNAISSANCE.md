# PART11_RECONNAISSANCE.md

## What was actually found in the environment

Before writing any code, the working environment was inspected directly:
`/home/claude` (the scratch workspace) and `/mnt/user-data/uploads` (where
uploaded files land) were both checked. Neither contained a PrepVista
repository, source files, or any trace of "Parts 1–10." The only input was
the Part 11 build prompt itself.

This matters because Part 11's own spec assumes an existing codebase and
opens with a mandatory repository audit ("search for admin, user, role,
permission, auth..."). That audit could not be performed because there is
nothing to audit. Consequently:

- There is no existing authentication, authorization, tenant model, or
  admin UI to reconcile with, extend, or avoid duplicating.
- There are no Part 1–10 or Part 12–16 modules to integrate against. The
  integration hooks the spec asks for (sections 79–82) are implemented as
  real, working functions, but nothing currently calls them.
- Folder ownership (section 85: `services/auth/**`, `services/audit/**`,
  `api/admin/**`, `tests/security/**`, etc.) is followed anyway, so that if
  this build is dropped into a larger monorepo later, it lands in the
  right places without a restructure.

## What this build is, concretely

A standalone, runnable Node.js/TypeScript backend plus a static dashboard,
implementing the security- and governance-critical core of the spec as
real, tested code — not a mockup. See `docs/PART11_BUILD_STATUS.md` for an
honest, section-by-section accounting of what is fully implemented,
partially implemented, foundation-only, or not attempted, and
`docs/ARCHITECTURE.md` for the reasoning behind each non-obvious decision
below.

## Decisions made in the absence of a repository to match

Because there were no existing conventions to discover, these choices were
made deliberately and are documented so they can be revisited:

1. **Stack**: Express + TypeScript, no framework opinion beyond that,
   because none was specified and none could be discovered.
2. **Database**: SQLite via Node's built-in `node:sqlite`, no ORM. Prisma
   was tried first and rejected — its query-engine binary requires
   downloading from `binaries.prisma.sh`, which this sandbox's network
   policy does not allow, and that failure would just as easily hit a
   locked-down CI runner or air-gapped institutional network. A thin,
   hand-written repository layer (`db/repositories/*.ts`) sits between raw
   SQL and every service, so swapping to Postgres for production is a
   contained change, not a rewrite (see ARCHITECTURE.md).
3. **Multi-tenancy**: every table that holds institution-owned data carries
   `institution_id`, and every repository query that lists or mutates such
   data takes the caller's institution id as a required parameter — there
   is no code path that queries "all X" without a tenant filter.
4. **Sessions, not JWTs**: bearer tokens are opaque, database-backed, and
   hashed at rest, specifically so that revocation and role/status changes
   take effect on the very next request instead of waiting for a token to
   expire (spec section 57 explicitly requires this).
5. **Email is globally unique**, not unique-per-institution, which is a
   simplification — see ARCHITECTURE.md for what would need to change to
   support one person holding accounts at two institutions.

## Vulnerabilities/gaps found during build (self-review, spec section 72)

- The originally-designed "cannot remove the last Super Admin" guard turned
  out to be unreachable through the API in combination with the "no user
  may act on themselves" rule — see ARCHITECTURE.md for the finding and
  why the guard was kept anyway as defense-in-depth, plus the tests that
  verify the actual protective invariant.
- `node:sqlite` is an experimental Node API (Node's own `--experimental-`
  warning prints on every start). It was verified directly against Node
  22.22.2 rather than assumed from training knowledge — see
  ARCHITECTURE.md for what changes if it's promoted or removed upstream.
