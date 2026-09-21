# Feature 38 — Technical Mastery Report — Engineering Summary

No CodeForge repository was attached to this session, so "Implementation
Completed" below means: implemented and verified as a self-contained
reference build with a documented integration seam, not merged into an
existing CodeForge codebase. See `docs/ARCHITECTURE.md` for exactly what's
real Feature 38 code versus what's a labeled placeholder standing in for
something that should already exist in production.

## Implementation Completed

Full pipeline (collect → assemble → narrate → validate → publish),
lifecycle state machine, async worker-based generation, cache reuse +
idempotency, staleness detection, tenant/role/relationship access control,
audit logging, PDF export, bulk generation + progress, share links, rate
limiting, and a React report UI covering the full information hierarchy
in brief §67. Not a mockup or static dashboard — every piece below was
actually run in this session, not just written.

## Architecture Changes

New standalone service (no existing codebase to modify). Hexagonal-ish
split: `domain/` (types, enums, lifecycle state machine) knows nothing
about HTTP or the database; `ports/` define what the "existing CodeForge
intelligence" looks like from Feature 38's point of view;
`adapters/fixture-adapters.ts` is the only concrete implementation of
those ports and the only file that should be deleted/replaced in a real
integration. See `docs/ARCHITECTURE.md` for the full data-flow diagram and
the reasoning behind every non-obvious decision.

## Database Changes

`server/db/schema.sql`. Two groups of tables, deliberately separated:
`fixture_*` (15 tables simulating pre-existing CodeForge services — not
meant to ship) and Feature 38's own 4 tables (`technical_mastery_report`,
`report_access_log`, `report_share`, `report_bulk_batch`). All
`CREATE TABLE/INDEX IF NOT EXISTS`, safe to run repeatedly. Backed by
Node's built-in `node:sqlite` in this reference build (see
`docs/ARCHITECTURE.md`'s "Data layer note" for why, and what a Postgres
swap involves — it's a one-file change).

## API Changes

New REST surface under `/api` (`server/src/http/routes-reports.ts`):
`POST /reports`, `GET /reports/:id`, `GET /reports/:id/status`,
`GET /students/:studentId/reports`, `POST /reports/:id/refresh`,
`GET /reports/:id/export.pdf`, `POST /reports/:id/share`,
`POST /shares/:shareId/revoke`, `POST /reports/bulk`,
`GET /reports/bulk/:batchId/progress`. All behind placeholder JWT auth
(`http/middleware.ts` — real auth is CodeForge's to wire in) plus real
Feature 38 authorization logic on top.

## Frontend Changes

`web/src/` — one React component per report section
(`ReportHeader`, `ExecutiveSummaryPanel`, `MasteryAndSkillsSection`,
`RoleReadinessSection`, `EvidenceSection`, `GrowthTimelineSection`,
`StrengthsWeaknessesActionsSection`), composed by
`pages/TechnicalMasteryReportPage.tsx` in the order brief §67 specifies.
Sections that have no data render nothing, not a placeholder (brief §21).
Design tokens isolated to one CSS file (`report-theme.css`) since the
real CodeForge design system wasn't available — see `web/README.md`.
Type-checked clean (`tsc --noEmit`, zero errors) against React 18; not
run through a bundler or browser in this sandbox.

## Report Generation Changes

N/A as a diff (new feature) — see Architecture Changes / pipeline diagram
in `docs/ARCHITECTURE.md`.

## AI Safeguards

Real Anthropic Messages API call (correct `x-api-key`/`anthropic-version`
headers for standalone backend use, not the artifact-sandbox pattern).
Narrative is only ever built from a minimized fact payload (no internal
IDs, no raw evidence text, no org data — brief §39). A guardrail
(`narrative/guardrail.ts`) attributes every mastery-level word in the
returned text to its nearest skill mention and rejects the *entire*
narrative — falling back to a deterministic, template-built one that's
valid by construction — if any attribution contradicts the structured
DTO, or if it claims project/interview evidence that doesn't exist. No
API key was provided this session (per instruction), so only the fallback
path was exercised live end-to-end; the AI path is implemented to spec but
its live-response handling is untested in this environment.

## Security Controls

Tenant check (org mismatch) evaluated before any relationship check, with
no exception. Every denial — wrong org, wrong student, non-owning
trainer, platform ADMIN hitting a content endpoint, or a report ID that
doesn't exist — returns the identical generic 403, so the API can't be
used to enumerate valid report IDs or distinguish "not yours" from
"doesn't exist." Rate limiting on generation/export/bulk endpoints.
Placeholder JWT auth is clearly marked as needing replacement; the
authorization *decisions* on top of it are real and are what's tested.

## Testing Results

**25/25 passing, all executed in this session, output captured, not
asserted from memory:**

- Unit (vitest, 19 tests / 3 files): lifecycle state machine (every legal
  and illegal transition, including terminal-state exits),
  narrative guardrail (contradiction detection, project/interview
  fabrication detection, fallback-is-valid-by-construction), access
  control (tenant isolation, student/trainer/admin scoping, bulk-role
  restriction).
- Integration (plain script via `tsx` — see below for why not vitest; 6
  tests / real SQLite file, real HTTP-independent service calls):
  **golden student (§76)** — exact mastery levels reproduced, unaltered;
  **golden limited-data (§77)** — sparse student's report stays honest,
  no invented evidence; **golden security (§79)** — cross-student,
  cross-org, and admin-content access all denied, ID-enumeration probe
  denied identically; **golden stale-report (§80)** — old report
  correctly flips to STALE without its own snapshot mutating, new report
  correctly UP_TO_DATE at the new version; **golden generation-lifecycle
  (§81)** — success path hits every state in order, and a simulated
  dependency outage lands cleanly in FAILED with a reason and no partial
  DTO exposed.
- Also run live in this session, outside both test suites: full
  `tsc --noEmit` (server and web, zero errors); a real HTTP smoke test
  (server + worker processes actually started, hit with `curl` — 401
  with no token, 202+QUEUED→COMPLETED over real async polling, 403 with
  generic body for a cross-student request, working PDF download); the
  exported PDF's text was extracted and checked against the seeded data,
  not just checked for file size.

**Why the integration tests run via a plain script instead of vitest:**
`node:sqlite` is new enough (Node 22.5+) that it has no legacy bare-name
alias, and the Vite version vitest@2.1.9 pulls in doesn't recognize it as
a Node builtin during module transform — both `test.server.deps.external`
and Vite's `ssr.external` were tried and neither fixed it. Rather than
keep fighting bundler internals, the DB-backed tests run as a plain
`tsx`-executed script (`test/integration/run-golden.ts`), which hands off
to Node's own module resolution with no bundler in between. Documented in
that file's header in case a future Vite patch removes the need.

Not run: the brief's full security/failure test matrix beyond the golden
cases (queue-worker crash mid-job, concurrent-duplicate-request race,
permission-revocation-mid-session), and no run against CodeForge's actual
regression suite, PrepVista integration, or existing auth/authorization
system — none of those exist in this environment. See Known Limitations.

## Performance Results

No load/throughput testing was performed — there's no realistic traffic
pattern to test against without the real system attached. What *is* true
by construction: report generation runs off the request thread (worker
pattern), the assembler does no N+1 querying (the collector fans out via
`Promise.all` and each port call is a single indexed query against its
fixture table), and repeated identical requests reuse a cached completed
report rather than regenerating (verified in the golden stale-report
test, which exercises the reuse path). PDF generation (~6 pages) completed
in well under a second locally; not tested at bulk scale.

## Known Limitations

- Fixture adapters are the load-bearing placeholder — see the table in
  `docs/ARCHITECTURE.md`. Report correctness beyond "faithfully reflects
  whatever the ports return" is only as good as the real adapters that
  eventually replace them.
- Auth is a placeholder JWT, not CodeForge's real session/OAuth system.
- No automatic retry-with-backoff on FAILED generation (brief §63 asks
  for "retry if safe" — the FAILED state itself is correct and tested;
  retry policy was left as a follow-up rather than invented without
  knowing the org's real transient-vs-permanent failure taxonomy).
- Bulk generation creates jobs synchronously in a loop inside the request
  handler (fine for tens of students; brief §61 wants this to not process
  "hundreds/thousands... in one synchronous HTTP request" — for real
  scale this loop should itself be handed to a worker).
- No cohort-aggregate reporting UI (brief §51 asks for compatibility, not
  a full implementation; the port/DTO structure doesn't block adding it).
- No observability/metrics backend wired in (brief §71) — there's no
  existing CodeForge observability infrastructure here to plug into;
  audit logging (§72) is real and tested, metrics emission is not.
- Frontend is type-checked but not build- or browser-verified.
- `node:sqlite` is an experimental Node API by Node's own designation.

## Deployment Requirements

Node ≥22.5 (for `node:sqlite`, if kept — see above) or a Postgres
connection string if swapped per `docs/ARCHITECTURE.md`; real values for
every blank in `.env.example` (`AUTH_JWT_SECRET` at minimum;
`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` optional — the feature works
without them via the fallback narrative); the real adapter file replacing
`fixture-adapters.ts`; the real auth middleware replacing
`http/middleware.ts`'s `requireAuth`; a process running
`src/jobs/worker-entry.ts` in addition to the API server, since
generation happens there, not in the request thread.

## Rollback Plan

Additive-only: new tables, new routes under `/api`, no modification of
anything else (there was nothing else to modify). Rollback is stopping the
new API routes and worker process and, if desired, dropping the four
Feature 38-owned tables — nothing else in a real CodeForge deployment
depends on them existing. No feature-flag infrastructure was available to
wire into for staged rollout (brief §84); the route registration in
`http/app.ts` is the natural place to gate behind one.
