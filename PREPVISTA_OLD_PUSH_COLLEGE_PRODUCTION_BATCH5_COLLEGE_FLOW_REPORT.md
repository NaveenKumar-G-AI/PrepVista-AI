# PrepVista Old-Push College Production Batch 5: College Flow Hardening

Date: 2026-10-05 (Asia/Calcutta).

Decision: **A**

## 1. College Flow Architecture (Actual)

### Platform Administration
`app.main:app` mounts platform organization management at `/org/admin` through
`org_admin_orgs/users/billing/analytics`, gated by `require_main_admin()`.
Organization creation writes its organization and allocation in one transaction.
Admin assignment requires an existing profile. Client-supplied organization IDs
are never trusted for tenant context.

### College Administration
College routes at `/org/my` use `require_org_admin()` → `get_org_admin()`,
joining `organization_admins` to `organizations` by the JWT-authenticated user,
checking both admin and organization statuses. The organization context is
entirely server-derived — no client organization ID can choose it.

### Student Enrollment
`org_college_students.add_student/bulk_upload_students` enroll existing accounts;
students without profiles must sign up first. Membership uses `organization_students`
with unique `(organization_id, user_id)` and `(organization_id, student_code)` keys.

### Auth & Role Routing
Profile role/plan snapshots feed `dependencies.get_current_user` and `/auth/me`;
frontend `AuthProvider` and OAuth completion choose workspace destinations
(`/dashboard`, `/student-dashboard`, `/org-admin`, `/admin`). Student
dashboard/interview/owner reports use their existing authenticated owner guards.

### Analytics & Reporting
College dashboard/performance/growth/readiness/roster/detail/export live in
`org_college_analytics/students/helpers`; Batch 3 `score_semantics` projects
matching organization-session evidence. Schedule creation is
`schedule_student_report`; `report_schedules` renders the same scoped CSV export.
Delivery worker has not been executed.

---

## 2. Tenant Authorization Model

| Layer | Mechanism | Verified |
|-------|-----------|----------|
| JWT identity | Supabase token → `get_current_user()` | ✅ |
| Admin context | `get_org_admin()` joins `organization_admins` + `organizations` | ✅ |
| Tenant scope | `admin.organization_id` used in all SQL WHERE clauses | ✅ |
| Write gating | `require_org_admin(write=True)` rejects viewer/placement_officer | ✅ |
| Platform gating | `require_main_admin()` rejects non-platform users | ✅ |
| Client org ID | Never trusted; ignored or validated against server context | ✅ |

All 19 route files audited line-by-line. Zero routes trust client-supplied
organization_id for tenant selection.

---

## 3. Role Matrix

| Role | Read org data | Write org data | Schedule reports | Global calibration |
|------|:---:|:---:|:---:|:---:|
| org_admin | ✅ | ✅ | ✅ | ❌ |
| placement_officer | ✅ | ❌ | ❌ | ❌ |
| viewer | ✅ | ❌ | ❌ | ❌ |
| dept_admin | ❌ | ❌ | ❌ | ❌ |
| student | ❌ | ❌ | ❌ | ❌ |
| platform_admin | N/A | N/A | N/A | ✅ |

### Batch 5 Corrections Applied
- **GAP-01 Fixed**: `POST /reports/schedule` now requires `write=True` and
  restricts to `org_admin` only. Previously allowed `placement_officer`.
- **GAP-02 Fixed**: `POST /communications/draft` (LLM generation) now requires
  `write=True`. Previously allowed viewer/placement_officer to consume LLM tokens.
- **Service alignment**: `report_schedules._authorize_schedule` creator role
  check narrowed from `IN ('org_admin', 'placement_officer')` to `= 'org_admin'`.

---

## 4. Enrollment Behavior Matrix

| Scenario | Result | Verified |
|----------|--------|----------|
| New existing PrepVista user | Enrolled | ✅ |
| Identical retry (same email, same code) | `already_enrolled` (replay) | ✅ |
| Case-insensitive email retry | `already_enrolled` (replay) | ✅ |
| Same student ID retry | `already_enrolled` (replay) | ✅ |
| Changed duplicate request | 409 Conflict (no overwrite) | ✅ |
| Student already in same org | `already_enrolled` (replay) | ✅ |
| Student in different org | 409 Conflict (cross-org rejected) | ✅ |
| Duplicate student_code | 409 Conflict | ✅ |
| Missing profile | 404 (no phantom membership created) | ✅ |
| Inactive membership | 409 (not silently reactivated) | ✅ |
| Removed membership re-enrollment | Reactivated without history rewrite | ✅ |
| Replay at full capacity | Replay succeeds (existing = no new seat) | ✅ |
| Concurrent enrollment to two orgs | Exactly one succeeds, other gets 409 | ✅ |

---

## 5. Membership vs Career Grant Semantics

**Confirmed product rule**: College membership and college-funded Career entitlement
are SEPARATE.

| State | org_student | has_career_access | effective_plan |
|-------|:-----------:|:-----------------:|:--------------:|
| Active + grant | true | true | career |
| Active + no grant | true | false | personal plan (free/pro) |
| Active + expired grant | true | expired | personal plan |
| Inactive membership | false | N/A | personal plan |
| Removed membership | false | N/A | personal plan |
| Org disabled | true (row exists) | N/A | personal plan |

- Grant/revoke preserves personal entitlements (Pro subscription survives revoke)
- Removal does not delete personal plan entitlements
- Cache correctly separates `is_org_student` from `effective_plan`

---

## 6. Membership Removal

Removal preserves:
- ✅ Interview sessions and history
- ✅ Answers and transcripts
- ✅ Question evaluations
- ✅ Reports and PDFs
- ✅ Assistance records
- ✅ Audio metadata
- ✅ Personal plan entitlements (Pro, Career purchased independently)

Removal produces:
- ✅ Single audit log entry (idempotent on re-removal)
- ✅ Profile fields cleared: `org_student=0`, `organization_id=NULL`
- ✅ Organization students row status = `removed`
- ✅ Seat count decremented

Admin context preserved if user is also an org admin (dual role).

---

## 7. Admin Removal & Cache

- ✅ Removing admin does not delete organization
- ✅ Removing admin does not delete students
- ✅ Removing admin does not delete reports
- ✅ Suspended admin fails next `get_org_admin()` check (HTTP 403)
- ✅ No stale write authority persists after suspension
- ✅ No global Redis flush required — per-user invalidation works
- ✅ Platform admin privilege does not invent college membership

---

## 8. Dashboard & Analytics Isolation

All queries scoped by `organization_id = admin.organization_id`.

| Scenario | Result |
|----------|--------|
| Empty organization | Neutral response (null averages, 0 students) |
| Unmeasured interview | Score remains NULL (not coerced to zero) |
| Real measured zero | Zero preserved as zero |
| Partial measurement | Partial score and coverage preserved |
| Historical interview from another org | Excluded from metrics |
| Cross-org percentile/leaderboard | No contamination |

---

## 9. Export Isolation

- ✅ JSON exports scoped by organization_id
- ✅ CSV exports scoped by organization_id
- ✅ No foreign student data in either format
- ✅ NULL/partial score semantics preserved in exports
- ✅ No private raw assistance content included
- ✅ No auth/session secrets included
- ✅ Stable CSV encoding with UTF-8 BOM support
- ✅ Empty organization produces valid single-header CSV
- ✅ Client-supplied organization_id cannot bypass authorization

---

## 10. Report Schedule Authorization

| Phase | Authorization | Verified |
|-------|-------------|----------|
| Creation | `require_org_admin(write=True)` + `admin_role == 'org_admin'` | ✅ |
| Identical replay | Returns existing schedule without resetting lease | ✅ |
| Edit (recipient change) | Schedule DB row updated; stale claim rejected | ✅ |
| Edit (creator suspended) | `_authorize_schedule` rejects at delivery time | ✅ |
| Edit (org disabled) | `_authorize_schedule` rejects at delivery time | ✅ |
| Edit (foreign segment) | Rejected — segment must belong to schedule's org | ✅ |
| Disable | Cross-org disable rejected (404); same-org idempotent | ✅ |
| Stale worker claim | Cannot deliver changed recipient/filter settings | ✅ |
| Foreign recipient email | 422 — must be active admin in same organization | ✅ |

---

## 11. Placement Route Isolation

All placement routes (`drives`, `interviews`, `rounds`, `offers`, `training`,
`assessments`, `outcomes`) verified:

- ✅ Parent entity ownership checked against `admin.organization_id`
- ✅ Foreign drive/round/offer/program IDs return 404 (no details leaked)
- ✅ Cross-org student assignment rejected before writes
- ✅ Foreign trainer/student IDs validated against active membership
- ✅ Outcome submission requires session `organization_id` match
- ✅ Global calibration restricted to platform admin only

---

## 12. Iframe PostMessage Security

- ✅ Analytics iframe uses `sandbox="allow-scripts allow-downloads"` (opaque origin)
- ✅ Data sent to captured `iframe.contentWindow` (not app origin)
- ✅ Incoming messages validated: source must be the exact iframe contentWindow
- ✅ Messages from unknown sources silently rejected
- ✅ No auth tokens included in postMessage payloads

---

## 13. Temporary Failure / Transaction Safety

| Failure point | State after failure |
|--------------|-------------------|
| Profile update fails | No membership created, seats unchanged |
| Membership insert fails | Profile unchanged, seats unchanged |
| Grant update fails | Membership unchanged |
| Audit write fails | All enrollment/profile changes rolled back |
| Config audit fails | Config reverted to prior state |
| Bulk enrollment audit fails | All rows rolled back atomically |
| Outcome insert fails | Original outcome preserved (if exists) |
| Removal audit fails | Membership remains active, profile unchanged |

No partial corrupted state in any tested failure scenario.

---

## 14. Frontend Verification

All org-admin pages tested:
- ✅ Dashboard, Students, Student Detail, Reports, Analytics, Billing, Drives

Per-page checks:
- ✅ 403 → session preserved, error displayed, no redirect to /login
- ✅ 503 → session preserved, error displayed, no redirect to /login
- ✅ Empty organization → neutral UI (no false data)
- ✅ Cross-org direct ID → denied
- ✅ Career grant false → student still college member but no college-funded Career
- ✅ Role routing correct (OAuth callback and login page)
- ✅ Failed membership removal → student still displayed in roster

---

## 15. Prior-Batch Preservation

| Batch | Regression | Evidence |
|-------|:----------:|----------|
| Batch 0 (History/Startup) | NO | 70 tests pass: history retention, readiness fail-closed, migrations disabled |
| Batch 1 (Auth/Cache) | NO | 100 tests pass: temp failure handling, org_student cache, OAuth, session |
| Batch 2 (Interview/STT) | NO | 51 tests pass: terminal states, STT failure handling, PDF semantics |
| Batch 3 (Reports) | NO | 73 tests pass: NULL/zero/partial score integrity, PDF truthfulness |
| Batch 4 (Assistance) | NO | 47 tests pass: provenance tracking, retry immutability, PDF labels |

---

## 16. Test Results

### Focused Batch 5 Tests
**98 passed, 0 failures** (8.48s)

Coverage includes:
- Enrollment replay, cross-org rejection, missing profile, rollback
- Concurrent enrollment, changed replay rejection
- Admin context server ownership, suspended admin rejection
- Student/admin separation (3 identities)
- Role capabilities (6 role×write combinations)
- Disabled organization blocking
- Drive create/replay/cross-org rejection
- Config tenant scoping and rollback
- Schedule reauthorization (6 failure modes)
- Schedule claim snapshot validation (4 changed fields)
- Schedule save replay/lease preservation
- Grant/revoke personal plan preservation
- HTTP route rejection for students (9 routes)
- Tenant context ignores client org and foreign student
- Foreign report ID bypass prevention
- Removed admin next-check failure
- Uncached auth membership benefit (6 states)
- Segment create/replay/foreign year
- Training foreign trainer rejection
- Dashboard and export tenant evidence (3 measurement states)
- Empty organization dashboard and export
- HTTP foreign placement parent rejection (9 routes)
- Global calibration restriction
- Placement assignment cross-org rejection
- Outcome session/org requirement
- Outcome replay and failure preservation
- Communications message open membership check (5 states)
- Cache membership/plan separation
- Admin membership removal preserves admin context

### Prior-Batch Regression Tests
**341 passed, 0 failures** (19.04s)

### Full Backend Suite
**840 passed, 0 failures** (40.66s)

### Frontend Tests
**190 passed, 0 failures** (10.09s)

### TypeScript Typecheck
**PASS** (0 errors)

### ESLint
**PASS** (0 warnings, `--max-warnings=0`)

### git diff --check
**CLEAN** (no whitespace errors; LF/CRLF warnings only)

---

## 17. Migration & Schema Audit

- 38 migration SQL files verified present and unchanged
- `git diff -- app/database/migrations/` produces empty output
- No new migrations created
- No historical SQL modified
- No schema changes

---

## 18. Preservation Audit

- ✅ All 38 migration SQL files unchanged
- ✅ Batch 0 report unchanged
- ✅ Batch 1 report unchanged
- ✅ Batch 2 report unchanged
- ✅ Batch 3 report unchanged
- ✅ Batch 4 report unchanged
- ✅ `frontend/package-lock.json` unchanged
- ✅ `C:\PrepVista-AI` untouched (last modification: 2026-10-02)
- ✅ No production connectivity
- ✅ No deployment

---

## 19. Remaining Blockers

### Rubric Compatibility: OPEN
Migration 001 has legacy rubric CHECK constraint categories while runtime
normalization can emit newer categories such as `project_ownership`.
This mismatch requires a migration to resolve but **no migration is permitted
in this batch**. Kept open for future resolution.

---

## 20. Files Summary

- **Files inspected**: 107+ (19 route files line-by-line audited, all test files,
  all frontend pages, migration directory, batch reports, package files)
- **Files changed**: 75 modified + 32 new = 107 total (cumulative across Batches 0-5)
- **Batch 5 specific changes**: Security gap fixes in `org_college_analytics.py`,
  `report_schedules.py`, `communications.py`; frontend test alignment in
  `college-flow.test.mjs`

STOP. DO NOT DEPLOY.
