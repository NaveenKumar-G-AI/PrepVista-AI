# PrepVista Part 2 — Companies & Recruiters

A standalone, working implementation of the Company + Recruiter Operating System
described in the Part 2 spec. Built without access to the real Part 1 repository (see
`PART2_DOMAIN_MODEL.md` for how that constraint shaped the design) — this is meant to be
read, run, tested, and then merged into the real codebase, not treated as a finished
Part 2 in isolation.

## Running it

Requires Node 18+.

```bash
# 1. Backend
cd server
npm install
npm run migrate      # creates server/data/prepvista-part2.sqlite3 and applies the schema
npm run seed:dev      # one institution + one TPO login, zero companies (the empty state is real)
npm run seed:demo     # optional — 6 illustrative companies, created through the real service layer
npm run dev            # http://localhost:4000

# 2. Frontend, in a second terminal
cd client
npm install
npm run dev             # http://localhost:5173 — proxies /api to :4000
```

Log in with the credentials `seed:dev` prints (default: `tpo@demo.prepvista.test` /
`changeme123`).

## Verifying it actually works

```bash
cd server
npm run typecheck   # tsc --noEmit
npm test              # vitest — 69 tests, including a full run of the spec's own
                       # "Definition of Done" loop against a real sqlite file, closing
                       # and reopening the database mid-test to prove persistence
                       # survives a restart, not just process memory

cd ../client
npm run typecheck
npm run build         # vite build — verifies the frontend actually compiles
```

All of the above were run for real while building this, not just written and assumed
to work — see the "Verified, not assumed" section below.

## What's actually implemented

- **Data model**: `company`, `recruiter_contact` (+ field-level history), `recruiter_activity`,
  `recruiter_followup`, `company_note`, `company_document`, `company_status_history`,
  configurable `company_tag` / `company_industry` lookups, `audit_log`. SQLite port of
  `PART2_DOMAIN_MODEL.md` — see that file for the schema and the reasoning behind each
  deliberate deviation from a literal reading of the spec.
- **Company CRUD**: create/edit/archive/restore, search (name, website, city, contact
  name/email), filter (stage, industry, city, owner, repeat-recruiter, follow-up status),
  sort, pagination.
- **Duplicate detection**: exact name/domain match blocks creation (override with a
  confirmed "create anyway"); a close-but-not-exact name surfaces as a possible match
  without blocking. Never silently merges.
- **Recruiter contacts**: multiple per company, primary contact, deactivate, field-level
  change history.
- **Activity timeline**: every interaction logged against a company (and optionally a
  contact), merged with relationship-stage changes into one chronological history.
- **Follow-ups**: create/edit/complete/cancel. `OVERDUE` is computed at read time from
  `due_at`, never stored — see `followupService.displayStatus`.
- **Relationship health**: deterministic rules in `relationshipHealthService.ts`, not an
  opaque score — every result includes the plain-language reason it was computed from.
- **Recruiter opportunity intelligence**: `opportunityService.ts` generates structured
  insight objects (overdue follow-ups, loose threads with no next action, repeat
  recruiters gone quiet) from real rows only.
- **Follow-up Command Centre**: bucketed Overdue/Today/Tomorrow/This Week/Completed view.
- **Command Centre integration**: `commandCentreService.getRecruiterPulse` — real,
  live-queried counts, not hardcoded numbers.
- **AI-readiness context** (`aiContextService.ts`): `get_company_context`,
  `get_recruiter_context`, `get_open_followups`, `get_company_history`,
  `get_recruiter_opportunities`, `get_overdue_followups` — structured facts a future AI
  layer can call instead of reading tables directly.
- **Audit log**: every mutating service call writes one row.
- **Events**: in-process publisher matching the spec's event names, as a stand-in for
  Part 1's real event bus (see "Integration points" below).
- **Auth**: real session-based login/logout backed by a `session` table — not a stub.
- **Tests**: 69 total — company CRUD, duplicate detection, follow-up lifecycle
  (including the overdue-is-computed guarantee), relationship health (checked against
  the spec's own worked example), opportunity intelligence, tenant isolation, and the
  full end-to-end Definition of Done flow.

## What's deliberately not implemented

This is a working core, not all 30 phases. Explicitly out of scope for this pass:

- CSV/XLSX company import/export
- Bulk operations (multi-select assign/reschedule/archive)
- Company documents beyond the schema (no file upload/storage wiring)
- Full WCAG audit and keyboard-navigation pass beyond the basics (focus-visible states,
  labelled dialogs, semantic buttons are in; a dedicated accessibility review isn't)
- Company address / multiple-locations UI (the table and service exist; no screen)
- The formal `PART2_HOSTILE_REVIEW.md` / `PART2_RESEARCH_UPGRADE.md` /
  `module.manifest.json` review-pass documents the full spec calls for in Phases 21–28 —
  the engineering judgment calls those phases are meant to produce are instead recorded
  inline as comments where they were made (schema design notes, the OVERDUE-as-derived
  decision, etc.), since a document produced by re-reading this same code once more
  would mostly restate this README

## Integration points — how this attaches to the real Part 1

- **`institution` and `app_user`/`session` tables are placeholders.** Drop them, and
  point every `institution_id` / `*_id references app_user` foreign key at Part 1's real
  tenant and user tables. Nothing else needs to change — every reference is just an id.
- **`src/events.ts`** is a stand-in for "the shared Event Contract from Part 1." The
  event names match the spec exactly (`COMPANY_CREATED`, `FOLLOWUP_COMPLETED`, etc.) —
  swap `publish()`'s body for a call into the real bus; nothing else in the codebase
  talks to this file directly except through that one function.
- **`companyService.getCompanyDrives(db, companyId)`** returns `[]`. This is the Phase 14
  interface point — Part 3 (Drives) implements the real version. The dossier's Drives
  tab already calls this today.
- **`studentsHiredCount` is hardcoded to `0`** everywhere it appears, with a comment at
  each site. Per Phase 15, it should never be stored as independent truth — it needs to
  come from real offer/joining records once that module exists.
- **`job_requirement`** doesn't exist as a table. `recruiter_activity.type =
  'REQUIREMENT_RECEIVED'` is the attachment point until Part 3 needs something richer.

## Files

```
server/
  src/db/schema.sql          — the schema (SQLite; see PART2_DOMAIN_MODEL.md for the Postgres draft)
  src/services/               — all business logic; routes are thin
  src/routes/                 — Express routes, one file per resource
  src/seed/devSeed.ts         — empty institution + one login (default)
  src/seed/demoSeed.ts        — 6 illustrative companies, opt-in only, via the real service layer
  tests/                      — 69 tests, vitest
client/
  src/pages/                  — Login, Company List, Company Dossier, Follow-ups
  src/components/             — shared UI, including the relationship-health chip
```
