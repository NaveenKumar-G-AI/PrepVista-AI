# Part 2 — Company & Recruiter Domain Model (Draft)

No existing PrepVista repository was available in this session — this is drafted directly from the
field lists in the Part 2 spec, not a real integration, and it hasn't been run against a live database.
Table names for Part 1 entities (`institution`, `users`) are placeholders; rename to match your actual
schema. Written for PostgreSQL — say the word if Part 1 uses a different database or an ORM (Prisma,
Drizzle, SQLAlchemy, etc.) and this gets regenerated in that shape instead of raw DDL.

Requires PostgreSQL 13+ for `gen_random_uuid()`. On older versions: `create extension pgcrypto;`

## Enums

```sql
create type relationship_stage as enum (
  'PROSPECT', 'CONTACTED', 'INTERESTED', 'REQUIREMENT_RECEIVED',
  'DRIVE_SCHEDULED', 'DRIVE_COMPLETED', 'HIRING', 'REPEAT_RECRUITER', 'INACTIVE'
);

create type company_record_status as enum ('ACTIVE', 'ARCHIVED');
create type contact_channel        as enum ('EMAIL', 'PHONE', 'WHATSAPP', 'LINKEDIN', 'OTHER');
create type contact_status         as enum ('ACTIVE', 'INACTIVE');

create type activity_type as enum (
  'CALL', 'EMAIL', 'MEETING', 'VISIT', 'RECRUITER_REQUEST', 'REQUIREMENT_RECEIVED',
  'DRIVE_DISCUSSION', 'FOLLOWUP', 'NOTE', 'OTHER'
);

create type followup_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- OVERDUE is deliberately excluded — see Design notes.
create type followup_status as enum ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

create type document_type as enum (
  'COMPANY_PROFILE', 'RECRUITER_REQUEST', 'JD', 'INVITATION', 'AGREEMENT_MOU', 'OTHER'
);
```

## Companies, lookups, tags

```sql
-- Configurable per-institution taxonomies (not hardcoded enums)
create table company_industry (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  name           text not null,
  created_at     timestamptz not null default now(),
  unique (institution_id, name)
);

create table company_tag (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  name           text not null,
  color          text,
  created_at     timestamptz not null default now(),
  unique (institution_id, name)
);

create table company (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references institution(id),
  name                  text not null,
  normalized_name       text not null,   -- lowercased/punctuation-stripped, set by the app layer on write
  legal_name            text,
  brand_name            text,
  website               text,
  website_domain        text,            -- extracted host, set by the app layer on write
  industry_id           uuid references company_industry(id),
  sector                text,
  company_size          text,            -- suggested buckets: STARTUP/SMALL/MEDIUM/LARGE/ENTERPRISE — confirm with TPO, not enforced here
  headquarters_city     text,
  headquarters_state    text,
  headquarters_country  text,
  description           text,
  logo_document_id      uuid,            -- FK added after company_document exists, below
  status                company_record_status not null default 'ACTIVE',
  relationship_stage    relationship_stage not null default 'PROSPECT',
  relationship_owner_id uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz
);

create index idx_company_institution       on company (institution_id);
create index idx_company_institution_stage on company (institution_id, relationship_stage);
create index idx_company_normalized_name   on company (institution_id, normalized_name);
create index idx_company_website_domain    on company (institution_id, website_domain);

create extension if not exists pg_trgm;
create index idx_company_name_trgm on company using gin (name gin_trgm_ops); -- fuzzy match: search + duplicate detection

create table company_tag_link (
  company_id uuid not null references company(id) on delete cascade,
  tag_id     uuid not null references company_tag(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  primary key (company_id, tag_id)
);

create table company_address (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  type        text,
  city        text,
  state       text,
  country     text,
  address     text,
  postal_code text,
  is_primary  boolean not null default false
);
create index idx_company_address_company on company_address (company_id);
```

## Recruiter contacts

```sql
create table recruiter_contact (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institution(id),
  company_id        uuid not null references company(id) on delete cascade,
  name              text not null,
  designation       text,
  department        text,
  email             text,
  phone             text,
  alternate_phone   text,
  linkedin_url      text,
  preferred_channel contact_channel,
  notes             text,
  status            contact_status not null default 'ACTIVE',
  is_primary        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_contact_institution on recruiter_contact (institution_id);
create index idx_contact_company     on recruiter_contact (company_id);
create unique index uq_contact_company_primary on recruiter_contact (company_id) where is_primary; -- at most one primary per company

create table recruiter_contact_history (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recruiter_contact(id) on delete cascade,
  field_name text not null,
  old_value  text,
  new_value  text,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);
create index idx_contact_history_contact on recruiter_contact_history (contact_id, changed_at desc);
```

## Activity, follow-ups, notes, documents, history

```sql
create table recruiter_activity (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  company_id     uuid not null references company(id) on delete cascade,
  contact_id     uuid references recruiter_contact(id),
  actor_id       uuid references users(id),
  type           activity_type not null,
  subject        text,
  summary        text,
  occurred_at    timestamptz not null default now(),
  next_action    text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);
create index idx_activity_company_time     on recruiter_activity (company_id, occurred_at desc);
create index idx_activity_institution_time on recruiter_activity (institution_id, occurred_at desc);

create table recruiter_followup (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  company_id     uuid not null references company(id) on delete cascade,
  contact_id     uuid references recruiter_contact(id),
  owner_id       uuid references users(id),
  title          text not null,
  description    text,
  priority       followup_priority not null default 'MEDIUM',
  due_at         timestamptz not null,
  status         followup_status not null default 'OPEN',
  completed_at   timestamptz,
  completed_by   uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_followup_institution_status_due on recruiter_followup (institution_id, status, due_at);
create index idx_followup_owner_status           on recruiter_followup (owner_id, status);
create index idx_followup_company                on recruiter_followup (company_id, status);
-- "Overdue" = status in ('OPEN','IN_PROGRESS') and due_at < now(). Compute this in the service layer or a view — don't store it.

create table company_note (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  company_id     uuid not null references company(id) on delete cascade,
  author_id      uuid references users(id),
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_note_company on company_note (company_id, created_at desc);
-- Internal by construction — nothing recruiter-facing ever queries this table. When a recruiter portal
-- exists, give it its own table to read from rather than adding a visibility flag here.

create table company_document (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  company_id     uuid not null references company(id) on delete cascade,
  type           document_type not null,
  title          text,
  file_reference text not null,  -- pointer into Part 1's file storage, not a blob
  uploaded_by    uuid references users(id),
  created_at     timestamptz not null default now()
);
create index idx_document_company on company_document (company_id);

alter table company add constraint fk_company_logo_document
  foreign key (logo_document_id) references company_document(id);

create table company_status_history (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  old_stage  relationship_stage,
  new_stage  relationship_stage not null,
  actor_id   uuid references users(id),
  reason     text,
  changed_at timestamptz not null default now()
);
create index idx_status_history_company on company_status_history (company_id, changed_at desc);
```

## Design notes — where this goes past a literal reading of the spec, on purpose

- **`OVERDUE` is computed, not stored.** The spec lists it as a `recruiter_followup.status` value, but a
  stored status needs a background job to flip it and can go stale between runs. Deriving it at query time
  (`status in ('OPEN','IN_PROGRESS') and due_at < now()`) is cheaper and can't be wrong.
- **`company_industry` and `company_tag` are per-institution tables, not enums** — matches the "tags must
  be configurable, don't hard-code the taxonomy" rule. `company_tag_link` is the many-to-many the spec
  implies but doesn't name.
- **No `students_hired_count` or `drives_count` column on `company`.** Per the Student Master compatibility
  rule, those get computed by the recruiter-intelligence service from activity/status-history/future offer
  records, not stored as independent truth. Cache them later only as a clearly-labeled derived value, once
  there's an actual performance need.
- **Duplicate detection is a service-layer similarity check** (`normalized_name`, `website_domain`, trigram
  index on `name`), not a unique constraint — so a possible match surfaces for human review instead of
  silently blocking or merging.
- **`company_note` has no visibility flag.** Rather than a flag a future recruiter-portal query could forget
  to filter on, internal notes just live somewhere recruiter-facing code never reads from.

## Open questions before this attaches to a real Part 1

- Actual table/column names and ID type for `institution` and `users` (uuid assumed here)
- Tenant isolation mechanism already in place — app-layer `WHERE institution_id = :current` on every query,
  or Postgres row-level security?
- ORM/query layer in use, if any
- Existing soft-delete/archive convention, if `company.status` should follow it instead of introducing a new one

## Deliberately not here

`job_requirement` and `drive` tables aren't created — Part 3 owns those. For now,
`recruiter_activity.type = 'REQUIREMENT_RECEIVED'` is the attachment point, plus a
`CompanyService.getCompanyDrives(company_id)` method that returns `[]` until Part 3 exists — so the
dossier's Drives tab can call it today and start returning real data the moment Part 3 lands, without the
two modules ever defining competing tables.
