"""
Doc section 25, "Import test": upload XLSX -> preview -> validation
errors -> commit -> database rows -> Student UI shows records (we
verify via the list API, which is what the UI would call).
"""
import io

import openpyxl
from sqlalchemy import select

from app.models.student import Student


def _make_xlsx(rows: list[dict], headers: list[str]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _upload(client, auth_headers, filename, content):
    return client.post(
        "/students/import/preview",
        headers=auth_headers,
        files={"file": (filename, content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


def test_preview_suggests_correct_column_mapping(client, auth_headers):
    headers = ["Reg No", "Student Name", "College Email", "Mobile Number", "CGPA"]
    rows = [{"Reg No": "2026CSE001", "Student Name": "Aarav Sharma", "College Email": "aarav@test.edu",
             "Mobile Number": "9876543210", "CGPA": "8.5"}]
    content = _make_xlsx(rows, headers)

    resp = _upload(client, auth_headers, "students.xlsx", content)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_rows"] == 1
    mapping = {s["source_column"]: s["mapped_field"] for s in body["suggested_mapping"]}
    assert mapping["Reg No"] == "register_number"
    assert mapping["Student Name"] == "full_name"
    assert mapping["Mobile Number"] == "phone"
    assert mapping["CGPA"] == "cumulative_cgpa"
    assert body["unmapped_required_fields"] == []


def test_preview_rejects_empty_file(client, auth_headers):
    resp = client.post(
        "/students/import/preview", headers=auth_headers,
        files={"file": ("empty.xlsx", b"", "application/octet-stream")},
    )
    assert resp.status_code == 422


def test_preview_rejects_unsupported_extension(client, auth_headers):
    resp = client.post(
        "/students/import/preview", headers=auth_headers,
        files={"file": ("students.pdf", b"not a real pdf but bytes", "application/pdf")},
    )
    assert resp.status_code == 422


def test_full_import_happy_path(client, auth_headers, tenant, db):
    headers = ["Reg No", "Student Name", "College Email", "Mobile Number", "CGPA", "Backlogs"]
    rows = [
        {"Reg No": "2026IMP001", "Student Name": "Priya Kumar", "College Email": "priya@test.edu",
         "Mobile Number": "9111111111", "CGPA": "8.9", "Backlogs": "0"},
        {"Reg No": "2026IMP002", "Student Name": "Rahul Verma", "College Email": "rahul@test.edu",
         "Mobile Number": "9222222222", "CGPA": "7.4", "Backlogs": "1"},
        {"Reg No": "2026IMP003", "Student Name": "Sneha Rao", "College Email": "sneha@test.edu",
         "Mobile Number": "9333333333", "CGPA": "9.1", "Backlogs": "0"},
    ]
    content = _make_xlsx(rows, headers)

    preview = _upload(client, auth_headers, "batch.xlsx", content)
    assert preview.status_code == 200
    batch_id = preview.json()["import_batch_id"]
    mapping = {s["source_column"]: s["mapped_field"] for s in preview.json()["suggested_mapping"]}

    validate_resp = client.post(
        "/students/import/validate", headers=auth_headers,
        json={
            "import_batch_id": batch_id, "column_mapping": mapping,
            "batch_id": str(tenant["batch"].id), "department_id": str(tenant["department"].id),
            "program_id": str(tenant["program"].id),
        },
    )
    assert validate_resp.status_code == 200, validate_resp.text
    v = validate_resp.json()
    assert v["total_rows"] == 3
    assert v["valid_rows"] == 3
    assert v["invalid_rows"] == 0
    assert v["duplicate_rows"] == 0
    assert v["ready_to_commit"] is True

    commit_resp = client.post("/students/import/commit", headers=auth_headers, json={"import_batch_id": batch_id})
    assert commit_resp.status_code == 200, commit_resp.text
    c = commit_resp.json()
    assert c["imported_count"] == 3
    assert c["updated_count"] == 0
    assert c["attention_count"] == 0

    # Never silently lose records: verify they are actually queryable via the list API (what the UI calls).
    list_resp = client.get("/students?search=2026IMP", headers=auth_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 3

    db_rows = db.execute(select(Student).where(Student.register_number.like("2026IMP%"))).scalars().all()
    assert len(db_rows) == 3
    assert all(r.source == "import" for r in db_rows)
    assert all(r.profile_completion_pct > 0 for r in db_rows)


def test_import_detects_invalid_rows(client, auth_headers, tenant):
    headers = ["Reg No", "Student Name", "College Email", "CGPA"]
    rows = [
        {"Reg No": "", "Student Name": "Missing Reg Number", "College Email": "x@test.edu", "CGPA": "8"},
        {"Reg No": "2026BAD002", "Student Name": "Bad Email", "College Email": "not-an-email", "CGPA": "8"},
        {"Reg No": "2026BAD003", "Student Name": "Bad CGPA", "College Email": "ok@test.edu", "CGPA": "99"},
        {"Reg No": "2026BAD004", "Student Name": "Totally Fine", "College Email": "fine@test.edu", "CGPA": "8"},
    ]
    content = _make_xlsx(rows, headers)

    preview = _upload(client, auth_headers, "bad.xlsx", content)
    batch_id = preview.json()["import_batch_id"]
    mapping = {s["source_column"]: s["mapped_field"] for s in preview.json()["suggested_mapping"]}

    validate_resp = client.post(
        "/students/import/validate", headers=auth_headers,
        json={
            "import_batch_id": batch_id, "column_mapping": mapping,
            "batch_id": str(tenant["batch"].id), "department_id": str(tenant["department"].id),
            "program_id": str(tenant["program"].id),
        },
    )
    v = validate_resp.json()
    assert v["valid_rows"] == 1
    assert v["invalid_rows"] == 3
    issue_fields = {i["field"] for i in v["issues"]}
    assert "register_number" in issue_fields
    assert "institutional_email" in issue_fields
    assert "cumulative_cgpa" in issue_fields


def test_import_detects_within_file_duplicate_register_number(client, auth_headers, tenant):
    headers = ["Reg No", "Student Name"]
    rows = [
        {"Reg No": "2026DUP001", "Student Name": "First Copy"},
        {"Reg No": "2026DUP001", "Student Name": "Second Copy Same Reg No"},
    ]
    content = _make_xlsx(rows, headers)

    preview = _upload(client, auth_headers, "dupe.xlsx", content)
    batch_id = preview.json()["import_batch_id"]
    mapping = {s["source_column"]: s["mapped_field"] for s in preview.json()["suggested_mapping"]}

    v = client.post(
        "/students/import/validate", headers=auth_headers,
        json={
            "import_batch_id": batch_id, "column_mapping": mapping,
            "batch_id": str(tenant["batch"].id), "department_id": str(tenant["department"].id),
            "program_id": str(tenant["program"].id),
        },
    ).json()
    assert v["valid_rows"] == 1
    assert v["duplicate_rows"] == 1

    commit = client.post("/students/import/commit", headers=auth_headers, json={"import_batch_id": batch_id}).json()
    assert commit["imported_count"] == 1
    assert commit["ignored_count"] == 1


def test_import_updates_existing_student_by_register_number(client, auth_headers, tenant, db):
    # first import: create the student
    headers = ["Reg No", "Student Name", "Mobile Number"]
    first_rows = [{"Reg No": "2026UPD100", "Student Name": "Original Name", "Mobile Number": "9000000000"}]
    preview1 = _upload(client, auth_headers, "first.xlsx", _make_xlsx(first_rows, headers))
    batch1 = preview1.json()["import_batch_id"]
    mapping1 = {s["source_column"]: s["mapped_field"] for s in preview1.json()["suggested_mapping"]}
    client.post(
        "/students/import/validate", headers=auth_headers,
        json={"import_batch_id": batch1, "column_mapping": mapping1, "batch_id": str(tenant["batch"].id),
              "department_id": str(tenant["department"].id), "program_id": str(tenant["program"].id)},
    )
    commit1 = client.post("/students/import/commit", headers=auth_headers, json={"import_batch_id": batch1}).json()
    assert commit1["imported_count"] == 1

    # second import: same register number, different phone -> should UPDATE, not duplicate-reject
    second_rows = [{"Reg No": "2026UPD100", "Student Name": "Original Name", "Mobile Number": "9111111199"}]
    preview2 = _upload(client, auth_headers, "second.xlsx", _make_xlsx(second_rows, headers))
    batch2 = preview2.json()["import_batch_id"]
    mapping2 = {s["source_column"]: s["mapped_field"] for s in preview2.json()["suggested_mapping"]}
    v2 = client.post(
        "/students/import/validate", headers=auth_headers,
        json={"import_batch_id": batch2, "column_mapping": mapping2, "batch_id": str(tenant["batch"].id),
              "department_id": str(tenant["department"].id), "program_id": str(tenant["program"].id)},
    ).json()
    assert v2["valid_rows"] == 1
    assert v2["duplicate_rows"] == 0  # matching register_number is an UPDATE candidate, not a duplicate

    commit2 = client.post("/students/import/commit", headers=auth_headers, json={"import_batch_id": batch2}).json()
    assert commit2["imported_count"] == 0
    assert commit2["updated_count"] == 1

    student = db.execute(select(Student).where(Student.register_number == "2026UPD100")).scalar_one()
    assert student.phone == "9111111199"


def test_import_flags_possible_duplicate_by_email_for_review(client, auth_headers, tenant, db):
    from app.models.student import PlacementStatus, StudentStatus

    db.add(Student(
        institution_id=tenant["institution"].id, batch_id=tenant["batch"].id,
        department_id=tenant["department"].id, program_id=tenant["program"].id,
        register_number="2026EXIST01", full_name="Existing Student",
        institutional_email="shared@test.edu", status=StudentStatus.ACTIVE,
        placement_status=PlacementStatus.SEEKING, source="manual",
    ))
    db.commit()

    headers = ["Reg No", "Student Name", "College Email"]
    rows = [{"Reg No": "2026NEWREG01", "Student Name": "Possibly Same Person", "College Email": "shared@test.edu"}]
    preview = _upload(client, auth_headers, "possible_dupe.xlsx", _make_xlsx(rows, headers))
    batch_id = preview.json()["import_batch_id"]
    mapping = {s["source_column"]: s["mapped_field"] for s in preview.json()["suggested_mapping"]}

    v = client.post(
        "/students/import/validate", headers=auth_headers,
        json={"import_batch_id": batch_id, "column_mapping": mapping, "batch_id": str(tenant["batch"].id),
              "department_id": str(tenant["department"].id), "program_id": str(tenant["program"].id)},
    ).json()
    assert v["duplicate_rows"] == 1
    assert v["duplicates"][0]["match_type"] == "POSSIBLE_DUPLICATE"
    assert "institutional_email" in v["duplicates"][0]["matched_on"]

    # Never silently merge: committing must NOT overwrite the existing record.
    commit = client.post("/students/import/commit", headers=auth_headers, json={"import_batch_id": batch_id}).json()
    assert commit["imported_count"] == 0
    assert commit["attention_count"] == 1

    still_one = db.execute(select(Student).where(Student.institutional_email == "shared@test.edu")).scalars().all()
    assert len(still_one) == 1
    assert still_one[0].register_number == "2026EXIST01"  # untouched


def test_csv_import_also_works(client, auth_headers, tenant):
    csv_content = b"Reg No,Student Name,College Email\n2026CSV001,CSV Student,csv@test.edu\n"
    resp = client.post(
        "/students/import/preview", headers=auth_headers,
        files={"file": ("students.csv", csv_content, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["total_rows"] == 1
