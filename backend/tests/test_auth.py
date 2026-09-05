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


def test_register_and_login_normalize_email_case(client):
    resp = client.post("/api/auth/register", json={"email": "  MixedCase@example.com ", "password": "secret123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "mixedcase@example.com"

    duplicate = client.post("/api/auth/register", json={"email": "MIXEDCASE@example.com", "password": "secret123"})
    assert duplicate.status_code == 400

    client.cookies.clear()
    login = client.post("/api/auth/login", json={"email": "MixedCase@Example.com", "password": "secret123"})
    assert login.status_code == 200


def test_admin_can_reset_user_password(client):
    from app.db.database import SessionLocal
    from app.models.models import User

    admin_email = "admin-reset@example.com"
    user_email = "target-reset@example.com"
    client.post("/api/auth/register", json={"email": admin_email, "password": "secret123"})
    client.post("/api/auth/register", json={"email": user_email, "password": "secret123"})

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == admin_email).first()
        target = db.query(User).filter(User.email == user_email).first()
        admin.is_admin = True
        db.commit()
        target_id = target.id
    finally:
        db.close()

    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": admin_email, "password": "secret123"}).status_code == 200
    reset = client.post(f"/api/users/{target_id}/reset-password", json={"password": "newpass123"})
    assert reset.status_code == 200

    client.cookies.clear()
    login = client.post("/api/auth/login", json={"email": user_email, "password": "newpass123"})
    assert login.status_code == 200
