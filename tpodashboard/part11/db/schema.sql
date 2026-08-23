-- PrepVista AI — Part 11 schema.
-- Written as plain SQL (no ORM) so it is fully portable and auditable.
-- Targets SQLite for local dev/demo. For Postgres in production: swap TEXT
-- timestamp columns for TIMESTAMPTZ, INTEGER booleans for BOOLEAN, and apply
-- via a real migration tool — the shape of the schema itself does not change.

CREATE TABLE IF NOT EXISTS institutions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(institution_id, code)
);
CREATE INDEX IF NOT EXISTS idx_departments_institution ON departments(institution_id);

-- Roles are per-institution rows (even system-default roles get their own copy
-- per institution) so that institution-specific customization is always safe.
CREATE TABLE IF NOT EXISTS roles (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,
  rank            INTEGER NOT NULL, -- higher = more privileged; used for escalation checks, NOT for permission grants
  is_system       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(institution_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_institution ON roles(institution_id);

-- Permissions are global: "students.read" means the same thing everywhere.
CREATE TABLE IF NOT EXISTS permissions (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        TEXT NOT NULL REFERENCES roles(id),
  permission_id  TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- Email is globally unique (not per-institution) — see docs/ARCHITECTURE.md
-- for why, and what would need to change to support one person across
-- multiple institutions.
CREATE TABLE IF NOT EXISTS users (
  id                     TEXT PRIMARY KEY,
  institution_id         TEXT NOT NULL REFERENCES institutions(id),
  email                  TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  password_hash          TEXT,
  role_id                TEXT NOT NULL REFERENCES roles(id),
  department_id          TEXT REFERENCES departments(id),
  status                 TEXT NOT NULL DEFAULT 'INVITED', -- INVITED | ACTIVE | SUSPENDED | DEACTIVATED
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until           TEXT,
  mfa_enabled            INTEGER NOT NULL DEFAULT 0, -- foundation field; see docs/ARCHITECTURE.md
  last_login_at          TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

-- Sessions are opaque, database-backed bearer tokens (not JWTs) specifically
-- so that revocation and role/status changes take effect immediately instead
-- of waiting for a token to expire. Only the SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  institution_id  TEXT NOT NULL REFERENCES institutions(id),
  token_hash      TEXT NOT NULL UNIQUE,
  user_agent      TEXT,
  ip_address      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_active_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at      TEXT,
  expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Single-use tokens for invitations and password resets. Only the hash is
-- stored; the plaintext token exists only in the response/dev-outbox at
-- creation time and can never be recovered from the database.
CREATE TABLE IF NOT EXISTS security_tokens (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL REFERENCES institutions(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  purpose         TEXT NOT NULL, -- INVITE | PASSWORD_RESET
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  used_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_security_tokens_user ON security_tokens(user_id);

CREATE TABLE IF NOT EXISTS policies (
  id               TEXT PRIMARY KEY,
  institution_id   TEXT NOT NULL REFERENCES institutions(id),
  key              TEXT NOT NULL,
  version          INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUPERSEDED
  effective_date   TEXT NOT NULL,
  config           TEXT NOT NULL, -- JSON
  changed_by_id    TEXT NOT NULL,
  reason           TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(institution_id, key, version)
);
CREATE INDEX IF NOT EXISTS idx_policies_institution_key ON policies(institution_id, key);

-- Append-only. No route anywhere issues UPDATE or DELETE against this table.
CREATE TABLE IF NOT EXISTS audit_events (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL REFERENCES institutions(id),
  actor_id        TEXT REFERENCES users(id), -- null for unauthenticated events (e.g. failed login)
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  old_state       TEXT, -- JSON
  new_state       TEXT, -- JSON
  reason          TEXT,
  ip_address      TEXT,
  correlation_id  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_institution_created ON audit_events(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_institution_action ON audit_events(institution_id, action);

-- Dev-only stand-in for a real email/SMS provider. Never written to in
-- production (see services/system/systemService.ts). Nothing here should
-- ever be read as "the email was sent" — it wasn't; no provider is wired up.
CREATE TABLE IF NOT EXISTS dev_outbox_messages (
  id          TEXT PRIMARY KEY,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
