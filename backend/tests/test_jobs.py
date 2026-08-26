def _register_and_login(client):
    client.post("/api/auth/register", json={"email": "jobs-test@example.com", "password": "secret123"})
    client.cookies.clear()
    resp = client.post("/api/auth/login", json={"email": "jobs-test@example.com", "password": "secret123"})
    assert resp.status_code == 200


def test_create_job_adds_saved_application_atomically(client):
    _register_and_login(client)
    resp = client.post("/api/jobs/", json={"title": "Backend Engineer", "company": "Acme"})
    assert resp.status_code == 200
    job = resp.json()
    assert job["title"] == "Backend Engineer"

    board = client.get("/api/applications/kanban").json()
    saved = [c for c in board["saved"] if c["job_id"] == job["id"]]
    assert len(saved) == 1, "new job must appear exactly once in the tracker (saved)"


def test_create_application_is_idempotent(client):
    _register_and_login(client)
    job = client.post("/api/jobs/", json={"title": "Frontend Engineer", "company": "Acme"}).json()

    first = client.post("/api/applications/", json={"job_id": job["id"], "status": "saved"})
    second = client.post("/api/applications/", json={"job_id": job["id"], "status": "saved"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    board = client.get("/api/applications/kanban").json()
    saved = [c for c in board["saved"] if c["job_id"] == job["id"]]
    assert len(saved) == 1, "duplicate create must not produce duplicate tracker entries"


def test_job_relationships_include_company(client):
    _register_and_login(client)
    job = client.post("/api/jobs/", json={"title": "Backend Engineer", "company": "Acme"}).json()
    assert job["company_id"]

    resp = client.get(f"/api/jobs/{job['id']}/relationships")
    assert resp.status_code == 200
    rels = resp.json()
    assert rels["company"] == {"id": job["company_id"], "name": "Acme"}
    assert isinstance(rels["contacts"], list)
    assert isinstance(rels["notes"], list)
