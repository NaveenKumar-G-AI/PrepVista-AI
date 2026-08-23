from app.models.student import PlacementStatus, Student, StudentStatus


def _make_student(db, tenant, reg_no="FUNNEL001"):
    student = Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number=reg_no, full_name="Funnel Test Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_drive(client, auth_headers, company_name="Funnel Co"):
    company = client.post("/companies", headers=auth_headers, json={"name": company_name}).json()
    drive = client.post(
        "/drives", headers=auth_headers,
        json={"company_id": company["id"], "role": "SDE", "ctc_lpa": 10.0, "min_cgpa": 0, "max_backlogs": 99, "status": "ACTIVE"},
    ).json()
    return company, drive


def test_full_funnel_apply_through_joining_updates_student_placement_status(client, auth_headers, tenant, db):
    student = _make_student(db, tenant)
    company, drive = _make_drive(client, auth_headers)

    app_resp = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)})
    assert app_resp.status_code == 201
    application = app_resp.json()
    assert application["stage"] == "APPLIED"

    r = client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": "SHORTLISTED"})
    assert r.status_code == 200 and r.json()["stage"] == "SHORTLISTED"

    r = client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": "INTERVIEWING"})
    assert r.status_code == 200

    r = client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": "SELECTED"})
    assert r.status_code == 200

    offers = client.get("/offers", headers=auth_headers).json()
    assert offers["total"] == 1
    offer = offers["items"][0]
    assert offer["student_id"] == str(student.id)
    assert offer["status"] == "EXTENDED"
    assert offer["ctc_lpa"] == 10.0

    db.refresh(student)
    assert student.placement_status == PlacementStatus.SEEKING

    r = client.patch(f"/offers/{offer['id']}", headers=auth_headers, json={"status": "ACCEPTED"})
    assert r.status_code == 200
    assert r.json()["status"] == "ACCEPTED"

    db.refresh(student)
    assert student.placement_status == PlacementStatus.SEEKING

    r = client.patch(f"/offers/{offer['id']}", headers=auth_headers, json={"joining_confirmed": True})
    assert r.status_code == 200
    assert r.json()["status"] == "JOINED"
    assert r.json()["joining_confirmed"] is True

    db.refresh(student)
    assert student.placement_status == PlacementStatus.PLACED

    dash = client.get("/dashboard/student-overview", headers=auth_headers).json()
    assert dash["placed"] == 1
    assert dash["placement_percentage"] == 100.0


def test_cannot_apply_twice_to_same_drive(client, auth_headers, tenant, db):
    student = _make_student(db, tenant, "DUPAPP001")
    company, drive = _make_drive(client, auth_headers, "Dup Apply Co")

    first = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)})
    assert first.status_code == 201
    second = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)})
    assert second.status_code == 409


def test_invalid_stage_transition_rejected(client, auth_headers, tenant, db):
    student = _make_student(db, tenant, "BADTRANS001")
    company, drive = _make_drive(client, auth_headers, "Bad Transition Co")
    application = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)}).json()

    resp = client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": "SELECTED"})
    assert resp.status_code == 409


def test_rejected_application_does_not_create_offer(client, auth_headers, tenant, db):
    student = _make_student(db, tenant, "REJ001")
    company, drive = _make_drive(client, auth_headers, "Rejection Co")
    application = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)}).json()

    client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": "REJECTED"})

    offers = client.get("/offers", headers=auth_headers).json()
    assert offers["total"] == 0

    db.refresh(student)
    assert student.placement_status == PlacementStatus.SEEKING


def test_drive_funnel_view_counts_cumulative_stages(client, auth_headers, tenant, db):
    s1 = _make_student(db, tenant, "FV001")
    s2 = _make_student(db, tenant, "FV002")
    s3 = _make_student(db, tenant, "FV003")
    company, drive = _make_drive(client, auth_headers, "Funnel View Co")

    a1 = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(s1.id)}).json()
    client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(s2.id)})
    client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(s3.id)})

    client.patch(f"/applications/{a1['id']}/stage", headers=auth_headers, json={"stage": "SHORTLISTED"})
    client.patch(f"/applications/{a1['id']}/stage", headers=auth_headers, json={"stage": "INTERVIEWING"})

    funnel = client.get(f"/drives/{drive['id']}/funnel", headers=auth_headers).json()
    stage_map = {s["stage"]: s["count"] for s in funnel["stages"]}
    assert stage_map["APPLIED"] == 3
    assert stage_map["SHORTLISTED"] == 1
    assert stage_map["INTERVIEWING"] == 1


def test_expiring_offers_endpoint(client, auth_headers, tenant, db):
    import datetime as dt

    student = _make_student(db, tenant, "EXP001")
    company, drive = _make_drive(client, auth_headers, "Expiry Co")
    application = client.post("/applications", headers=auth_headers, json={"drive_id": drive["id"], "student_id": str(student.id)}).json()
    for stage in ("SHORTLISTED", "INTERVIEWING", "SELECTED"):
        client.patch(f"/applications/{application['id']}/stage", headers=auth_headers, json={"stage": stage})

    offer = client.get("/offers", headers=auth_headers).json()["items"][0]
    from app.models.offer import Offer

    offer_row = db.get(Offer, offer["id"])
    offer_row.expiry_date = dt.date.today() + dt.timedelta(hours=12)
    db.commit()

    resp = client.get("/offers/expiring?within_hours=48", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
