from app.models.student import PlacementStatus, Student, StudentStatus


def _student_payload(tenant, reg_no="2026CSE100", **overrides):
    payload = {
        "register_number": reg_no,
        "full_name": "Test Student",
        "batch_id": str(tenant["batch"].id),
        "department_id": str(tenant["department"].id),
        "program_id": str(tenant["program"].id),
    }
    payload.update(overrides)
    return payload


def test_create_student_minimal_fields(client, auth_headers, tenant):
    resp = client.post("/students", headers=auth_headers, json=_student_payload(tenant))
    assert resp.status_code == 201
    body = resp.json()
    assert body["register_number"] == "2026CSE100"
    assert body["status"] == "ACTIVE"
    assert body["placement_status"] == "SEEKING"


def test_create_student_duplicate_register_number_rejected(client, auth_headers, tenant):
    first = client.post("/students", headers=auth_headers, json=_student_payload(tenant, reg_no="2026CSE200"))
    assert first.status_code == 201
    second = client.post("/students", headers=auth_headers, json=_student_payload(tenant, reg_no="2026CSE200"))
    assert second.status_code == 409
    assert second.json()["error_code"] == "CONFLICT"


def test_create_student_missing_required_field_rejected(client, auth_headers, tenant):
    payload = _student_payload(tenant)
    del payload["register_number"]
    resp = client.post("/students", headers=auth_headers, json=payload)
    assert resp.status_code == 422


def test_profile_completion_increases_with_more_fields(client, auth_headers, tenant):
    sparse = client.post("/students", headers=auth_headers, json=_student_payload(tenant, reg_no="2026CSE301"))
    rich = client.post(
        "/students", headers=auth_headers,
        json=_student_payload(
            tenant, reg_no="2026CSE302", roll_number="R302",
            institutional_email="rich@test.edu", personal_email="rich.personal@gmail.com",
            phone="9876543210", gender="MALE",
        ),
    )
    assert rich.json()["profile_completion_pct"] > sparse.json()["profile_completion_pct"]


def test_list_students_pagination(client, auth_headers, tenant, db):
    for i in range(30):
        db.add(Student(
            institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
            department_id=tenant["department"].id, program_id=tenant["program"].id,
            register_number=f"2026PAG{i:03d}", full_name=f"Pagination Student {i}",
            status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
        ))
    db.commit()

    page1 = client.get("/students?page=1&page_size=10", headers=auth_headers)
    assert page1.status_code == 200
    body1 = page1.json()
    assert body1["total"] == 30
    assert len(body1["items"]) == 10
    assert body1["total_pages"] == 3

    page2 = client.get("/students?page=2&page_size=10", headers=auth_headers)
    body2 = page2.json()
    ids_p1 = {i["id"] for i in body1["items"]}
    ids_p2 = {i["id"] for i in body2["items"]}
    assert ids_p1.isdisjoint(ids_p2)  # no overlap between pages


def test_list_students_search_by_name(client, auth_headers, tenant, db):
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026SRCH01", full_name="Zendaya Search Target",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026SRCH02", full_name="Someone Else",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    resp = client.get("/students?search=Zendaya", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == "Zendaya Search Target"


def test_list_students_filter_by_placement_status(client, auth_headers, tenant, db):
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026FLT01", full_name="Placed Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.PLACED, source="manual",
    ))
    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026FLT02", full_name="Seeking Student",
        status=StudentStatus.ACTIVE, placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    resp = client.get("/students?placement_status=PLACED", headers=auth_headers)
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == "Placed Student"


def test_get_nonexistent_student_returns_404(client, auth_headers):
    resp = client.get("/students/00000000-0000-0000-0000-000000000000", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "NOT_FOUND"


def test_update_student_partial_fields_only(client, auth_headers, tenant):
    create = client.post("/students", headers=auth_headers, json=_student_payload(tenant, reg_no="2026UPD01"))
    student_id = create.json()["id"]

    resp = client.patch(f"/students/{student_id}", headers=auth_headers, json={"phone": "9999999999"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "9999999999"
    assert body["full_name"] == "Test Student"  # untouched
