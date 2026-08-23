-- Companies & Recruiters — SQLite schema
--
-- `institution` and `app_user` are minimal STAND-INS for Part 1's real tenant/auth
-- tables. When this merges into the real repo, drop these two tables and repoint every
-- `institution_id` / `*_id references app_user` at the real tables — nothing else here
-- should need to change, since every foreign key already just points at an id.

PRAGMA foreign_keys = ON;

create table institution (
  id         text primary key,
  name       text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table app_user (
  id             text primary key,
  institution_id text not null references institution(id),
  name           text not null,
  email          text not null unique,
  password_hash  text not null,
  role           text not null default 'TPO',
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table session (
  token          text primary key,
  user_id        text not null references app_user(id) on delete cascade,
  institution_id text not null references institution(id),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at     text not null
);
create index idx_session_expires on session (expires_at);

-- ---------------------------------------------------------------------------
-- Configurable per-institution taxonomies (not hardcoded enums)
-- ---------------------------------------------------------------------------

create table company_industry (
  id             text primary key,
  institution_id text not null references institution(id),
  name           text not null,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (institution_id, name)
);

create table company_tag (
  id             text primary key,
  institution_id text not null references institution(id),
  name           text not null,
  color          text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (institution_id, name)
);

-- ---------------------------------------------------------------------------
-- Company
-- ---------------------------------------------------------------------------

create table company (
  id                    text primary key,
  institution_id        text not null references institution(id),
  name                  text not null,
  normalized_name       text not null,
  legal_name            text,
  brand_name            text,
  website               text,
  website_domain        text,
  industry_id           text references company_industry(id),
  sector                text,
  company_size          text,
  headquarters_city     text,
  headquarters_state    text,
  headquarters_country  text,
  description           text,
  logo_document_id      text references company_document(id),
  status                text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  relationship_stage    text not null default 'PROSPECT' check (relationship_stage in (
                           'PROSPECT','CONTACTED','INTERESTED','REQUIREMENT_RECEIVED',
                           'DRIVE_SCHEDULED','DRIVE_COMPLETED','HIRING','REPEAT_RECRUITER','INACTIVE'
                         )),
  relationship_owner_id text references app_user(id),
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at           text
);

create index idx_company_institution       on company (institution_id);
create index idx_company_institution_stage on company (institution_id, relationship_stage);
create index idx_company_normalized_name   on company (institution_id, normalized_name);
create index idx_company_website_domain    on company (institution_id, website_domain);
create index idx_company_status            on company (institution_id, status);

create table company_tag_link (
  company_id text not null references company(id) on delete cascade,
  tag_id     text not null references company_tag(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by text references app_user(id),
  primary key (company_id, tag_id)
);

create table company_address (
  id          text primary key,
  company_id  text not null references company(id) on delete cascade,
  type        text,
  city        text,
  state       text,
  country     text,
  address     text,
  postal_code text,
  is_primary  integer not null default 0
);
create index idx_company_address_company on company_address (company_id);

-- ---------------------------------------------------------------------------
-- Recruiter contacts
-- ---------------------------------------------------------------------------

create table recruiter_contact (
  id                text primary key,
  institution_id    text not null references institution(id),
  company_id        text not null references company(id) on delete cascade,
  name              text not null,
  designation       text,
  department        text,
  email             text,
  phone             text,
  alternate_phone   text,
  linkedin_url      text,
  preferred_channel text check (preferred_channel in ('EMAIL','PHONE','WHATSAPP','LINKEDIN','OTHER')),
  notes             text,
  status            text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  is_primary        integer not null default 0,
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index idx_contact_institution on recruiter_contact (institution_id);
create index idx_contact_company     on recruiter_contact (company_id);
create unique index uq_contact_company_primary on recruiter_contact (company_id) where is_primary = 1;

create table recruiter_contact_history (
  id         text primary key,
  contact_id text not null references recruiter_contact(id) on delete cascade,
  field_name text not null,
  old_value  text,
  new_value  text,
  changed_by text references app_user(id),
  changed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_contact_history_contact on recruiter_contact_history (contact_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Activity, follow-ups, notes, documents, status history
-- ---------------------------------------------------------------------------

create table recruiter_activity (
  id             text primary key,
  institution_id text not null references institution(id),
  company_id     text not null references company(id) on delete cascade,
  contact_id     text references recruiter_contact(id),
  actor_id       text references app_user(id),
  type           text not null check (type in (
                    'CALL','EMAIL','MEETING','VISIT','RECRUITER_REQUEST','REQUIREMENT_RECEIVED',
                    'DRIVE_DISCUSSION','FOLLOWUP','NOTE','OTHER'
                  )),
  subject        text,
  summary        text,
  occurred_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  next_action    text,
  metadata       text, -- JSON-encoded
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_activity_company_time     on recruiter_activity (company_id, occurred_at desc);
create index idx_activity_institution_time on recruiter_activity (institution_id, occurred_at desc);

create table recruiter_followup (
  id             text primary key,
  institution_id text not null references institution(id),
  company_id     text not null references company(id) on delete cascade,
  contact_id     text references recruiter_contact(id),
  owner_id       text references app_user(id),
  title          text not null,
  description    text,
  priority       text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  due_at         text not null,
  status         text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  completed_at   text,
  completed_by   text references app_user(id),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_followup_institution_status_due on recruiter_followup (institution_id, status, due_at);
create index idx_followup_owner_status           on recruiter_followup (owner_id, status);
create index idx_followup_company                on recruiter_followup (company_id, status);
-- "Overdue" is never stored — it's status in ('OPEN','IN_PROGRESS') and due_at < now(),
-- computed in followupService so it can never go stale. See services/followupService.ts.

create table company_note (
  id             text primary key,
  institution_id text not null references institution(id),
  company_id     text not null references company(id) on delete cascade,
  author_id      text references app_user(id),
  body           text not null,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_note_company on company_note (company_id, created_at desc);

create table company_document (
  id             text primary key,
  institution_id text not null references institution(id),
  company_id     text not null references company(id) on delete cascade,
  type           text not null check (type in (
                    'COMPANY_PROFILE','RECRUITER_REQUEST','JD','INVITATION','AGREEMENT_MOU','OTHER'
                  )),
  title          text,
  file_reference text not null,
  uploaded_by    text references app_user(id),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_document_company on company_document (company_id);

create table company_status_history (
  id         text primary key,
  company_id text not null references company(id) on delete cascade,
  old_stage  text,
  new_stage  text not null,
  actor_id   text references app_user(id),
  reason     text,
  changed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_status_history_company on company_status_history (company_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Audit log — every important mutation writes one row here (Phase 17)
-- ---------------------------------------------------------------------------

create table audit_log (
  id             text primary key,
  institution_id text not null references institution(id),
  actor_id       text references app_user(id),
  entity_type    text not null,
  entity_id      text not null,
  action         text not null,
  before_value   text, -- JSON-encoded
  after_value    text, -- JSON-encoded
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index idx_audit_institution_time on audit_log (institution_id, created_at desc);
create index idx_audit_entity           on audit_log (entity_type, entity_id, created_at desc);
