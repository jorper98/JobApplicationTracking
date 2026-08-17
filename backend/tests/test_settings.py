from app.db.database import SessionLocal
from app.models.models import AppSetting, User


def _promote_user(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.is_admin = True
        db.commit()
    finally:
        db.close()


def test_ai_settings_admin_only(client):
    client.post("/api/auth/register", json={"email": "settings-nonadmin@example.com", "password": "secret123"})
    assert client.get("/api/users/settings/ai").status_code == 403
    assert client.put("/api/users/settings/ai", json={"gemini_model": "x"}).status_code == 403


def test_ai_settings_roundtrip(client):
    email = "settings-admin@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    _promote_user(email)

    model = "gemini-custom-test"
    resp = client.put("/api/users/settings/ai", json={"gemini_model": model, "gemini_api_key": "override-key"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["gemini_model"] == model
    assert body["gemini_api_key_set"] is True

    resp = client.get("/api/users/settings/ai")
    assert resp.status_code == 200
    assert resp.json()["gemini_model"] == model
    assert resp.json()["gemini_api_key_set"] is True

    resp = client.put("/api/users/settings/ai", json={"gemini_api_key": ""})
    assert resp.status_code == 200
    assert resp.json()["gemini_api_key_set"] is False

    db = SessionLocal()
    try:
        db.query(AppSetting).delete()
        db.commit()
    finally:
        db.close()
