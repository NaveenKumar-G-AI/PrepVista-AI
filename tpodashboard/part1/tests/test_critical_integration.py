"""
Doc section 25, "Critical integration test", implemented literally:
create institution -> season -> batch -> student -> retrieve student ->
update student -> dashboard reflects change -> logout -> login ->
record still exists.
"""


def test_full_critical_path(client, db, tenant, tpo_user, auth_headers):
    dept = tenant["department"]
    program = tenant["program"]
    batch = tenant["batch"]
    season = tenant["season"]

    # --- create a student (institution/season/batch already exist via fixtures) ---
    create_resp = client.post(
        "/students",
        headers=auth_headers,
        json={
            "register_number": "2026CSE999",
            "full_name": "Integration Test Student",
            "institutional_email": "integration.test@test.edu",
            "batch_id": str(batch.id),
            "department_id": str(dept.id),
            "program_id": str(program.id),
            "season_id": str(season.id),
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    student_id = create_resp.json()["id"]
    assert create_resp.json()["placement_status"] == "SEEKING"

    # --- retrieve student ---
    get_resp = client.get(f"/students/{student_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["full_name"] == "Integration Test Student"

    # --- update student ---
    update_resp = client.patch(
        f"/students/{student_id}",
        headers=auth_headers,
        json={"placement_status": "PLACED"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["placement_status"] == "PLACED"

    # --- dashboard reflects the change ---
    dash_resp = client.get("/dashboard/student-overview", headers=auth_headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()
    assert dash["total_students"] == 1
    assert dash["placed"] == 1
    assert dash["seeking"] == 0
    # Part 2: placement/drive/offer metrics are now real (Companies/Drives/
    # Applications/Offers exist), so they're present and correctly computed
    # -- not fabricated, not omitted.
    assert dash["placed"] == 1
    assert dash["placement_percentage"] == 100.0  # 1 placed / 1 in the (seeking+placed) pool
    assert dash["active_drives"] == 0  # none created in this test
    assert dash["total_offers"] == 0

    # --- logout (stateless JWT: this just confirms the endpoint responds) ---
    logout_resp = client.post("/auth/logout", headers=auth_headers)
    assert logout_resp.status_code == 200

    # --- login again ---
    login_resp = client.post(
        "/auth/login",
        json={"email": tpo_user.email, "password": "TestPass123!"},
    )
    assert login_resp.status_code == 200
    new_token = login_resp.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    # --- record still exists, with the update intact ---
    final_get = client.get(f"/students/{student_id}", headers=new_headers)
    assert final_get.status_code == 200
    assert final_get.json()["placement_status"] == "PLACED"
    assert final_get.json()["full_name"] == "Integration Test Student"
