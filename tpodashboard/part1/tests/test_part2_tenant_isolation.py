import uuid

from app.models.company import Company
from app.models.drive import Drive, DriveStatus
from app.models.institution import Batch, Department, Institution, Program
from app.models.user import User, UserRole
from app.security import create_access_token, hash_password


def _make_institution(db, prefix):
    inst = Institution(name=f"{prefix} Institute", short_code=f"{prefix}-{uuid.uuid4().hex[:6]}")
    db.add(inst)
    db.flush()
    dept = Department(institution_id=inst.id, code="CSE", name="Computer Science")
    db.add(dept)
    db.flush()
    program = Program(institution_id=inst.id, department_id=dept.id, code="BTECH-CSE", name="B.Tech CSE")
    db.add(program)
    db.flush()
    batch = Batch(institution_id=inst.id, program_id=program.id, name="B.Tech 2026", graduation_year=2026)
    db.add(batch)
    db.flush()
    user = User(
        institution_id=inst.id, email=f"tpo@{prefix.lower()}.edu", full_name=f"{prefix} TPO",
        role=UserRole.TPO_HEAD, hashed_password=hash_password("TestPass123!"),
    )
    db.add(user)
    db.commit()
    return inst, user


def test_company_isolation_across_institutions(client, db):
    inst_a, user_a = _make_institution(db, "CIA")
    inst_b, user_b = _make_institution(db, "CIB")

    company_b = Company(institution_id=inst_b.id, name="Institution B Only Co")
    db.add(company_b)
    db.commit()

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    resp = client.get(f"/companies/{company_b.id}", headers=headers_a)
    assert resp.status_code == 404

    list_resp = client.get("/companies", headers=headers_a)
    assert list_resp.json()["total"] == 0


def test_drive_isolation_across_institutions(client, db):
    inst_a, user_a = _make_institution(db, "DIA")
    inst_b, user_b = _make_institution(db, "DIB")

    company_b = Company(institution_id=inst_b.id, name="Drive Isolation Co")
    db.add(company_b)
    db.flush()
    drive_b = Drive(institution_id=inst_b.id, company_id=company_b.id, role="SDE", status=DriveStatus.ACTIVE, min_cgpa=0, max_backlogs=99)
    db.add(drive_b)
    db.commit()

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    resp = client.get(f"/drives/{drive_b.id}", headers=headers_a)
    assert resp.status_code == 404

    resp2 = client.get(f"/drives/{drive_b.id}/eligible-students", headers=headers_a)
    assert resp2.status_code == 404

    list_resp = client.get("/drives", headers=headers_a)
    assert list_resp.json()["total"] == 0


def test_eligibility_check_only_sees_own_institution_students(client, db):
    from app.models.student import AcademicRecord, PlacementStatus, Student, StudentStatus

    inst_a, user_a = _make_institution(db, "EIA")
    inst_b, user_b = _make_institution(db, "EIB")

    dept_b = db.query(Department).filter(Department.institution_id == inst_b.id).one()
    program_b = db.query(Program).filter(Program.institution_id == inst_b.id).one()
    batch_b = db.query(Batch).filter(Batch.institution_id == inst_b.id).one()
    student_b = Student(
        institution_id=inst_b.id, batch_id=batch_b.id, department_id=dept_b.id, program_id=program_b.id,
        register_number="EIB001", full_name="Institution B Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student_b)
    db.flush()
    db.add(AcademicRecord(institution_id=inst_b.id, student_id=student_b.id, semester=0, cumulative_cgpa=9.5, backlog_count=0))
    db.commit()

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    resp = client.post(
        "/drives/eligibility-check", headers={"Authorization": f"Bearer {token_a}"},
        json={"min_cgpa": 0, "max_backlogs": 99},
    )
    assert resp.json()["total"] == 0  # institution A has zero students; B's student must not be counted
