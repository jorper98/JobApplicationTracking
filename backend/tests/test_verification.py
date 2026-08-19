from app.core.auth import create_access_token, create_email_verification_token
from app.db.database import SessionLocal
from app.models.models import User


def test_register_requires_verification_when_smtp_configured(client, monkeypatch):
    sent = {}

    def fake_send(to, token):
        sent["to"] = to
        sent["token"] = token

    monkeypatch.setattr("app.api.routes.auth.smtp_configured", lambda: True)
    monkeypatch.setattr("app.api.routes.auth.send_verification_email", fake_send)

    email = "verify-flow@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["requires_verification"] is True
    assert "access_token" not in body
    assert sent["to"] == email

    # Login blocked until verified
    login = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 403

    # Verify with the captured token
    verify = client.get("/api/auth/verify-email", params={"token": sent["token"]})
    assert verify.status_code == 200
    assert verify.json()["message"].startswith("Email verified")

    # Login now works
    login = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 200
    assert "token" in login.cookies


def test_register_auto_verifies_without_smtp(client):
    email = "auto-verify@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    me = client.get("/api/auth/me")
    assert me.status_code == 200


def test_verify_email_invalid_token(client):
    resp = client.get("/api/auth/verify-email", params={"token": "not-a-real-token"})
    assert resp.status_code == 400


def test_verify_email_rejects_access_token(client):
    db = SessionLocal()
    try:
        user = db.query(User).first()
    finally:
        db.close()
    token = create_access_token(user)
    resp = client.get("/api/auth/verify-email", params={"token": token})
    assert resp.status_code == 400


def test_verify_email_already_verified(client):
    email = "already-verified@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
    finally:
        db.close()
    token = create_email_verification_token(user.id)
    resp = client.get("/api/auth/verify-email", params={"token": token})
    assert resp.status_code == 200
    assert "already verified" in resp.json()["message"]


def test_resend_verification_generic_for_unknown_email(client):
    resp = client.post("/api/auth/resend-verification", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert "verification link has been sent" in resp.json()["message"]


def test_verification_token_cannot_open_session(client, monkeypatch):
    sent = {}

    def fake_send(to, token):
        sent["token"] = token

    monkeypatch.setattr("app.api.routes.auth.smtp_configured", lambda: True)
    monkeypatch.setattr("app.api.routes.auth.send_verification_email", fake_send)

    email = "token-bypass@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 201

    # The emailed verification token must NOT authenticate as a session token.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {sent['token']}"})
    assert me.status_code == 401
    # The cookie route is equally rejected.
    client.cookies.set("token", sent["token"])
    assert client.get("/api/auth/me").status_code == 401


def test_unverified_user_cannot_open_session_even_with_access_token(client, monkeypatch):
    def fake_send(to, token):
        pass

    monkeypatch.setattr("app.api.routes.auth.smtp_configured", lambda: True)
    monkeypatch.setattr("app.api.routes.auth.send_verification_email", fake_send)

    email = "unverified-access@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
    finally:
        db.close()
    access_token = create_access_token(user)
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 403
    assert "verify your email" in me.json()["detail"].lower()


def test_register_rolls_back_when_verification_email_fails(client, monkeypatch):
    def failing_send(to, token):
        raise RuntimeError("SMTP down")

    monkeypatch.setattr("app.api.routes.auth.smtp_configured", lambda: True)
    monkeypatch.setattr("app.api.routes.auth.send_verification_email", failing_send)

    email = "stranded@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    assert resp.status_code == 502

    # No half-created account: login fails and the user is not in the DB.
    login = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 401

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == email).first() is None
    finally:
        db.close()
