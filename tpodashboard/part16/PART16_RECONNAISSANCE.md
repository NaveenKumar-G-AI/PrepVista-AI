# PART16_RECONNAISSANCE.md

Status: TEMPLATE. This is the one piece of Part 16 that genuinely can't be
done without your actual Parts 1–15 codebase — fill it in against the real
repo. Everything else in this kit is already demo-verified against fixture
data; this file is where that meets your actual system.

## 1. Module map

| Part | Domain | Owning table(s) | Owning service(s) | Owning API route(s) | Notes |
|---|---|---|---|---|---|
| 1 | Foundation (student/institution truth) | | | | |
| 2 | Companies / recruiter records | | | | |
| 3 | Drives / eligibility | | | | |
| 4 | Applications | | | | |
| 5 | Interviews / results | | | | |
| 6 | Offers / joining | | | | |
| 7 | Training / assessment / intervention | | | | |
| 8 | Readiness intelligence | | | | |
| 9 | Communication | | | | |
| 10 | Reports / evidence | | | | |
| 11 | Admin / security / governance | | | | |
| 12 | AI conversational | | | | |
| 13 | Proactive intelligence | | | | |
| 14 | AI actions | | | | |
| 15 | Forecasting / strategy | | | | |

## 2. Fake/demo/mock sweep

Run the scanner that's already proven itself against `legacy-code-sample/`
in this kit:

    node scripts/scan-fake-features.mjs /path/to/your/real/src

It found all 7 markers seeded in this kit's own sample files (see
`VERIFIED-RUN-OUTPUT.txt`, section 6) — same mechanism, pointed at your repo
instead. Paste categorized results here: production hit vs. legitimate
test/fixture hit.

## 3. Duplicate entity / service / API audit

For each of: students, users, companies, recruiters, drives, rounds,
applications, interviews, offers, joining, training, readiness, reports,
audit, communication, AI actions — note every model/service/route that
represents it, and which one Part 16 §5's ownership list declares
authoritative.

| Concept | Duplicates found | Authoritative source | Migration needed? |
|---|---|---|---|
| | | | |

## 4. Schema conflicts

Same entity, different shape or different identifier column name across
modules — list them with the reconciliation plan. `lib/dataIntegrity.mjs`'s
11 checks assume column names like `driveId`, `applicationId`,
`studentId` — note where your real schema differs so the checks can be
ported (the SQL-shaped comment above each check in that file is the
starting point).

## 5. Identifier consistency

Confirm institution_id, season_id, student_id, company_id, drive_id,
application_id, interview_id, offer_id, joining_id are named and typed
identically everywhere they appear. Flag any module using a different key
for the same entity.

## 6. Unresolved technical debt

Anything found during the sweep that's out of scope to fix in this pass —
log it here so it doesn't quietly disappear.
