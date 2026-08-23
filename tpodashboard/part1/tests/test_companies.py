def test_create_company(client, auth_headers):
    resp = client.post("/companies", headers=auth_headers, json={"name": "Acme Robotics", "industry": "Manufacturing", "city": "Pune"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Acme Robotics"
    assert body["pipeline_stage"] == "PROSPECT"


def test_create_duplicate_company_name_rejected(client, auth_headers):
    client.post("/companies", headers=auth_headers, json={"name": "Duplicate Co"})
    resp = client.post("/companies", headers=auth_headers, json={"name": "Duplicate Co"})
    assert resp.status_code == 409


def test_update_company_pipeline_stage(client, auth_headers):
    create = client.post("/companies", headers=auth_headers, json={"name": "Pipeline Co"})
    company_id = create.json()["id"]
    resp = client.patch(f"/companies/{company_id}", headers=auth_headers, json={"pipeline_stage": "HIRING"})
    assert resp.status_code == 200
    assert resp.json()["pipeline_stage"] == "HIRING"


def test_add_company_contact(client, auth_headers):
    create = client.post("/companies", headers=auth_headers, json={"name": "Contact Co"})
    company_id = create.json()["id"]
    resp = client.post(
        f"/companies/{company_id}/contacts", headers=auth_headers,
        json={"name": "Priya Sharma", "role_title": "Talent Acquisition", "email": "priya@contactco.com"},
    )
    assert resp.status_code == 201
    detail = client.get(f"/companies/{company_id}", headers=auth_headers).json()
    assert len(detail["contacts"]) == 1
    assert detail["contacts"][0]["name"] == "Priya Sharma"


def test_list_companies_search_and_filter(client, auth_headers):
    client.post("/companies", headers=auth_headers, json={"name": "Searchable Systems", "industry": "IT"})
    client.post("/companies", headers=auth_headers, json={"name": "Other Corp", "industry": "Finance"})

    resp = client.get("/companies?search=Searchable", headers=auth_headers)
    assert resp.json()["total"] == 1

    resp2 = client.get("/companies", headers=auth_headers)
    assert resp2.json()["total"] == 2


def test_get_nonexistent_company_404(client, auth_headers):
    resp = client.get("/companies/00000000-0000-0000-0000-000000000000", headers=auth_headers)
    assert resp.status_code == 404
