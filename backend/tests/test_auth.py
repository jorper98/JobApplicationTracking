def test_register_sets_session_cookie(client):
    email = "reg-test@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == email
    assert "token" in resp.cookies


def test_register_duplicate_is_generic(client):
    email = "dup-test@example.com"
    payload = {"email": email, "password": "secret123"}
    assert client.post("/api/auth/register", json=payload).status_code == 200
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400
    assert "already exists" not in resp.json()["detail"].lower()


def test_login_me_logout_flow(client):
    email = "flow-test@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    client.cookies.clear()
    resp = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert resp.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_login_wrong_password(client):
    email = "wrongpw-test@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    resp = client.post("/api/auth/login", json={"email": email, "password": "badpass1"})
    assert resp.status_code == 401


def test_account_lockout_after_5_failures(client):
    email = "lockout-test@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    for _ in range(5):
        resp = client.post("/api/auth/login", json={"email": email, "password": "badpass1"})
        assert resp.status_code == 401
    resp = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert resp.status_code == 429


def test_register_does_not_grant_admin(client):
    email = "notadmin-test@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["is_admin"] is False
