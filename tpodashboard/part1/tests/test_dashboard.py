from app.models.company import Company
from app.models.drive import Drive, DriveStatus
from app.models.student import PlacementStatus, Student, StudentStatus
from app.models.readiness import ReadinessSnapshot


def test_dashboard_empty_institution_returns_honest_zeros(client, auth_headers):
    resp = client.get("/dashboard/student-overview", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_students"] == 0
    assert body["data_health_score"] == 100  # nothing wrong with zero records
    assert body["students_with_readiness"] == 0


def test_dashboard_counts_match_real_rows(client, auth_headers, tenant, db):
    statuses = [
        PlacementStatus.SEEKING, PlacementStatus.SEEKING, PlacementStatus.PLACED,
        PlacementStatus.HIGHER_STUDIES, PlacementStatus.NOT_SEEKING, PlacementStatus.OPTED_OUT,
    ]
    for i, st in enumerate(statuses):
        db.add(Student(
            institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
            department_id=tenant["department"].id, program_id=tenant["program"].id,
            register_number=f"2026DASH{i:02d}", full_name=f"Dash Student {i}",
            status=StudentStatus.ACTIVE, placement_status=st, source="manual",
        ))
    db.commit()

    resp = client.get("/dashboard/student-overview", headers=auth_headers)
    body = resp.json()
    assert body["total_students"] == 6
    assert body["seeking"] == 2
    assert body["placed"] == 1
    assert body["higher_studies"] == 1
    assert body["not_seeking"] == 1
    assert body["opted_out"] == 1


def test_dashboard_placement_metrics_are_real_not_fabricated(client, auth_headers, tenant, db):
    """
    Doc section 16 (Part 1): don't fabricate drive/offer/placement %
    metrics. Part 2 changes *why* this matters, not the rule: these
    fields are now populated from real Company/Drive/Application/Offer
    rows. This test proves the numbers are actually computed, not
    hardcoded, by checking they respond to real data changes.
    """
    resp_empty = client.get("/dashboard/student-overview", headers=auth_headers)
    assert resp_empty.json()["active_drives"] == 0
    assert resp_empty.json()["companies_engaged"] == 0
    assert resp_empty.json()["placement_percentage"] is None  # no seeking/placed pool yet -> honestly null, not 0

    company = Company(institution_id=tenant["institution"].id, name="Dash Test Co")
    db.add(company)
    db.flush()
    db.add(Drive(
        institution_id=tenant["institution"].id, company_id=company.id, role="SDE",
        status=DriveStatus.ACTIVE, min_cgpa=0, max_backlogs=99,
    ))
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026DASHPLC01", full_name="Placement Metric Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    resp = client.get("/dashboard/student-overview", headers=auth_headers)
    body = resp.json()
    assert body["active_drives"] == 1
    assert body["companies_engaged"] == 1
    assert body["placement_percentage"] == 0.0  # one seeking student, zero placed -> real 0%, computed not omitted


def test_readiness_shows_no_assessment_yet_when_empty(client, auth_headers, tenant, db):
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026RDY001", full_name="No Assessment Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    resp = client.get("/dashboard/readiness-overview", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["cohort_average"] is None  # honestly null, not a fabricated number
    assert body["students_assessed"] == 0


def test_readiness_reflects_real_snapshot_once_one_exists(client, auth_headers, tenant, db):
    student = Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026RDY002", full_name="Assessed Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student)
    db.flush()
    db.add(ReadinessSnapshot(
        institution_id=tenant["institution"].id, student_id=student.id,
        overall_score=74, source="test-harness",
    ))
    db.commit()

    resp = client.get("/dashboard/readiness-overview", headers=auth_headers)
    body = resp.json()
    assert body["students_assessed"] == 1
    assert body["cohort_average"] == 74.0


def test_data_quality_flags_missing_fields(client, auth_headers, tenant, db):
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026DQ001", full_name="Sparse Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    resp = client.get("/data-quality/students", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_students"] == 1
    issue_types = {i["issue_type"] for i in body["issues"]}
    assert "missing_email" in issue_types
    assert "missing_phone" in issue_types
    assert "missing_cgpa" in issue_types
    assert body["data_health_score"] < 100
