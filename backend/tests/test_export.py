import io
import json
import zipfile


def test_export_strips_password_hash(client):
    email = "export-test@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "secret123"})
    resp = client.get("/api/data/export")
    assert resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(resp.content)) as archive:
        payload = json.loads(archive.read("data.json").decode("utf-8"))
    assert "users" in payload
    assert "password_hash" not in payload["users"][0]


def test_unauthenticated_export_rejected(client):
    client.cookies.clear()
    assert client.get("/api/data/export").status_code == 401
