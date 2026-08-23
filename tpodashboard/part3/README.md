# PrepVista — Eligibility Engine (standalone slice)

This is a focused, fully tested slice of PrepVista Part 3: the **Smart
Eligibility Engine** described in the Part 3 spec (sections 18–28, 63).
It is intentionally NOT the full Part 3 system — see the truth table in
the accompanying chat response for exactly what is and isn't implemented.

## What's here

**Eligibility engine** (pure logic, no I/O):
- `src/types.ts` — rule tree, student, and result types
- `src/rules.ts` — leaf-level comparator evaluation + human-readable descriptions
- `src/evaluate.ts` — AND/OR/NOT tree evaluation, explanation, primary-failure-reason selection
- `src/validate.ts` — rejects malformed or unsafe rule trees (whitelisted fields/comparators only — no arbitrary code execution)
- `src/summarize.ts` — cohort-level eligible/not-eligible counts and failure-reason buckets
- `src/simulate.ts` — pure what-if simulation (never mutates inputs, so it structurally cannot affect a real drive)

**Persistence + lifecycle** (SQLite via Node's built-in `node:sqlite` — still
flagged experimental upstream, so treat it as a reasonable default rather
than a permanent commitment):
- `migrations/0001_init.sql` — drives, versioned eligibility rules, immutable snapshots, append-only audit log, with FK/CHECK constraints and indexes
- `src/db.ts` — connection + migration runner
- `src/status.ts` — the drive lifecycle state machine (section 8), pure and independently testable
- `src/driveRepository.ts` — create/version/snapshot/transition operations; every write is parameterized (no string-built SQL anywhere) and every status change and rule version is audited; snapshotting re-uses `summarizeCohort` from the engine rather than recomputing anything

**Demos** (both print real output against clearly labeled synthetic fixtures):
- `scripts/demo.ts` — the engine alone, 240 fake students
- `scripts/demo-drive.ts` — full lifecycle against a real (temp) SQLite file: create → version → snapshot → review → approve → publish → audit trail, plus a deliberately rejected illegal transition

## Deliberately out of scope in this slice

The Drive/JobRequirement models don't yet cover every field from section 7
(only what the demo needs), JD upload + AI extraction, RBAC/tenant
isolation, events (only audit rows so far, not a pub/sub bus), eligibility
overrides, and any UI. These mostly depend on decisions this slice can't
make for you — your real Student/Company/Institution schema, and your stack.

## Running it

```
npm install
npm test            # real vitest run across all 5 suites (34 tests)
npm run demo:engine # engine output against a 240-student synthetic fixture
npm run demo:drive  # full persisted lifecycle against a real temp SQLite file
```
