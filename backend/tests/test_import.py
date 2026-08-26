import io
import json
import zipfile

from app.db.database import SessionLocal
from app.models.models import Company, User


def _make_export_zip():
    payload = {
        "users": [],
        "companies": [{"id": "company-x", "name": "X Corp"}],
        "company_notes": [],
        "contacts": [],
        "contact_companies": [],
        "contact_jobs": [],
        "contact_contacts": [],
        "resumes": [],
        "jobs": [{"id": "job-x", "title": "Engineer", "company": "X Corp"}],
        "applications": [{"id": "app-x", "job_id": "job-x", "status": "saved"}],
        "analyses": [],
        "notes": [],
        "contact_notes": [],
        "contact_note_tags": [],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", json.dumps(payload))
    buffer.seek(0)
    return buffer.getvalue()


def _import(client, zip_bytes):
    return client.post(
        "/api/data/import",
        files={"file": ("backup.zip", zip_bytes, "application/zip")},
    )


def test_import_does_not_collide_across_users(client):
    zip_bytes = _make_export_zip()

    client.post("/api/auth/register", json={"email": "import-a@example.com", "password": "secret123"})
    assert _import(client, zip_bytes).status_code == 200

    client.post("/api/auth/register", json={"email": "import-b@example.com", "password": "secret123"})
    resp = _import(client, zip_bytes)
    assert resp.status_code == 200, resp.text

    db = SessionLocal()
    try:
        user_a = db.query(User).filter(User.email == "import-a@example.com").first()
        user_b = db.query(User).filter(User.email == "import-b@example.com").first()
        assert db.query(Company).filter(Company.user_id == user_a.id).count() == 1
        assert db.query(Company).filter(Company.user_id == user_b.id).count() == 1
    finally:
        db.close()


def test_reimport_into_same_user_replaces_data(client):
    zip_bytes = _make_export_zip()

    client.post("/api/auth/register", json={"email": "import-re@example.com", "password": "secret123"})
    assert _import(client, zip_bytes).status_code == 200
    assert _import(client, zip_bytes).status_code == 200

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "import-re@example.com").first()
        assert db.query(Company).filter(Company.user_id == user.id).count() == 1
    finally:
        db.close()
