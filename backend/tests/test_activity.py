def _register_and_login(client, email="activity@example.com"):
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    client.cookies.clear()
    resp = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert resp.status_code == 200


def test_activity_log_records_job_creation_and_tracker_move(client):
    _register_and_login(client)

    job = client.post("/api/jobs/", json={"title": "DevOps Engineer", "company": "Acme"}).json()
    # The job is auto-tracked as "saved"; asking for "saved" returns it (no 409)
    app = client.post("/api/applications/", json={"job_id": job["id"], "status": "saved"}).json()
    assert app["id"]

    log = client.get("/api/activity/").json()
    assert any(
        e["action"] == "created" and e["entity_type"] == "job" and e["entity_name"] == "DevOps Engineer"
        for e in log
    )

    client.patch(f"/api/applications/{app['id']}", json={"status": "applied"})
    client.patch(f"/api/applications/{app['id']}", json={"status": "interview"})

    log = client.get("/api/activity/").json()
    moves = [e for e in log if e["entity_type"] == "application" and e["details"]]
    assert any(e["details"] == "saved -> applied" for e in moves)
    assert any(e["details"] == "applied -> interview" for e in moves)


def test_activity_log_records_delete(client):
    _register_and_login(client, "activity-del@example.com")

    company = client.post("/api/companies/", json={"name": "Gone Co"}).json()
    client.delete(f"/api/companies/{company['id']}")

    log = client.get("/api/activity/").json()
    assert any(
        e["action"] == "deleted" and e["entity_type"] == "company" and e["entity_name"] == "Gone Co"
        for e in log
    )


def test_activity_is_scoped_to_current_user(client):
    _register_and_login(client, "activity-a@example.com")
    client.post("/api/jobs/", json={"title": "User A Job", "company": "Acme"}).json()

    _register_and_login(client, "activity-b@example.com")
    log = client.get("/api/activity/").json()
    assert all(e["entity_name"] != "User A Job" for e in log)
