# PrepVista AI — Part 10: Reports, Evidence Vault, Management Intelligence

A working reference implementation of the reporting spine described in
the Part 10 brief — built as a standalone TypeScript/Node project (no
Parts 1-9 codebase was available), designed from the start to be
integrated rather than kept. Read `PART10_INTEGRATION.md` before
plugging this into a real system, and `PART10_HOSTILE_REVIEW.md` for an
honest list of what's solid vs. what's still missing.

## What's actually in here

- **Evidence Vault** (`evidence` table + `EvidenceService`) — every
  offer, joining record, and computed metric can carry attached,
  verifiable evidence.
- **Metric Definitions** (`metric_definitions` + `MetricService`) —
  every KPI (`placement_rate`, `median_ctc`, `average_ctc`,
  `highest_ctc`) is versioned, documented in plain language, and
  computed by a registered, unit-tested function — never inline in a
  chart.
- **Report Snapshots** (`report_snapshots` + `ReportGenerationService`)
  — publishing a report freezes its payload, the metric-definition
  versions used, and a data-through timestamp. A published report
  cannot drift, even after source data or definitions change later —
  this is tested directly, not just claimed (see
  `tests/reportSnapshot.test.ts`).
- **Executive reporting** — the 10-stage placement funnel
  (seeking → eligible → applied → shortlisted → interviewed → selected
  → offer → accepted → joined → verified placement), department
  performance, company/recruiter reporting, and season-over-season
  funnel comparison that automatically surfaces the biggest regression
  (the "why below target" drill-down).
- **Data Quality** (`DataQualityService`) — warnings (unverified
  offers, incomplete joining) and integrity issues (joined without an
  accepted offer, verified placements missing evidence, orphaned
  offers, missing interview results, possible duplicate students),
  plus a "Data Quality" score that is explicitly *not* called an
  accuracy score.
- **A REST API** (`src/api`) exposing the above as the AI-safe tool
  functions named in the brief (`getExecutiveMetrics`,
  `getPlacementFunnel`, `getDepartmentReport`, `getMetricDefinition`,
  `getReportWarnings`, `getEvidence`), with a role gate that enforces
  the absolute product boundary: recruiters get a hard 403, always.

## What's not in here

PDF/XLSX export, student-facing reports, training/readiness/
communication reports, an audit log, async job processing, and real
authentication. See `PART10_HOSTILE_REVIEW.md` for the full, honest
list with severities — nothing here is quietly stubbed and passed off
as done.

## Quick start

```bash
npm install
npm run seed   # generates data/prepvista_demo.db: 610 students across
                # two seasons (2025, 2026) and six departments, with
                # every number computed from simulated records, not
                # typed in by hand
npm test        # 19 tests, including the snapshot-reproducibility proof
npm run dev     # starts the API on http://localhost:4010
```

With the server running:

```bash
curl -H "x-prepvista-role: management" \
  "http://localhost:4010/api/institutions/inst_demo_college/executive-report?season=2026&comparisonSeason=2025"
```

`scripts/apiSmokeTest.ts` runs the same set of calls in-process (useful
in sandboxed environments where a background server doesn't persist
between commands):

```bash
npx tsx scripts/apiSmokeTest.ts
```

## Project layout

```
migrations/     numbered SQL, source-of-truth stubs + Part 10's own tables
src/types.ts    shared domain types
src/repositories/   one interface + SQLite impl per source entity, plus
                     Evidence / MetricDefinition / ReportDefinition /
                     ReportSnapshot / ManagementTarget repositories
src/services/   MetricService, EvidenceService, ReportingService,
                DataQualityService, ReportGenerationService
src/api/        Express routes + server
src/container.ts   composition root — the integration seam
src/seed.ts     generates realistic, computed (not hardcoded) demo data
tests/          19 tests: metrics, funnel, data quality, and the
                snapshot-reproducibility guarantee
```
