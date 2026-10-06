"""Offline tenant and membership operations against two real SQL tenants."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
import re
import csv
import io
import json
import httpx
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import HTTPException, UploadFile, FastAPI
from starlette.datastructures import Headers

from app import dependencies
from app.routers import org_college_students as students
from app.routers.org_college_schemas import AddStudentRequest, UpdateStudentRequest
from test_batch0_history_safety import StoredHistory, OWNER, OTHER


def uid(n):
    return str(UUID(int=n, version=4))


A, B, ADMIN_A, ADMIN_B, A2, NORMAL = map(uid, (501, 502, 601, 602, 1001, 3000))


def admin(org=A, identity=ADMIN_A):
    return SimpleNamespace(organization_id=org, user_id=identity, email="admin@example.com", admin_role="org_admin")


class CollegeStore(StoredHistory):
    def __init__(self):
        super().__init__()
        self.lock = asyncio.Lock()
        self.fail_on = None
        for name, kind in {"organization_id": "TEXT", "is_org_admin": "INTEGER", "is_admin": "INTEGER", "referral_code": "TEXT", "phone": "TEXT"}.items():
            if name not in {r[1] for r in self.db.execute("PRAGMA table_info(profiles)")}:
                self.db.execute(f"ALTER TABLE profiles ADD COLUMN {name} {kind}")
        self.db.executescript("""
            CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT, org_code TEXT,
                category TEXT DEFAULT 'college', status TEXT DEFAULT 'active', seat_limit INT DEFAULT 10,
                seats_used INT DEFAULT 0);
            CREATE TABLE organization_admins (id TEXT PRIMARY KEY DEFAULT (random_uuid()),
                organization_id TEXT, user_id TEXT, email TEXT, full_name TEXT, phone TEXT,
                role TEXT DEFAULT 'org_admin', status TEXT DEFAULT 'active', UNIQUE(organization_id,user_id));
            CREATE TABLE college_departments (id TEXT PRIMARY KEY, organization_id TEXT, department_name TEXT);
            CREATE TABLE college_years (id TEXT PRIMARY KEY, organization_id TEXT, year_name TEXT);
            CREATE TABLE college_batches (id TEXT PRIMARY KEY, organization_id TEXT, batch_name TEXT, year_id TEXT);
            CREATE TABLE organization_students (id TEXT PRIMARY KEY DEFAULT (random_uuid()),
                organization_id TEXT NOT NULL, user_id TEXT NOT NULL, student_code TEXT,
                department_id TEXT, year_id TEXT, batch_id TEXT, section TEXT, notes TEXT,
                has_career_access INT DEFAULT 0, access_granted_at TEXT, access_granted_by TEXT,
                status TEXT DEFAULT 'active', added_at TEXT DEFAULT (now()), updated_at TEXT DEFAULT (now()),
                UNIQUE(organization_id,user_id), UNIQUE(organization_id,student_code));
            CREATE TABLE organization_access_log (organization_id TEXT, admin_user_id TEXT,
                student_user_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT, notes TEXT, metadata TEXT);
            CREATE TRIGGER seats_insert AFTER INSERT ON organization_students BEGIN
              UPDATE organizations SET seats_used=(SELECT count(*) FROM organization_students
                WHERE organization_id=NEW.organization_id AND status!='removed') WHERE id=NEW.organization_id;
            END;
            CREATE TRIGGER seats_status AFTER UPDATE OF status ON organization_students BEGIN
              UPDATE organizations SET seats_used=(SELECT count(*) FROM organization_students
                WHERE organization_id=NEW.organization_id AND status!='removed') WHERE id=NEW.organization_id;
            END;
        """)
        for table, columns in {
            "placement_drives": "id TEXT PRIMARY KEY, organization_id TEXT, title TEXT, company_name TEXT, company_id TEXT, role TEXT, description TEXT, status TEXT DEFAULT 'DRAFT', created_by TEXT, created_at TEXT DEFAULT (now()), updated_at TEXT DEFAULT (now())",
            "drive_audit_log": "drive_id TEXT, actor_id TEXT, actor_label TEXT, event_type TEXT, from_status TEXT, to_status TEXT, detail TEXT",
            "college_placement_config": "organization_id TEXT PRIMARY KEY, target_companies TEXT, readiness_threshold INT, focus_pillars TEXT, notes TEXT, updated_by TEXT, updated_at TEXT",
            "org_report_schedules": "id TEXT PRIMARY KEY DEFAULT (random_uuid()), organization_id TEXT, created_by_user_id TEXT, recipient_email TEXT, department_id TEXT, year_id TEXT, batch_id TEXT, frequency TEXT, active INT DEFAULT 1, next_run_at TEXT, last_run_at TEXT, last_status TEXT, last_error TEXT, lease_until TEXT, created_at TEXT DEFAULT (now()), updated_at TEXT",
            "recruiter_companies": "id TEXT PRIMARY KEY, organization_id TEXT, status TEXT, name TEXT",
            "training_program": "id TEXT PRIMARY KEY, institution_id TEXT, status TEXT",
            "placement_seasons": "id TEXT PRIMARY KEY, organization_id TEXT, status TEXT",
            "offers": "id TEXT PRIMARY KEY, institution_id TEXT, student_id TEXT, company_id TEXT, drive_id TEXT, status TEXT",
            "assessment": "id TEXT PRIMARY KEY, institution_id TEXT",
            "assessment_version": "id TEXT PRIMARY KEY, assessment_id TEXT, status TEXT",
            "taxonomy_term": "id TEXT PRIMARY KEY, institution_id TEXT, domain TEXT, is_active INT",
            "org_communications": "id TEXT PRIMARY KEY, organization_id TEXT, requires_ack INT",
            "org_communication_recipients": "message_id TEXT, student_id TEXT, delivery_status TEXT, opened_at TEXT, acknowledged_at TEXT",

        }.items():
            self.db.execute(f"CREATE TABLE {table} ({columns})")
        for table, extra in {
            "interview_sessions": {"organization_id": "TEXT"},
            "organizations": {"plan": "TEXT", "access_expiry": "TEXT", "created_at": "TEXT"},
            "organization_students": {"total_sessions_completed": "INT DEFAULT 0", "latest_overall_score": "REAL", "readiness_tier": "TEXT", "is_zero_offer_risk": "INT DEFAULT 0", "graduation_year": "INT"},
            "profiles": {"graduation_year": "INT"},
            "recruiter_companies": {"relationship_stage": "TEXT", "created_at": "TEXT"},
            "college_departments": {"department_code": "TEXT", "notes": "TEXT", "status": "TEXT DEFAULT 'active'", "updated_at": "TEXT"},
            "college_years": {"notes": "TEXT", "status": "TEXT DEFAULT 'active'", "display_order": "INT", "updated_at": "TEXT"},
            "college_batches": {"batch_code": "TEXT", "notes": "TEXT", "status": "TEXT DEFAULT 'active'", "updated_at": "TEXT"},
        }.items():
            for name, kind in extra.items():
                self.db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
        self.db.execute("CREATE TABLE placement_outcomes (session_id TEXT, college_id TEXT, company_name TEXT, placed INT, interview_round TEXT, created_at TEXT, UNIQUE(session_id,company_name))")
        self.db.execute("CREATE TABLE answer_quality_flags (session_id TEXT, filler_word_ratio REAL, star_usage_score REAL)")
        self.db.execute("CREATE TABLE recruiter_followups (organization_id TEXT, status TEXT, due_at TEXT)")
        self.db.execute("ALTER TABLE organization_admins ADD COLUMN updated_at TEXT")
        self.db.execute("ALTER TABLE organization_students ADD COLUMN access_expires_at TEXT")
        for org, name in ((A, "College A"), (B, "College B")):
            self.insert("organizations", id=org, name=name, org_code=name)
        self.db.execute("UPDATE profiles SET email=?, organization_id=?, org_student=1 WHERE id=?", ("a1@example.com", A, OWNER))
        self.insert("organization_students", id=uid(701), organization_id=A, user_id=OWNER, student_code="A1", has_career_access=1)
        self.insert("profiles", id=OTHER, email="b1@example.com", organization_id=B, org_student=1, plan="career", full_name="B1")
        self.insert("organization_students", id=uid(702), organization_id=B, user_id=OTHER, student_code="B1", has_career_access=1)
        for identity, email in ((A2, "a2@example.com"), (NORMAL, "normal@example.com"), (ADMIN_A, "admina@example.com"), (ADMIN_B, "adminb@example.com")):
            self.insert("profiles", id=identity, email=email, full_name=email, plan="free", org_student=0)
        for org, identity in ((A, ADMIN_A), (B, ADMIN_B)):
            self.insert("organization_admins", organization_id=org, user_id=identity, email=f"admin{'a' if org == A else 'b'}@example.com")

    def run(self, sql, args):
        if self.fail_on and self.fail_on in sql:
            raise TimeoutError("isolated database failure")
        sql = re.sub(r" FOR UPDATE(?: OF \w+)?", "", sql, flags=re.I)
        sql = re.sub(r"= ANY\((\$\d+)::(?:text|uuid)\[\]\)", r"IN (SELECT value FROM json_each(\1))", sql)
        # Narrow syntax equivalents retain tenant predicates and NULL behavior.
        sql = re.sub(r"::(?:numeric|int|text)", "", sql)
        sql = sql.replace("IS NOT DISTINCT FROM", "IS")
        if "pg_advisory_xact_lock" in sql:
            sql = "SELECT 1"  # The owned transaction fixture serializes the lock.
        sql = re.sub(r"\(ARRAY_AGG\(isess.final_score ORDER BY isess.created_at (ASC|DESC)\)\s*FILTER \(WHERE isess.state = 'FINISHED'\)\)\[1\]",
            lambda m: "(SELECT firsts.final_score FROM interview_sessions firsts WHERE firsts.user_id=isess.user_id AND firsts.organization_id=isess.organization_id AND firsts.state='FINISHED' AND firsts.final_score IS NOT NULL ORDER BY firsts.created_at " + m[1] + " LIMIT 1)", sql)
        return super().run(sql, args)

    @asynccontextmanager
    async def transaction(self):
        async with self.lock:
            async with super().transaction():
                yield


@pytest.fixture
def college(monkeypatch):
    store = CollegeStore()
    monkeypatch.setattr(dependencies, "_AUTH_USER_CACHE", {})
    monkeypatch.setattr(students, "DatabaseConnection", store.connection)
    from app.routers import org_admin_users, tpo_config, placement_drives, org_college_analytics, training, org_college_config, outcomes, offers, assessments, placement_interviews, communications
    from app.services import report_schedules
    for module in (org_admin_users, tpo_config, placement_drives, org_college_analytics, training, org_college_config, report_schedules, outcomes, offers, assessments, placement_interviews, communications):
        monkeypatch.setattr(module, "DatabaseConnection", store.connection)
    monkeypatch.setattr(students, "org_measurement_rows", AsyncMock(side_effect=lambda conn, org, rows: [dict(r) for r in rows]))
    from app.services import plan_access
    monkeypatch.setattr(plan_access, "ensure_plan_entitlements", AsyncMock())
    monkeypatch.setattr(plan_access, "sync_user_purchase_stats", AsyncMock())
    monkeypatch.setattr(plan_access, "get_launch_offer_state", AsyncMock(return_value={"active_plans": [], "expired_plans": []}))
    yield store
    store.db.close()


def enroll(email="a2@example.com", **kw):
    return AddStudentRequest(email=email, student_code="A2", **kw)


def test_enrollment_replay_even_at_capacity(college):
    first = asyncio.run(students.add_student(enroll(), admin()))
    college.db.execute("UPDATE organizations SET seat_limit=seats_used WHERE id=?", (A,))
    second = asyncio.run(students.add_student(enroll("A2@EXAMPLE.COM"), admin()))
    assert second["student"]["id"] == first["student"]["id"]
    assert second["status"] == "already_enrolled"
    assert college.db.execute("SELECT count(*) FROM organization_students WHERE user_id=?", (A2,)).fetchone()[0] == 1
    assert college.db.execute("SELECT count(*) FROM organization_access_log").fetchone()[0] == 1


@pytest.mark.parametrize("email,code", [("b1@example.com", "A2"), ("a2@example.com", "A1")])
def test_cross_org_and_duplicate_code_rejected(college, email, code):
    before = list(college.db.execute("SELECT * FROM profiles"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(students.add_student(AddStudentRequest(email=email, student_code=code), admin()))
    assert error.value.status_code == 409
    assert list(college.db.execute("SELECT * FROM profiles")) == before


def test_missing_profile_does_not_create_membership(college):
    with pytest.raises(HTTPException) as error:
        asyncio.run(students.add_student(enroll("missing@example.com"), admin()))
    assert error.value.status_code == 404
    assert college.db.execute("SELECT count(*) FROM organization_students").fetchone()[0] == 2


def test_enrollment_failure_rolls_back_all_writes(college):
    before = list(college.db.execute("SELECT * FROM profiles"))
    college.fail_on = "INSERT INTO organization_access_log"
    with pytest.raises(TimeoutError):
        asyncio.run(students.add_student(enroll(), admin()))
    assert list(college.db.execute("SELECT * FROM profiles")) == before
    assert college.db.execute("SELECT count(*) FROM organization_students").fetchone()[0] == 2
    assert college.db.execute("SELECT seats_used FROM organizations WHERE id=?", (A,)).fetchone()[0] == 1


def test_concurrent_enrollment_same_identity_different_tenants(college):
    async def run():
        return await asyncio.gather(students.add_student(enroll(), admin()), students.add_student(enroll(), admin(B, ADMIN_B)), return_exceptions=True)
    results = asyncio.run(run())
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results) == 1
    assert college.db.execute("SELECT count(*) FROM organization_students WHERE user_id=?", (A2,)).fetchone()[0] == 1


def test_changed_replay_does_not_overwrite_enrollment(college):
    asyncio.run(students.add_student(enroll(), admin()))
    with pytest.raises(HTTPException) as error:
        asyncio.run(students.add_student(enroll(notes="different"), admin()))
    assert error.value.status_code == 409
    assert college.db.execute("SELECT notes FROM organization_students WHERE user_id=?", (A2,)).fetchone()[0] is None


@pytest.mark.parametrize("identity,org", [(ADMIN_A, A), (ADMIN_B, B)])
def test_admin_context_is_server_owned(college, monkeypatch, identity, org):
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    user = dependencies.UserProfile(id=identity, email="untrusted@example.com", plan="free")
    context = asyncio.run(dependencies.get_org_admin(user))
    assert context.organization_id == org
    college.db.execute("UPDATE organization_admins SET status='suspended' WHERE user_id=?", (identity,))
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependencies.get_org_admin(user))
    assert error.value.status_code == 403


@pytest.mark.parametrize("identity", [OWNER, OTHER, NORMAL])
def test_students_cannot_acquire_admin_context(college, monkeypatch, identity):
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependencies.get_org_admin(dependencies.UserProfile(id=identity, email="", plan="career")))
    assert error.value.status_code == 403


@pytest.mark.parametrize("operation", ["get", "update", "remove", "grant", "revoke"])
def test_guessed_foreign_student_id(college, operation):
    calls = {
        "get": lambda: students.get_student(uid(702), admin()),
        "update": lambda: students.update_student(uid(702), UpdateStudentRequest(notes="intrusion"), admin()),
        "remove": lambda: students.remove_student(uid(702), admin()),
        "grant": lambda: students.grant_career_access(uid(702), admin()),
        "revoke": lambda: students.revoke_career_access(uid(702), admin()),
    }
    before = college.snapshot()
    with pytest.raises(HTTPException) as error:
        asyncio.run(calls[operation]())
    assert error.value.status_code == 404
    assert college.snapshot() == before


def test_roster_never_returns_foreign_students(college):
    result = asyncio.run(students.list_students(admin=admin()))
    assert [r["user_id"] for r in result["students"]] == [OWNER]
    assert result["total"] == 1


def test_removed_membership_preserves_personal_history_and_entitlement(college):
    from datetime import timedelta, timezone
    college.insert("user_plan_entitlements", user_id=OWNER, plan="pro", status="active", expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).isoformat())
    before = college.snapshot()
    asyncio.run(students.remove_student(uid(701), admin()))
    asyncio.run(students.remove_student(uid(701), admin()))
    assert college.snapshot() == before
    profile = college.db.execute("SELECT plan, org_student, organization_id FROM profiles WHERE id=?", (OWNER,)).fetchone()
    assert tuple(profile) == ("pro", 0, None)
    assert college.db.execute("SELECT count(*) FROM organization_access_log").fetchone()[0] == 1


def test_membership_removal_audit_failure_rolls_back(college):
    before = [tuple(r) for r in college.db.execute("SELECT * FROM profiles")]
    college.fail_on = "INSERT INTO organization_access_log"
    with pytest.raises(TimeoutError):
        asyncio.run(students.remove_student(uid(701), admin()))
    assert [tuple(r) for r in college.db.execute("SELECT * FROM profiles")] == before
    assert college.db.execute("SELECT status FROM organization_students WHERE id=?", (uid(701),)).fetchone()[0] == "active"


def test_removed_student_can_reenroll_without_history_rewrite(college):
    before = college.snapshot()
    asyncio.run(students.remove_student(uid(701), admin()))
    result = asyncio.run(students.add_student(AddStudentRequest(email="a1@example.com", student_code="A1"), admin()))
    assert result["student"]["id"] == uid(701)
    assert result["student"]["status"] == "active"
    assert college.snapshot() == before


def test_inactive_membership_is_not_silently_reactivated(college):
    college.db.execute("UPDATE organization_students SET status='inactive' WHERE id=?", (uid(701),))
    with pytest.raises(HTTPException) as error:
        asyncio.run(students.add_student(AddStudentRequest(email="a1@example.com", student_code="A1"), admin()))
    assert error.value.status_code == 409
    with pytest.raises(HTTPException):
        asyncio.run(students.grant_career_access(uid(701), admin()))


def csv_file(rows, uppercase=False):
    from app.config import COLLEGE_CSV_REQUIRED_COLUMNS
    fields = sorted(COLLEGE_CSV_REQUIRED_COLUMNS | {"year"})
    output = io.StringIO()
    writer = csv.DictWriter(output, fields)
    if uppercase:
        output.write(",".join(f" {f.upper()} " for f in fields) + "\n")
    else:
        writer.writeheader()
    writer.writerows(rows)
    return UploadFile(io.BytesIO(output.getvalue().encode("utf-8-sig")), filename="students.csv", headers=Headers({"content-type": "text/csv"}))


def csv_row(**values):
    return {"email": "a2@example.com", "student_id": "A2", "department": "CS", "batch": "2026", "year": "Final", **values}


def segments(college):
    college.insert("college_departments", id=uid(801), organization_id=A, department_name="CS")
    college.insert("college_years", id=uid(802), organization_id=A, year_name="Final")
    college.insert("college_batches", id=uid(803), organization_id=A, batch_name="2026", year_id=uid(802))


def test_bulk_case_duplicates_and_replay_are_explicit(college):
    segments(college)
    rows = [csv_row(), csv_row(email="A2@EXAMPLE.COM")]
    first = asyncio.run(students.bulk_upload_students(csv_file(rows, uppercase=True), admin()))
    assert (first["success"], first["already_enrolled"], first["failed_count"]) == (1, 1, 0)
    second = asyncio.run(students.bulk_upload_students(csv_file(rows), admin()))
    assert (second["success"], second["already_enrolled"], second["failed_count"]) == (0, 2, 0)
    assert college.db.execute("SELECT count(*) FROM organization_students WHERE user_id=?", (A2,)).fetchone()[0] == 1


def test_bulk_partial_validation_results(college):
    segments(college)
    rows = [csv_row(), csv_row(email="normal@example.com", student_id="A2"), csv_row(email="b1@example.com", student_id="B1"), csv_row(email="missing@example.com", student_id="M"), csv_row(student_id="")]
    result = asyncio.run(students.bulk_upload_students(csv_file(rows), admin()))
    assert (result["success"], result["failed_count"]) == (1, 4)
    assert [r["row"] for r in result["row_results"]] == [1, 2, 3, 4, 5]
    assert all(r["errors"] for r in result["failed_rows"])


def test_bulk_runtime_failure_is_atomic(college):
    segments(college)
    before = [tuple(r) for r in college.db.execute("SELECT * FROM profiles")]
    college.fail_on = "INSERT INTO organization_access_log"
    with pytest.raises(TimeoutError):
        asyncio.run(students.bulk_upload_students(csv_file([csv_row()]), admin()))
    assert [tuple(r) for r in college.db.execute("SELECT * FROM profiles")] == before
    assert college.db.execute("SELECT count(*) FROM organization_students").fetchone()[0] == 2


def test_admin_assignment_replay_disable_and_cross_org(college, monkeypatch):
    from app.routers import org_admin_users as routes
    from app.routers.org_admin_schemas import CreateOrgAdminRequest
    body = CreateOrgAdminRequest(organization_id=A, email="normal@example.com")
    first = asyncio.run(routes.create_org_admin(body))
    second = asyncio.run(routes.create_org_admin(body))
    assert second["admin"]["id"] == first["admin"]["id"]
    asyncio.run(routes.disable_org_admin(first["admin"]["id"]))
    replay = asyncio.run(routes.create_org_admin(body))
    assert replay["admin"]["status"] == "suspended"
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    with pytest.raises(HTTPException):
        asyncio.run(dependencies.get_org_admin(dependencies.UserProfile(NORMAL, "", "free")))
    assert asyncio.run(routes.enable_org_admin(first["admin"]["id"]))["status"] == "enabled"
    assert asyncio.run(dependencies.get_org_admin(dependencies.UserProfile(NORMAL, "", "free"))).organization_id == A
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.create_org_admin(CreateOrgAdminRequest(organization_id=B, email="normal@example.com")))
    assert error.value.status_code == 409


@pytest.mark.parametrize("role,write,allowed", [("org_admin", True, True), ("viewer", True, False), ("placement_officer", True, False), ("dept_admin", False, False), ("viewer", False, True), ("placement_officer", False, True)])
def test_org_role_capabilities(role, write, allowed):
    context = dependencies.OrgAdminProfile(dependencies.UserProfile(ADMIN_A, "", "free"), uid(611), A, "A", "A", "college", "active", role)
    if allowed:
        assert asyncio.run(dependencies.require_org_admin(write=write)(context)) is context
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(dependencies.require_org_admin(write=write)(context))
        assert error.value.status_code == 403


def test_disabled_organization_blocks_context(college, monkeypatch):
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    college.db.execute("UPDATE organizations SET status='suspended' WHERE id=?", (A,))
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependencies.get_org_admin(dependencies.UserProfile(ADMIN_A, "", "free")))
    assert error.value.status_code == 403


def test_drive_create_and_status_retry(college):
    from app.routers import placement_drives as drives
    request_id = UUID(uid(909))
    body = drives.CreateDriveRequest(title="Campus drive", company_name="Company", role="Developer", client_request_id=request_id)
    first = asyncio.run(drives.create_drive(body, admin()))
    second = asyncio.run(drives.create_drive(body, admin()))
    assert first["id"] == second["id"]
    assert college.db.execute("SELECT count(*) FROM placement_drives").fetchone()[0] == 1
    assert college.db.execute("SELECT count(*) FROM drive_audit_log").fetchone()[0] == 1
    asyncio.run(drives.transition_drive_status(UUID(first["id"]), drives.TransitionRequest(to_status="UNDER_REVIEW"), admin()))
    replay = asyncio.run(drives.transition_drive_status(UUID(first["id"]), drives.TransitionRequest(to_status="UNDER_REVIEW"), admin()))
    assert replay["idempotent"]
    with pytest.raises(HTTPException) as error:
        asyncio.run(drives.transition_drive_status(UUID(first["id"]), drives.TransitionRequest(to_status="APPROVED"), admin(B, ADMIN_B)))
    assert error.value.status_code == 404
    changed = body.model_copy(update={"title": "Different"})
    with pytest.raises(HTTPException) as error:
        asyncio.run(drives.create_drive(changed, admin()))
    assert error.value.status_code == 409


def test_config_uses_authenticated_tenant_and_rolls_back(college):
    from app.routers import tpo_config as config
    body = config.PlacementConfigRequest(readiness_threshold=75)
    asyncio.run(config.update_placement_config(body, admin()))
    asyncio.run(config.update_placement_config(body, admin()))
    assert college.db.execute("SELECT count(*) FROM college_placement_config").fetchone()[0] == 1
    assert asyncio.run(config.get_placement_config(admin(B, ADMIN_B)))["config"]["is_default"]
    college.fail_on = "INSERT INTO organization_access_log"
    with pytest.raises(TimeoutError):
        asyncio.run(config.update_placement_config(body.model_copy(update={"readiness_threshold": 90}), admin()))
    assert asyncio.run(config.get_placement_config(admin()))["config"]["readiness_threshold"] == 75


@pytest.mark.parametrize("reason", ["recipient", "creator", "organization", "segment", "foreign_id", "disabled"])
def test_schedule_reauthorization(college, reason):
    from app.services import report_schedules
    from app.routers import org_college_analytics as analytics
    schedule = {"id": uid(991), "organization_id": A, "created_by_user_id": ADMIN_A, "recipient_email": "admina@example.com", "frequency": "weekly", "department_id": None, "year_id": None, "batch_id": None}
    college.insert("org_report_schedules", **schedule)
    asyncio.run(report_schedules._authorize_schedule(schedule))
    if reason == "recipient":
        college.db.execute("UPDATE org_report_schedules SET recipient_email='adminb@example.com'")
    elif reason == "creator":
        college.db.execute("UPDATE organization_admins SET status='suspended' WHERE user_id=?", (ADMIN_A,))
    elif reason == "organization":
        college.db.execute("UPDATE organizations SET status='suspended' WHERE id=?", (A,))
    elif reason == "segment":
        college.insert("college_departments", id=uid(881), organization_id=B, department_name="B private")
        college.db.execute("UPDATE org_report_schedules SET department_id=?", (uid(881),))
    elif reason == "foreign_id":
        schedule["organization_id"] = B
    elif reason == "disabled":
        with pytest.raises(HTTPException) as error:
            asyncio.run(analytics.disable_report_schedule(uid(991), admin(B, ADMIN_B)))
        assert error.value.status_code == 404
        asyncio.run(analytics.disable_report_schedule(uid(991), admin()))
        asyncio.run(analytics.disable_report_schedule(uid(991), admin()))
    with pytest.raises(PermissionError):
        asyncio.run(report_schedules._authorize_schedule(schedule))


def test_grant_revoke_preserve_personal_plan_and_history(college):
    from datetime import timedelta, timezone
    college.insert("user_plan_entitlements", user_id=OWNER, plan="pro", status="active", expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).isoformat())
    before = college.snapshot()
    asyncio.run(students.revoke_career_access(uid(701), admin()))
    assert college.db.execute("SELECT plan FROM profiles WHERE id=?", (OWNER,)).fetchone()[0] == "pro"
    assert asyncio.run(students.revoke_career_access(uid(701), admin()))["status"] == "already_revoked"
    asyncio.run(students.grant_career_access(uid(701), admin()))
    assert college.db.execute("SELECT plan FROM profiles WHERE id=?", (OWNER,)).fetchone()[0] == "career"
    assert college.snapshot() == before


@pytest.fixture
def client(college, monkeypatch):
    from app.routers import tpo_config, placement_drives, org_college_analytics, org_admin_users, training, reports, outcomes, offers, assessments, placement_interviews, org_college_config
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    monkeypatch.setattr(reports, "DatabaseConnection", college.connection)
    app = FastAPI()
    for router, prefix in ((students.router, "/org/my"), (tpo_config.router, "/org/my"), (placement_drives.router, "/org/my"), (org_college_analytics.router, "/org/my"), (org_admin_users.router, "/org/admin"), (training.router, "/api/tpo/training"), (reports.router, "/reports"), (outcomes.router, "/api/outcomes"), (offers.router, "/org/my/offers"), (assessments.router, "/api/tpo/assessments"), (placement_interviews.router, "/org/my"), (org_college_config.router, "/org/my")):
        app.include_router(router, prefix=prefix)
    caller = {"id": ADMIN_A, "platform": False}
    async def current_user():
        return dependencies.UserProfile(caller["id"], "", "career", is_admin=caller["platform"], owned_plans=["free", "career"])
    app.dependency_overrides[dependencies.get_current_user] = current_user
    class LocalClient:
        def request(self, method, path, **kwargs):
            async def run():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://isolated") as client:
                    return await client.request(method, path, **kwargs)
            return asyncio.run(run())
        def get(self, path, **kwargs):
            return self.request("GET", path, **kwargs)
        def put(self, path, **kwargs):
            return self.request("PUT", path, **kwargs)
    yield LocalClient(), caller


@pytest.mark.parametrize("path", ["/org/my/students", "/org/my/dashboard", "/org/my/analytics", "/org/my/analytics/readiness", "/org/my/reports/export", "/org/my/reports/schedules", "/org/my/placement-config", "/org/my/drives", "/org/admin/admins"])
def test_actual_routes_reject_student_admin_calls(client, path):
    http, caller = client
    caller["id"] = OWNER
    response = http.get(path)
    assert response.status_code == 403


def test_http_tenant_context_ignores_client_org_and_foreign_student(client):
    http, _ = client
    response = http.get(f"/org/my/students?organization_id={B}")
    assert response.status_code == 200
    assert [r["user_id"] for r in response.json()["students"]] == [OWNER]
    assert http.get(f"/org/my/students/{uid(702)}").status_code == 404
    assert http.get(f"/org/my/students/{uid(702)}/performance").status_code == 404
    assert http.put("/org/my/placement-config", json={"organization_id": B, "readiness_threshold": 75}).status_code == 200
    assert http.get("/org/my/placement-config").json()["config"]["readiness_threshold"] == 75


@pytest.mark.parametrize("caller_id", [ADMIN_A, OWNER])
def test_direct_foreign_report_id_has_no_owner_bypass(client, college, caller_id):
    http, caller = client
    caller["id"] = caller_id
    foreign_session = uid(999)
    assert http.get(f"/reports/{foreign_session}").status_code == 404
    assert http.get(f"/reports/{foreign_session}/pdf").status_code == 404


def test_removed_admin_fails_next_http_check_with_same_user(client, college):
    http, caller = client
    assert http.get("/org/my/students").status_code == 200
    college.db.execute("UPDATE organization_admins SET status='suspended' WHERE user_id=?", (ADMIN_A,))
    assert http.get("/org/my/students").status_code == 403
    caller["platform"] = True
    # Platform privilege does not invent college membership; its own dependency remains authorized.
    dependency = dependencies.require_main_admin()
    assert asyncio.run(dependency(dependencies.UserProfile(ADMIN_A, "", "free", is_admin=True))).is_admin


@pytest.mark.parametrize("flag", ["no_grant", "inactive", "removed", "org_disabled", "expired", "active"])
def test_uncached_auth_resolves_actual_membership_benefit(college, monkeypatch, flag):
    from starlette.requests import Request
    import app.database.connection as connection
    monkeypatch.setattr(connection, "_pool", None)
    monkeypatch.setattr(dependencies, "get_db", AsyncMock(return_value=college))
    monkeypatch.setattr(dependencies, "get_settings", lambda: SimpleNamespace(ADMIN_EMAIL=""))
    monkeypatch.setattr(dependencies, "_decode_token_identity", lambda *args: {"auth_user_id": OWNER, "email": "a1@example.com", "provider": "email"})
    monkeypatch.setattr(dependencies, "get_profile_id_for_auth_user", AsyncMock(return_value=OWNER))
    monkeypatch.setattr(dependencies, "_get_cached_user", lambda token: None)
    monkeypatch.setattr(dependencies, "_get_cached_user_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(dependencies, "_set_cached_user_redis", AsyncMock())
    monkeypatch.setattr(dependencies, "ensure_referral_identity", AsyncMock())
    monkeypatch.setattr(dependencies, "record_user_presence", AsyncMock())
    if flag == "no_grant":
        college.db.execute("UPDATE organization_students SET has_career_access=0 WHERE user_id=?", (OWNER,))
    elif flag in ("inactive", "removed"):
        college.db.execute("UPDATE organization_students SET status=? WHERE user_id=?", (flag, OWNER))
    elif flag == "org_disabled":
        college.db.execute("UPDATE organizations SET status='suspended' WHERE id=?", (A,))
    elif flag == "expired":
        college.db.execute("UPDATE organization_students SET access_expires_at='2020-01-01' WHERE user_id=?", (OWNER,))
    request = Request({"type": "http", "headers": [(b"authorization", b"Bearer " + b"a" * 60)]})
    user = asyncio.run(dependencies.get_current_user(request))
    assert user.is_org_student is (flag in {"active", "no_grant", "expired"})
    assert user.effective_plan == ("career" if flag == "active" else "free")

@pytest.mark.parametrize("entity", ["department", "year", "batch"])
def test_segment_create_replay_and_foreign_year(college, entity):
    from app.routers import org_college_config as config
    from app.routers.org_college_schemas import SegmentRequest, BatchRequest
    body = BatchRequest(name="CSE", code="CSE") if entity == "batch" else SegmentRequest(name="CSE", code="CSE")
    fn = getattr(config, "create_" + entity)
    first = asyncio.run(fn(body, admin()))
    replay = asyncio.run(fn(body, admin()))
    assert first[entity]["id"] == replay[entity]["id"]
    assert replay["status"] == "already_exists"
    changed = body.model_copy(update={"notes": "different"})
    with pytest.raises(HTTPException) as error:
        asyncio.run(fn(changed, admin()))
    assert error.value.status_code == 409
    if entity == "batch":
        college.insert("college_years", id=uid(882), organization_id=B, year_name="B private")
        with pytest.raises(HTTPException) as error:
            asyncio.run(fn(BatchRequest(name="new", year_id=uid(882)), admin()))
        assert error.value.status_code == 422


@pytest.mark.parametrize("field", ["recipient_email", "created_by_user_id", "frequency", "department_id"])
def test_schedule_claim_snapshot_cannot_deliver_changed_configuration(college, field):
    from app.services import report_schedules
    claim = dict(id=uid(992), organization_id=A, created_by_user_id=ADMIN_A, recipient_email="admina@example.com", frequency="weekly", department_id=None, year_id=None, batch_id=None)
    college.insert("org_report_schedules", **claim)
    asyncio.run(report_schedules._authorize_schedule(claim))
    changed = {"recipient_email": "othera@example.com", "created_by_user_id": A2, "frequency": "monthly", "department_id": uid(883)}
    college.insert("organization_admins", organization_id=A, user_id=A2, email="othera@example.com")
    college.insert("college_departments", id=uid(883), organization_id=A, department_name="A new filter")
    college.db.execute(f"UPDATE org_report_schedules SET {field}=?", (changed[field],))
    with pytest.raises(PermissionError):
        asyncio.run(report_schedules._authorize_schedule(claim))


def test_schedule_save_retry_preserves_lease_and_rejects_foreign_recipient(college, monkeypatch):
    from app.routers import org_college_analytics as analytics
    monkeypatch.setattr(analytics, "get_settings", lambda: SimpleNamespace(RESEND_API_KEY="offline-placeholder"))
    body = analytics.ScheduleReportRequest(frequency="weekly", email="admina@example.com")
    first = asyncio.run(analytics.schedule_student_report(body, admin()))
    college.db.execute("UPDATE org_report_schedules SET lease_until='2099-01-01',last_status='processing'")
    again = asyncio.run(analytics.schedule_student_report(body, admin()))
    assert first["schedule_id"] == again["schedule_id"]
    assert college.db.execute("SELECT lease_until,last_status FROM org_report_schedules").fetchone()[0] == "2099-01-01"
    for extra in ({"email": "adminb@example.com"}, {"department_id": uid(884)}):
        college.insert("college_departments", id=uid(884), organization_id=B, department_name="B secret") if "department_id" in extra else None
        with pytest.raises(HTTPException) as error:
            asyncio.run(analytics.schedule_student_report(body.model_copy(update=extra), admin()))
        assert error.value.status_code == 422
    assert college.db.execute("SELECT count(*) FROM org_report_schedules").fetchone()[0] == 1


@pytest.mark.parametrize("trainer", [OTHER, NORMAL, ADMIN_B])
def test_training_rejects_foreign_or_nonmember_trainer_before_writes(college, trainer):
    from app.routers import training
    body = training.CreateTrainingProgramRequest(seasonId=uid(901), categoryId=uid(902), name="Training", trainerUserId=trainer)
    with pytest.raises(HTTPException) as error:
        asyncio.run(training.create_program(body, admin()))
    assert error.value.status_code == 422
    assert college.db.execute("SELECT count(*) FROM training_program").fetchone()[0] == 0


def set_measurement(college, outcomes, score):
    from test_batch3_report_integrity import session
    record = session(outcomes, score=score)
    session_id = college.ids[0]
    college.db.execute("UPDATE interview_sessions SET organization_id=NULL")
    college.db.execute("UPDATE interview_sessions SET organization_id=?,runtime_state=?,final_score=?,total_turns=? WHERE id=?", (A, json.dumps(record["runtime_state"]), score, len(outcomes), session_id))
    college.db.execute("UPDATE question_evaluations SET score=?,rubric_category='technical_depth' WHERE session_id=?", (0 if score == 0 else 8, session_id))
    # Same student, another organization's historical context must never enter A's metrics.
    college.db.execute("UPDATE interview_sessions SET organization_id=?,final_score=99 WHERE id=?", (B, college.ids[1]))
    college.db.execute("UPDATE interview_sessions SET organization_id=?,final_score=100 WHERE id=?", (B, uid(999)))
    return session_id


@pytest.mark.parametrize("outcomes,score,expected,label", [
    (["TRANSCRIPTION_FAILED"],0,None,"Not measured"),
    (["EVALUATED"],0,0,"Measured"),
    (["EVALUATED","TRANSCRIPTION_FAILED","ABORTED"],80,80,"Partially measured"),
])
def test_actual_dashboard_and_exports_use_tenant_evidence(college, outcomes, score, expected, label):
    from app.routers import org_college_analytics as analytics
    set_measurement(college, outcomes, score)
    before = college.snapshot()
    result = asyncio.run(analytics.college_dashboard(admin()))
    assert result["performance_summary"]["cohort_avg_score"] == expected
    assert result["total_students"] == 1
    data = asyncio.run(analytics.export_student_reports(None,None,None,"json","students",admin()))
    assert len(data["students"]) == 1
    row = data["students"][0]
    assert row["email"] == "a1@example.com" and row["latest_score"] == expected
    assert row["measurement_label"] == label
    assert row["measurement_coverage"]["asked"] == len(outcomes)
    assert not row.get("zero_offer_risk") if expected is None or len(outcomes)>1 else True
    async def csv_body():
        response = await analytics.export_student_reports(None,None,None,"csv","students",admin())
        return b"".join([chunk.encode() if isinstance(chunk,str) else chunk async for chunk in response.body_iterator])
    text = asyncio.run(csv_body()).decode("utf-8")
    assert "b1@example.com" not in text and "B private" not in text
    parsed = list(csv.DictReader(io.StringIO(text)))
    assert len(parsed) == 1
    assert college.snapshot() == before


def test_actual_empty_organization_dashboard_and_export(college):
    from app.routers import org_college_analytics as analytics
    college.db.execute("UPDATE organization_students SET status='removed' WHERE organization_id=?", (A,))
    result = asyncio.run(analytics.college_dashboard(admin()))
    assert result["performance_summary"]["cohort_avg_score"] is None
    assert result["total_students"] == 0
    data = asyncio.run(analytics.export_student_reports(None,None,None,"json","students",admin()))
    assert data["students"] == []
    async def csv_body():
        response = await analytics.export_student_reports(None,None,None,"csv","students",admin())
        return b"".join([chunk.encode() if isinstance(chunk,str) else chunk async for chunk in response.body_iterator])
    text = asyncio.run(csv_body()).decode("utf-8")
    assert len(text.splitlines()) == 1 and "Email" in text

@pytest.mark.parametrize("path,method,body", [
    ("/org/my/drives/{id}","GET",None),
    ("/org/my/drives/{id}/status","POST",{"to_status":"APPLICATIONS_OPEN"}),
    ("/org/my/placement-interviews/rounds/{id}","GET",None),
    ("/org/my/placement-interviews/rounds/{id}","POST",{"name":"Round","sequence":1}),
    ("/api/tpo/training/programs/{id}","GET",None),
    ("/api/tpo/training/programs/{id}/transition","POST",{"toStatus":"SCHEDULED"}),
    ("/api/tpo/assessments/{id}/versions","POST",{"durationMins":30,"maxScore":100}),
    ("/org/my/offers/{id}","GET",None),
    ("/org/my/offers/{id}/status","POST",{"to_status":"CANCELLED"}),
])
def test_http_foreign_placement_parents_rejected(client, college, path, method, body):
    foreign = uid(910)
    college.insert("placement_drives", id=foreign, organization_id=B, title="B private", status="DRAFT")
    college.insert("training_program", id=foreign, institution_id=B, status="DRAFT")
    college.insert("assessment", id=foreign, institution_id=B)
    college.insert("recruiter_companies", id=uid(911), organization_id=B, name="B private", status="ACTIVE")
    college.insert("offers", id=foreign, institution_id=B, student_id=OTHER, company_id=uid(911), drive_id=foreign, status="RECEIVED")
    http, _ = client
    response = http.request(method,path.format(id=foreign),**({"json":body} if body else {}))
    assert response.status_code == 404, response.text
    assert "B private" not in response.text
    assert college.db.execute("SELECT status FROM offers").fetchone()[0] == "RECEIVED"


@pytest.mark.parametrize("identity", [OWNER, ADMIN_A])
def test_global_calibration_cannot_be_called_by_college_or_student(client, identity):
    http, caller = client
    caller["id"] = identity
    response = http.request("POST","/api/outcomes/calibrate/PrivateCompany")
    assert response.status_code == 403


def test_placement_assignment_rejects_other_college_student(client, college):
    http, _ = client
    own_drive = uid(912)
    college.insert("placement_drives", id=own_drive, organization_id=A, title="A drive")
    response = http.request("POST","/org/my/placement-interviews",json={"drive_id":own_drive,"student_id":OTHER})
    assert response.status_code == 422


@pytest.mark.parametrize("organization", [B,None])
def test_outcome_requires_session_organization_and_current_membership(college, organization):
    from app.routers import outcomes
    college.db.execute("UPDATE interview_sessions SET organization_id=? WHERE id=?", (organization,college.ids[0]))
    body = outcomes.OutcomeSubmission(session_id=college.ids[0],company_name="Company",placed=True)
    with pytest.raises(HTTPException) as error:
        asyncio.run(outcomes.submit_outcome(body,admin()))
    assert error.value.status_code == 404
    assert college.db.execute("SELECT count(*) FROM placement_outcomes").fetchone()[0] == 0


def test_outcome_repeat_and_database_failure_preserve_original(college):
    from app.routers import outcomes
    sid = set_measurement(college,["EVALUATED"],80)
    body = outcomes.OutcomeSubmission(session_id=sid,company_name="Company",placed=True)
    asyncio.run(outcomes.submit_outcome(body,admin()))
    asyncio.run(outcomes.submit_outcome(body,admin()))
    assert college.db.execute("SELECT count(*) FROM placement_outcomes").fetchone()[0] == 1
    college.fail_on = "INSERT INTO placement_outcomes"
    with pytest.raises(TimeoutError):
        asyncio.run(outcomes.submit_outcome(body.model_copy(update={"placed":False}),admin()))
    assert college.db.execute("SELECT placed FROM placement_outcomes").fetchone()[0] == 1


@pytest.mark.parametrize("state", ["removed", "inactive", "org_disabled", "other_user", "active"])
def test_student_message_open_requires_own_active_membership(college, state):
    from app.routers import communications
    message = uid(913)
    college.insert("org_communications",id=message,organization_id=A,requires_ack=1)
    college.insert("org_communication_recipients",message_id=message,student_id=OWNER,delivery_status="DELIVERED")
    if state in {"removed","inactive"}:
        college.db.execute("UPDATE organization_students SET status=? WHERE user_id=?",(state,OWNER))
    elif state == "org_disabled":
        college.db.execute("UPDATE organizations SET status='suspended' WHERE id=?",(A,))
    who = OTHER if state == "other_user" else OWNER
    user = dependencies.UserProfile(who,"","free")
    if state == "active":
        asyncio.run(communications.mark_opened(UUID(message),user))
        timestamp = college.db.execute("SELECT opened_at FROM org_communication_recipients").fetchone()[0]
        asyncio.run(communications.mark_opened(UUID(message),user))
        assert college.db.execute("SELECT opened_at FROM org_communication_recipients").fetchone()[0] == timestamp
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(communications.mark_opened(UUID(message),user))
        assert error.value.status_code == 404
        assert college.db.execute("SELECT opened_at FROM org_communication_recipients").fetchone()[0] is None


def test_membership_context_and_plan_are_separate_in_existing_cache(college, monkeypatch):
    # Existing cache fields preserve the real membership even without a grant.
    user = dependencies.UserProfile(OWNER,"a1@example.com","pro",owned_plans=["free","pro"],is_org_student=True)
    dependencies._set_cached_user("college-token",user)
    cached = dependencies._get_cached_user("college-token")
    assert cached.is_org_student and cached.effective_plan == "pro"
    dependencies.invalidate_local_user_context(OWNER)
    assert dependencies._get_cached_user("college-token") is None


def test_own_admin_membership_removal_preserves_admin_context(college):
    college.insert("organization_admins",organization_id=A,user_id=OWNER,email="a1@example.com")
    asyncio.run(students.remove_student(uid(701),admin()))
    assert college.db.execute("SELECT org_student,organization_id FROM profiles WHERE id=?",(OWNER,)).fetchone()[1] == A
    assert college.db.execute("SELECT status FROM organization_admins WHERE user_id=?",(OWNER,)).fetchone()[0] == "active"
