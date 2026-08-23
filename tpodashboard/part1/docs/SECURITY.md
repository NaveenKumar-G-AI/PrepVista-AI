# Security Notes

## What's implemented

- **Password hashing**: `bcrypt` directly (not passlib — see
  `LIMITATIONS.md` for why), cost factor 12 (library default), 72-byte
  input truncated per bcrypt's own limit rather than erroring.
- **Auth**: JWT bearer tokens, HS256, signed with `JWT_SECRET_KEY` (env
  var, no default usable in production — the shipped default is
  obviously a placeholder: `dev-only-insecure-secret-change-me`).
- **Tenant isolation**: enforced in `app/deps.py`, not the frontend.
  `institution_id` for every query comes from the authenticated user's
  own row, never from client input. Proven by
  `tests/test_tenant_isolation.py` (3 tests: cross-tenant read blocked,
  cross-tenant write blocked, dashboard counts scoped correctly).
- **Authorization**: `require_roles()` dependency factory exists for
  role-gating specific endpoints (not yet applied to every route in
  Part 1 — see below).
- **Input validation**: every request body is a Pydantic model; FastAPI
  rejects malformed JSON/types before a handler runs.
- **SQL injection**: SQLAlchemy's query builder is used everywhere;
  there is no raw string-interpolated SQL anywhere in the codebase
  (the one raw `execute()` in the Alembic migration's enum cleanup uses
  a fixed, code-defined list of type names, never user input).
- **Rate limiting**: login attempts, 10 per 5 minutes per email by
  default (configurable).
- **CORS**: explicit allow-list from settings, not `*`.
- **Secrets**: nothing in frontend code (there's no frontend in Part
  1); backend secrets come from environment variables, never literals
  in source (`.env` is gitignored by convention — add it to your
  `.gitignore` if it isn't already).
- **404 vs 403 on cross-tenant access**: a request for another
  institution's record returns 404, not 403 — this avoids confirming
  the record exists at all to someone who shouldn't see it.

## What's NOT fully implemented (be deliberate about these before production)

- **Per-route role enforcement**: `require_roles()` exists but most
  Part-1 routes only require *any* authenticated user of the tenant,
  not a specific role. Wiring least-privilege per endpoint (e.g. only
  TPO_HEAD/PLACEMENT_OFFICER can import students) is straightforward —
  add `current_user: Annotated[User, Depends(require_roles(UserRole.TPO_HEAD, UserRole.PLACEMENT_OFFICER))]`
  to a route — but it hasn't been applied endpoint-by-endpoint yet.
- **Token revocation**: JWTs are stateless; there's no server-side
  session to kill on logout. A compromised token is valid until it
  expires (default 8 hours). A refresh-token model with a revocation
  list is the standard fix and isn't built here.
- **CSRF**: not applicable to the current bearer-token design (see
  `LIMITATIONS.md`), but relevant again if a cookie-based session is
  ever introduced.
- **Rate limiting beyond login**: only the login endpoint is rate
  limited. Import and other write-heavy endpoints have no rate limit.
- **Audit log is append-only in application code, not database-enforced**:
  nothing currently prevents a direct DB update to an `audit_records`
  row (no DB-level trigger or permission lockdown). For a real
  compliance requirement, that needs a dedicated, more restricted DB
  role for the audit table.
- **File upload scanning**: uploaded import files are parsed but not
  virus/malware scanned. Fine for spreadsheet data; matters more once
  resumes/documents are actually accepted at scale.

## Secrets checklist for a real deployment

- [ ] Generate a real `JWT_SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(64))"`) and store it in a secrets manager, not a `.env` file on disk
- [ ] Generate a strong, unique `DATABASE_URL` password
- [ ] Set `ENVIRONMENT=production` (this also disables `scripts/seed.py`)
- [ ] Set `DEBUG=false`
- [ ] Restrict `CORS_ALLOW_ORIGINS` to your real frontend origin(s)
- [ ] Put TLS in front of this (a reverse proxy — nginx/Caddy/your cloud LB), not raw uvicorn
