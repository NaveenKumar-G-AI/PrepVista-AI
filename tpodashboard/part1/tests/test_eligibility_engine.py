from app.models.student import AcademicRecord, PlacementStatus, Student, StudentStatus


def _student_with_academics(db, tenant, reg_no, cgpa, backlogs, dept_id=None):
    student = Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=dept_id or tenant["department"].id, program_id=tenant["program"].id,
        register_number=reg_no, full_name=f"Student {reg_no}",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student)
    db.flush()
    db.add(AcademicRecord(institution_id=tenant["institution"].id, student_id=student.id, semester=0, cumulative_cgpa=cgpa, backlog_count=backlogs))
    db.commit()
    return student


def test_eligibility_check_filters_by_cgpa_and_backlogs(client, auth_headers, tenant, db):
    _student_with_academics(db, tenant, "ELIG001", 8.5, 0)   # eligible
    _student_with_academics(db, tenant, "ELIG002", 6.0, 0)   # fails cgpa
    _student_with_academics(db, tenant, "ELIG003", 8.5, 2)   # fails backlogs
    _student_with_academics(db, tenant, "ELIG004", 9.0, 0)   # eligible

    resp = client.post("/drives/eligibility-check", headers=auth_headers, json={"min_cgpa": 7.5, "max_backlogs": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 4
    assert body["eligible"] == 2
    assert body["cgpa_fail"] == 1
    assert body["backlog_fail"] == 1


def test_eligibility_check_filters_by_department(client, auth_headers, tenant, db):
    from app.models.institution import Department

    other_dept = Department(institution_id=tenant["institution"].id, code="MECH", name="Mechanical")
    db.add(other_dept)
    db.commit()

    _student_with_academics(db, tenant, "DEPT001", 9.0, 0, dept_id=tenant["department"].id)
    _student_with_academics(db, tenant, "DEPT002", 9.0, 0, dept_id=other_dept.id)

    resp = client.post(
        "/drives/eligibility-check", headers=auth_headers,
        json={"min_cgpa": 0, "max_backlogs": 99, "department_ids": [str(tenant["department"].id)]},
    )
    body = resp.json()
    assert body["total"] == 2
    assert body["eligible"] == 1
    assert body["dept_fail"] == 1


def test_student_with_no_academic_record_is_not_eligible(client, auth_headers, tenant, db):
    student = Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="NOACAD001", full_name="No Academic Record",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student)
    db.commit()

    resp = client.post("/drives/eligibility-check", headers=auth_headers, json={"min_cgpa": 0, "max_backlogs": 99})
    body = resp.json()
    assert body["total"] == 1
    assert body["eligible"] == 0  # no CGPA on record -> can't be confirmed eligible, not assumed eligible


def test_create_drive_and_get_eligible_students(client, auth_headers, tenant, db):
    _student_with_academics(db, tenant, "CD001", 8.5, 0)
    _student_with_academics(db, tenant, "CD002", 5.0, 0)  # ineligible

    company = client.post("/companies", headers=auth_headers, json={"name": "Drive Test Co"}).json()

    drive_resp = client.post(
        "/drives", headers=auth_headers,
        json={"company_id": company["id"], "role": "SDE-1", "ctc_lpa": 8.0, "min_cgpa": 7.0, "max_backlogs": 0, "status": "ACTIVE"},
    )
    assert drive_resp.status_code == 201
    drive = drive_resp.json()
    assert drive["company_name"] == "Drive Test Co"

    eligible = client.get(f"/drives/{drive['id']}/eligible-students", headers=auth_headers)
    assert eligible.status_code == 200
    assert eligible.json()["count"] == 1


def test_drive_list_shows_applicant_count(client, auth_headers, tenant, db):
    student = _student_with_academics(db, tenant, "AC001", 9.0, 0)
    company = client.post("/companies", headers=auth_headers, json={"name": "Applicant Count Co"}).json()
    drive = client.post(
        "/drives", headers=auth_headers,
        json={"company_id": company["id"], "role": "Analyst", "min_cgpa": 0, "max_backlogs": 99, "status": "ACTIVE"},
    ).json()

    client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)})

    listing = client.get("/drives", headers=auth_headers).json()
    match = next(d for d in listing["items"] if d["id"] == drive["id"])
    assert match["applicant_count"] == 1
