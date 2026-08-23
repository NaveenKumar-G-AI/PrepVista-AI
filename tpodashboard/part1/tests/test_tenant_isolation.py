"""
Doc section 25, "Tenant test": Institution A cannot read Institution B.
"""
import uuid

from app.models.institution import Batch, Department, Institution, Program
from app.models.student import PlacementStatus, Student, StudentStatus
from app.models.user import User, UserRole
from app.security import create_access_token, hash_password


def _make_institution_with_student(db, code_prefix: str):
    inst = Institution(name=f"{code_prefix} Institute", short_code=f"{code_prefix}-{uuid.uuid4().hex[:6]}")
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
    student = Student(
        institution_id=inst.id, batch_id=batch.id, department_id=dept.id, program_id=program.id,
        register_number=f"{code_prefix}001", full_name=f"{code_prefix} Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student)
    db.flush()
    user = User(
        institution_id=inst.id, email=f"tpo@{code_prefix.lower()}.edu", full_name=f"{code_prefix} TPO",
        role=UserRole.TPO_HEAD, hashed_password=hash_password("TestPass123!"),
    )
    db.add(user)
    db.commit()
    return inst, student, user


def test_institution_a_cannot_read_institution_b_student(client, db):
    inst_a, student_a, user_a = _make_institution_with_student(db, "INSTA")
    inst_b, student_b, user_b = _make_institution_with_student(db, "INSTB")

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # A can read its own student
    resp_own = client.get(f"/students/{student_a.id}", headers=headers_a)
    assert resp_own.status_code == 200

    # A cannot read B's student, even knowing its exact id
    resp_cross = client.get(f"/students/{student_b.id}", headers=headers_a)
    assert resp_cross.status_code == 404  # not 403 -- we don't even confirm it exists

    # A's student list must not include B's student
    list_resp = client.get("/students", headers=headers_a)
    assert list_resp.status_code == 200
    returned_ids = {item["id"] for item in list_resp.json()["items"]}
    assert str(student_b.id) not in returned_ids
    assert str(student_a.id) in returned_ids


def test_institution_a_cannot_update_institution_b_student(client, db):
    inst_a, student_a, user_a = _make_institution_with_student(db, "INSTC")
    inst_b, student_b, user_b = _make_institution_with_student(db, "INSTD")

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    resp = client.patch(f"/students/{student_b.id}", headers=headers_a, json={"full_name": "Hacked Name"})
    assert resp.status_code == 404

    db.refresh(student_b)
    assert student_b.full_name != "Hacked Name"


def test_dashboard_is_scoped_per_institution(client, db):
    inst_a, student_a, user_a = _make_institution_with_student(db, "INSTE")
    inst_b, student_b, user_b = _make_institution_with_student(db, "INSTF")

    # add a second student only to institution B
    dept_b = db.query(Department).filter(Department.institution_id == inst_b.id).one()
    program_b = db.query(Program).filter(Program.institution_id == inst_b.id).one()
    batch_b = db.query(Batch).filter(Batch.institution_id == inst_b.id).one()
    db.add(Student(
        institution_id=inst_b.id, batch_id=batch_b.id, department_id=dept_b.id, program_id=program_b.id,
        register_number="INSTF002", full_name="Second B Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    token_a = create_access_token(subject=str(user_a.id), extra_claims={"role": user_a.role.value})
    resp_a = client.get("/dashboard/student-overview", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 200
    assert resp_a.json()["total_students"] == 1  # only institution A's student

    token_b = create_access_token(subject=str(user_b.id), extra_claims={"role": user_b.role.value})
    resp_b = client.get("/dashboard/student-overview", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 200
    assert resp_b.json()["total_students"] == 2  # institution B's two students
