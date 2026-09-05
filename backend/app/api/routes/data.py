from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import User, Resume, Job, Application, ApplicationStatus, JobAnalysis, JobNote, Company, CompanyNote, AIUsage, Contact, ContactNote, ContactNoteTag, ContactCompany, ContactJob, ContactContact, JobJob, ActivityLog
from app.core.activity import log_activity
from app.core.config import settings
from app.core.auth import get_current_user, get_current_admin
from pathlib import Path
from datetime import datetime
import enum as enum_module
import io
import json
import shutil
import uuid
import zipfile

router = APIRouter()

MAX_IMPORT_FILE_MB = 200
MAX_IMPORT_TOTAL_MB = 1024  # zip-bomb cap: total uncompressed size

REQUIRED_FIELDS = {
    "companies": ["id", "name"],
    "company_notes": ["id", "company_id", "note"],
    "contacts": ["id", "name"],
    "contact_companies": ["contact_id", "company_id"],
    "contact_jobs": ["contact_id", "job_id"],
    "contact_contacts": ["contact_id", "related_contact_id"],
    "resumes": ["id", "filename", "file_path"],
    "jobs": ["id", "title", "company"],
    "job_jobs": ["job_id", "related_job_id"],
    "applications": ["id", "job_id", "status"],
    "analyses": ["id", "job_id", "resume_id"],
    "notes": ["id", "job_id", "note"],
    "contact_notes": ["id", "contact_id", "note"],
    "contact_note_tags": ["id", "note_id", "entity_type", "entity_id"],
}


def serialize_model(obj):
    serialized = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, enum_module.Enum):
            value = value.value
        if column.name == "file_path" and isinstance(obj, Resume):
            if value:
                try:
                    value = str(Path(value).relative_to(Path(settings.UPLOAD_DIR)))
                except Exception:
                    value = Path(value).name
        serialized[column.name] = value
    return serialized


def parse_timestamp(value):
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    return value


def sanitize_row(row):
    return {key: parse_timestamp(value) for key, value in row.items()}


def filter_columns(model, row):
    """Keep only keys that exist as columns on the model (blocks injected fields)."""
    column_names = {col.name for col in model.__table__.columns}
    return {key: value for key, value in row.items() if key in column_names}


def normalize_application_status(value):
    if isinstance(value, ApplicationStatus):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        for status in ApplicationStatus:
            if cleaned == status.value or cleaned.upper() == status.name:
                return status
    raise HTTPException(status_code=400, detail=f"Invalid application status: {value!r}")


def replace_directory_with_backup(target: Path, staging: Path):
    """Move staging into target and return a backup path for rollback."""
    backup = None
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        backup = target.with_name(f"{target.name}.backup-{uuid.uuid4().hex}")
        target.rename(backup)
    try:
        staging.rename(target)
    except Exception:
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
        if backup and backup.exists():
            backup.rename(target)
        raise
    return backup


def restore_directory_backup(target: Path, backup: Path | None):
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    if backup and backup.exists():
        backup.rename(target)


def cleanup_directory(path: Path | None):
    if path and path.exists():
        shutil.rmtree(path, ignore_errors=True)


def validate_payload(payload):
    """Validate the imported payload before any data is touched."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="data.json must contain an object")
    for key, fields in REQUIRED_FIELDS.items():
        rows = payload.get(key, [])
        if not isinstance(rows, list):
            raise HTTPException(status_code=400, detail=f"Field {key!r} must be a list")
        for row in rows:
            if not isinstance(row, dict):
                raise HTTPException(status_code=400, detail=f"Field {key!r} contains a non-object row")
            missing = [field for field in fields if row.get(field) is None]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Row in {key!r} is missing required fields: {', '.join(missing)}",
                )
            if key == "applications":
                normalize_application_status(row.get("status"))


@router.get("/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Export the current user's data and uploaded files as a zip bundle."""
    jobs = db.query(Job).filter(Job.user_id == user.id).all()
    job_ids = [job.id for job in jobs]
    companies = db.query(Company).filter(Company.user_id == user.id).all()
    company_ids = [company.id for company in companies]
    company_notes = (
        db.query(CompanyNote).filter(CompanyNote.company_id.in_(company_ids)).all() if company_ids else []
    )
    contacts = db.query(Contact).filter(Contact.user_id == user.id).all()
    contact_ids = [contact.id for contact in contacts]
    resumes = db.query(Resume).filter(Resume.user_id == user.id).all()
    applications = db.query(Application).filter(Application.user_id == user.id).all()
    analyses = db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).all() if job_ids else []
    notes = db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).all() if job_ids else []
    contact_notes = db.query(ContactNote).filter(ContactNote.contact_id.in_(contact_ids)).all() if contact_ids else []
    contact_note_ids = [n.id for n in contact_notes]
    contact_note_tags = (
        db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_(contact_note_ids)).all() if contact_note_ids else []
    )
    contact_companies = (
        db.query(ContactCompany).filter(ContactCompany.contact_id.in_(contact_ids)).all() if contact_ids else []
    )
    contact_jobs = (
        db.query(ContactJob).filter(ContactJob.contact_id.in_(contact_ids)).all() if contact_ids else []
    )
    contact_contacts = (
        db.query(ContactContact).filter(ContactContact.contact_id.in_(contact_ids)).all() if contact_ids else []
    )
    job_jobs = (
        db.query(JobJob).filter(JobJob.job_id.in_(job_ids)).all() if job_ids else []
    )

    payload = {
        "users": [
            {key: value for key, value in serialize_model(user).items() if key != "password_hash"}
        ],
        "companies": [serialize_model(company) for company in companies],
        "company_notes": [serialize_model(note) for note in company_notes],
        "contacts": [serialize_model(contact) for contact in contacts],
        "contact_companies": [serialize_model(r) for r in contact_companies],
        "contact_jobs": [serialize_model(r) for r in contact_jobs],
        "contact_contacts": [serialize_model(r) for r in contact_contacts],
        "resumes": [serialize_model(resume) for resume in resumes],
        "jobs": [serialize_model(job) for job in jobs],
        "job_jobs": [serialize_model(r) for r in job_jobs],
        "applications": [serialize_model(app) for app in applications],
        "analyses": [serialize_model(analysis) for analysis in analyses],
        "notes": [serialize_model(note) for note in notes],
        "contact_notes": [serialize_model(note) for note in contact_notes],
        "contact_note_tags": [serialize_model(tag) for tag in contact_note_tags],
    }

    buffer = io.BytesIO()
    user_upload_dir = Path(settings.UPLOAD_DIR) / user.id
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", json.dumps(payload, indent=2))

        if user_upload_dir.exists():
            for file_path in user_upload_dir.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, arcname=str(Path("uploads") / user.id / file_path.relative_to(user_upload_dir)))

    buffer.seek(0)
    username = (user.email or "").split("@")[0] or "user"
    filename = f"{username}-{datetime.now().strftime('%Y%m%d%H%M%S')}-job-tracker-export.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import")
async def import_data(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Import data and uploads from a zip bundle (current user only)."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload a .zip archive")

    # 1. Limit the upload size (read limit+1 bytes to detect overflow)
    limit_bytes = MAX_IMPORT_FILE_MB * 1024 * 1024
    content = await file.read(limit_bytes + 1)
    if len(content) > limit_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_IMPORT_FILE_MB}MB)")

    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip archive")

    # 2. Zip-bomb protection: cap total uncompressed size
    total_uncompressed = sum(info.file_size for info in archive.infolist())
    if total_uncompressed > MAX_IMPORT_TOTAL_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"Archive expands beyond {MAX_IMPORT_TOTAL_MB}MB — refusing to import",
        )

    if "data.json" not in archive.namelist():
        raise HTTPException(status_code=400, detail="Archive must contain data.json")

    try:
        payload = json.loads(archive.read("data.json").decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse data.json")

    # 3. Validate the entire payload before deleting anything
    validate_payload(payload)

    upload_root = Path(settings.UPLOAD_DIR)
    user_upload_dir = upload_root / user.id
    staging_upload_dir = upload_root / f".{user.id}.import-{uuid.uuid4().hex}"
    backup_upload_dir = None
    upload_swapped = False

    # 4. Extract uploaded files into staging with a zip-slip guard.
    try:
        upload_root.mkdir(parents=True, exist_ok=True)
        staging_upload_dir.mkdir(parents=True, exist_ok=True)
        for info in archive.infolist():
            if info.is_dir() or not info.filename.startswith("uploads/"):
                continue
            basename = Path(info.filename).name
            target_path = (staging_upload_dir / basename).resolve()
            if not target_path.is_relative_to(staging_upload_dir.resolve()):
                raise HTTPException(status_code=400, detail="Archive contains paths outside the upload directory")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, open(target_path, "wb") as sink:
                sink.write(source.read())
    except HTTPException:
        cleanup_directory(staging_upload_dir)
        raise
    except Exception:
        cleanup_directory(staging_upload_dir)
        raise HTTPException(status_code=400, detail="Could not extract archive contents")

    # 5. Replace the current user's data in a single transaction
    try:
        contact_ids = [contact_id for (contact_id,) in db.query(Contact.id).filter(Contact.user_id == user.id).all()]
        if contact_ids:
            db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_(db.query(ContactNote.id).filter(ContactNote.contact_id.in_(contact_ids)))).delete(synchronize_session=False)
            db.query(ContactNote).filter(ContactNote.contact_id.in_(contact_ids)).delete()
            db.query(ContactCompany).filter(ContactCompany.contact_id.in_(contact_ids)).delete()
            db.query(ContactJob).filter(ContactJob.contact_id.in_(contact_ids)).delete()
            db.query(ContactContact).filter(ContactContact.contact_id.in_(contact_ids)).delete()
            db.query(ContactContact).filter(ContactContact.related_contact_id.in_(contact_ids)).delete()
        db.query(Contact).filter(Contact.user_id == user.id).delete()
        job_ids = [job_id for (job_id,) in db.query(Job.id).filter(Job.user_id == user.id).all()]
        if job_ids:
            db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).delete()
            db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).delete()
            db.query(JobJob).filter(JobJob.job_id.in_(job_ids)).delete()
            db.query(JobJob).filter(JobJob.related_job_id.in_(job_ids)).delete()
        db.query(Application).filter(Application.user_id == user.id).delete()
        db.query(Resume).filter(Resume.user_id == user.id).delete()
        db.query(Job).filter(Job.user_id == user.id).delete()
        # Delete company notes before companies (FK constraint)
        company_ids = [company_id for (company_id,) in db.query(Company.id).filter(Company.user_id == user.id).all()]
        if company_ids:
            db.query(CompanyNote).filter(CompanyNote.company_id.in_(company_ids)).delete(synchronize_session=False)
        db.query(Company).filter(Company.user_id == user.id).delete()
        db.query(ActivityLog).filter(ActivityLog.user_id == user.id).delete()
        db.flush()

        # Companies first so jobs can be linked by name. Every imported row gets
        # a fresh id so a backup can be restored into any account without
        # colliding with primary keys already owned by other users.
        companies_by_name = {}
        company_id_map = {}
        for row in payload.get("companies", []):
            sanitized = sanitize_row(row)
            if not sanitized.get("name"):
                continue
            new_id = str(uuid.uuid4())
            company_id_map[sanitized.get("id")] = new_id
            company = Company(**{**filter_columns(Company, sanitized), "id": new_id, "user_id": user.id})
            db.add(company)
            companies_by_name[sanitized["name"].strip().lower()] = company
        db.flush()

        for row in payload.get("company_notes", []):
            sanitized = sanitize_row(row)
            data = filter_columns(CompanyNote, sanitized)
            data["id"] = str(uuid.uuid4())
            data["company_id"] = company_id_map.get(data.get("company_id"))
            db.add(CompanyNote(**data))

        job_id_map = {}
        for row in payload.get("jobs", []):
            job_row = {**filter_columns(Job, sanitize_row(row)), "user_id": user.id}
            new_id = str(uuid.uuid4())
            job_id_map[job_row.get("id")] = new_id
            job_row["id"] = new_id
            job_row.pop("company_id", None)
            company_name = (job_row.get("company") or "").strip().lower()
            if company_name in companies_by_name:
                job_row["company_id"] = companies_by_name[company_name].id
            db.add(Job(**job_row))

        resume_id_map = {}
        for row in payload.get("resumes", []):
            sanitized = sanitize_row(row)
            if sanitized.get("file_path"):
                sanitized["file_path"] = str(user_upload_dir / Path(sanitized["file_path"]).name)
            new_id = str(uuid.uuid4())
            resume_id_map[sanitized.get("id")] = new_id
            db.add(Resume(**{**filter_columns(Resume, sanitized), "id": new_id, "user_id": user.id}))

        contact_id_map = {}
        for row in payload.get("contacts", []):
            sanitized = sanitize_row(row)
            new_id = str(uuid.uuid4())
            contact_id_map[sanitized.get("id")] = new_id
            db.add(Contact(**{**filter_columns(Contact, sanitized), "id": new_id, "user_id": user.id}))
        db.flush()

        for row in payload.get("contact_companies", []):
            data = filter_columns(ContactCompany, sanitize_row(row))
            data["contact_id"] = contact_id_map.get(data.get("contact_id"))
            data["company_id"] = company_id_map.get(data.get("company_id"))
            db.add(ContactCompany(**data))
        for row in payload.get("contact_jobs", []):
            data = filter_columns(ContactJob, sanitize_row(row))
            data["contact_id"] = contact_id_map.get(data.get("contact_id"))
            data["job_id"] = job_id_map.get(data.get("job_id"))
            db.add(ContactJob(**data))
        for row in payload.get("contact_contacts", []):
            data = filter_columns(ContactContact, sanitize_row(row))
            data["contact_id"] = contact_id_map.get(data.get("contact_id"))
            data["related_contact_id"] = contact_id_map.get(data.get("related_contact_id"))
            db.add(ContactContact(**data))
        db.flush()

        contact_note_id_map = {}
        for row in payload.get("contact_notes", []):
            sanitized = sanitize_row(row)
            new_id = str(uuid.uuid4())
            contact_note_id_map[sanitized.get("id")] = new_id
            data = filter_columns(ContactNote, sanitized)
            data["id"] = new_id
            data["contact_id"] = contact_id_map.get(data.get("contact_id"))
            db.add(ContactNote(**data))
        for row in payload.get("contact_note_tags", []):
            data = filter_columns(ContactNoteTag, sanitize_row(row))
            data["id"] = str(uuid.uuid4())
            data["note_id"] = contact_note_id_map.get(data.get("note_id"))
            entity_type = data.get("entity_type")
            entity_id = data.get("entity_id")
            if entity_type == "job":
                data["entity_id"] = job_id_map.get(entity_id)
            elif entity_type == "company":
                data["entity_id"] = company_id_map.get(entity_id)
            elif entity_type == "contact":
                data["entity_id"] = contact_id_map.get(entity_id)
            db.add(ContactNoteTag(**data))
        for row in payload.get("analyses", []):
            data = filter_columns(JobAnalysis, sanitize_row(row))
            data["id"] = str(uuid.uuid4())
            data["job_id"] = job_id_map.get(data.get("job_id"))
            data["resume_id"] = resume_id_map.get(data.get("resume_id"))
            db.add(JobAnalysis(**data))

        for row in payload.get("notes", []):
            data = filter_columns(JobNote, sanitize_row(row))
            data["id"] = str(uuid.uuid4())
            data["job_id"] = job_id_map.get(data.get("job_id"))
            db.add(JobNote(**data))

        for row in payload.get("applications", []):
            data = {**filter_columns(Application, sanitize_row(row)), "user_id": user.id}
            data["id"] = str(uuid.uuid4())
            data["job_id"] = job_id_map.get(data.get("job_id"))
            data["status"] = normalize_application_status(data.get("status"))
            db.add(Application(**data))

        for row in payload.get("job_jobs", []):
            data = filter_columns(JobJob, sanitize_row(row))
            data["job_id"] = job_id_map.get(data.get("job_id"))
            data["related_job_id"] = job_id_map.get(data.get("related_job_id"))
            db.add(JobJob(**data))

        log_activity(db, user.id, "created", "data", entity_name="Imported backup")
        db.flush()
        backup_upload_dir = replace_directory_with_backup(user_upload_dir, staging_upload_dir)
        upload_swapped = True
        db.commit()
    except Exception as exc:
        db.rollback()
        if upload_swapped:
            restore_directory_backup(user_upload_dir, backup_upload_dir)
        cleanup_directory(staging_upload_dir)
        print("Data import failed, changes rolled back:", exc)
        raise HTTPException(status_code=500, detail="Import failed — no changes were applied")
    cleanup_directory(backup_upload_dir)
    return {"message": "Import complete"}

@router.get("/system-backup")
def system_backup(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Admin-only: full system backup of ALL users' data and uploaded files."""
    users = db.query(User).order_by(User.created_at).all()
    user_ids = [u.id for u in users]
    jobs = db.query(Job).filter(Job.user_id.in_(user_ids)).all() if user_ids else []
    job_ids = [j.id for j in jobs]
    companies = db.query(Company).filter(Company.user_id.in_(user_ids)).all() if user_ids else []
    company_ids = [c.id for c in companies]
    contacts = db.query(Contact).filter(Contact.user_id.in_(user_ids)).all() if user_ids else []
    contact_ids = [c.id for c in contacts]
    contact_note_ids_of = [
        n.id
        for n in db.query(ContactNote.id).filter(ContactNote.contact_id.in_(contact_ids)).all()
    ] if contact_ids else []
    payload = {
        "users": [serialize_model(u) for u in users],
        "companies": [serialize_model(c) for c in companies],
        "company_notes": [
            serialize_model(n)
            for n in db.query(CompanyNote).filter(CompanyNote.company_id.in_(company_ids)).all()
        ] if company_ids else [],
        "contacts": [serialize_model(c) for c in contacts],
        "contact_companies": [
            serialize_model(r)
            for r in db.query(ContactCompany).filter(ContactCompany.contact_id.in_(contact_ids)).all()
        ] if contact_ids else [],
        "contact_jobs": [
            serialize_model(r)
            for r in db.query(ContactJob).filter(ContactJob.contact_id.in_(contact_ids)).all()
        ] if contact_ids else [],
        "contact_contacts": [
            serialize_model(r)
            for r in db.query(ContactContact).filter(ContactContact.contact_id.in_(contact_ids)).all()
        ] if contact_ids else [],
        "resumes": [serialize_model(r) for r in db.query(Resume).filter(Resume.user_id.in_(user_ids)).all()] if user_ids else [],
        "jobs": [serialize_model(j) for j in jobs],
        "applications": [serialize_model(a) for a in db.query(Application).filter(Application.user_id.in_(user_ids)).all()] if user_ids else [],
        "analyses": [serialize_model(a) for a in db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).all()] if job_ids else [],
        "notes": [serialize_model(n) for n in db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).all()] if job_ids else [],
        "contact_notes": [serialize_model(n) for n in db.query(ContactNote).filter(ContactNote.contact_id.in_(contact_ids)).all()] if contact_ids else [],
        "contact_note_tags": [
            serialize_model(r)
            for r in db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_(contact_note_ids_of)).all()
        ] if contact_note_ids_of else [],
        "job_jobs": [serialize_model(r) for r in db.query(JobJob).filter(JobJob.job_id.in_(job_ids)).all()] if job_ids else [],
        "ai_usage": [serialize_model(r) for r in db.query(AIUsage).filter(AIUsage.user_id.in_(user_ids)).all()] if user_ids else [],
    }

    buffer = io.BytesIO()
    upload_root = Path(settings.UPLOAD_DIR)
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", json.dumps(payload, indent=2))
        if upload_root.exists():
            for file_path in upload_root.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, arcname=str(Path("uploads") / file_path.relative_to(upload_root)))

    buffer.seek(0)
    filename = f"system-backup-{datetime.now().strftime('%Y%m%d%H%M%S')}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/system-restore")
async def system_restore(file: UploadFile = File(...), admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Admin-only: restore a full system backup, replacing ALL users' data."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload a .zip archive")

    limit_bytes = MAX_IMPORT_FILE_MB * 1024 * 1024
    content = await file.read(limit_bytes + 1)
    if len(content) > limit_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_IMPORT_FILE_MB}MB)")

    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip archive")

    total_uncompressed = sum(info.file_size for info in archive.infolist())
    if total_uncompressed > MAX_IMPORT_TOTAL_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Archive expands beyond {MAX_IMPORT_TOTAL_MB}MB — refusing to restore")

    if "data.json" not in archive.namelist():
        raise HTTPException(status_code=400, detail="Archive must contain data.json")

    try:
        payload = json.loads(archive.read("data.json").decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse data.json")

    validate_payload(payload)
    users_payload = payload.get("users")
    if not isinstance(users_payload, list) or len(users_payload) == 0:
        raise HTTPException(status_code=400, detail="Backup contains no user accounts — refusing to restore")
    for row in users_payload:
        if not isinstance(row, dict) or not row.get("id") or not row.get("email") or not row.get("password_hash"):
            raise HTTPException(status_code=400, detail="Backup users are missing required fields")

    upload_root = Path(settings.UPLOAD_DIR)
    staging = Path(str(upload_root) + ".restore-tmp")
    backup_upload_root = None
    uploads_swapped = False

    # 1. Extract uploaded files into a staging dir (full tree, zip-slip guard)
    try:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        for info in archive.infolist():
            if info.is_dir() or not info.filename.startswith("uploads/"):
                continue
            rel = Path(info.filename).relative_to("uploads")
            target = (staging / rel).resolve()
            if not target.is_relative_to(staging.resolve()):
                raise HTTPException(status_code=400, detail="Archive contains paths outside the upload directory")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, open(target, "wb") as sink:
                sink.write(source.read())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not extract archive contents")

    # 2. Replace ALL data in a single transaction
    try:
        db.query(ContactNoteTag).delete()
        db.query(ContactNote).delete()
        db.query(ContactCompany).delete()
        db.query(ContactJob).delete()
        db.query(ContactContact).delete()
        db.query(Contact).delete()
        db.query(AIUsage).delete()
        db.query(JobAnalysis).delete()
        db.query(JobNote).delete()
        db.query(JobJob).delete()
        db.query(Application).delete()
        db.query(Resume).delete()
        db.query(Job).delete()
        db.query(CompanyNote).delete()
        db.query(Company).delete()
        db.query(ActivityLog).delete()
        db.query(User).delete()
        db.flush()

        for row in users_payload:
            db.add(User(**filter_columns(User, sanitize_row(row))))
        db.flush()

        companies_by_id = {}
        for row in payload.get("companies", []):
            sanitized = sanitize_row(row)
            if not sanitized.get("id") or not sanitized.get("name"):
                continue
            company = Company(**filter_columns(Company, sanitized))
            db.add(company)
            companies_by_id[company.id] = company
        db.flush()

        for row in payload.get("company_notes", []):
            db.add(CompanyNote(**filter_columns(CompanyNote, sanitize_row(row))))

        for row in payload.get("jobs", []):
            job_row = filter_columns(Job, sanitize_row(row))
            if job_row.get("company_id") and job_row["company_id"] not in companies_by_id:
                job_row["company_id"] = None
            db.add(Job(**job_row))
        db.flush()

        for row in payload.get("resumes", []):
            sanitized = sanitize_row(row)
            if sanitized.get("file_path"):
                rel_parts = [p for p in Path(sanitized["file_path"]).parts if p not in ("..", ".", "")]
                if rel_parts and (upload_root / Path(*rel_parts)).resolve().is_relative_to(upload_root.resolve()):
                    sanitized["file_path"] = str(upload_root / Path(*rel_parts))
                else:
                    sanitized["file_path"] = None
            db.add(Resume(**filter_columns(Resume, sanitized)))
        db.flush()

        for row in payload.get("contacts", []):
            db.add(Contact(**filter_columns(Contact, sanitize_row(row))))
        db.flush()

        for row in payload.get("contact_companies", []):
            db.add(ContactCompany(**filter_columns(ContactCompany, sanitize_row(row))))
        for row in payload.get("contact_jobs", []):
            db.add(ContactJob(**filter_columns(ContactJob, sanitize_row(row))))
        for row in payload.get("contact_contacts", []):
            db.add(ContactContact(**filter_columns(ContactContact, sanitize_row(row))))
        for row in payload.get("job_jobs", []):
            db.add(JobJob(**filter_columns(JobJob, sanitize_row(row))))
        db.flush()

        for row in payload.get("contact_notes", []):
            db.add(ContactNote(**filter_columns(ContactNote, sanitize_row(row))))
        for row in payload.get("contact_note_tags", []):
            db.add(ContactNoteTag(**filter_columns(ContactNoteTag, sanitize_row(row))))
        for row in payload.get("analyses", []):
            db.add(JobAnalysis(**filter_columns(JobAnalysis, sanitize_row(row))))
        for row in payload.get("notes", []):
            db.add(JobNote(**filter_columns(JobNote, sanitize_row(row))))
        for row in payload.get("applications", []):
            data = filter_columns(Application, sanitize_row(row))
            data["status"] = normalize_application_status(data.get("status"))
            db.add(Application(**data))
        for row in payload.get("ai_usage", []):
            db.add(AIUsage(**filter_columns(AIUsage, sanitize_row(row))))

        db.flush()
        backup_upload_root = replace_directory_with_backup(upload_root, staging)
        uploads_swapped = True
        db.commit()
    except Exception as exc:
        db.rollback()
        if uploads_swapped:
            restore_directory_backup(upload_root, backup_upload_root)
        cleanup_directory(staging)
        print("System restore failed, changes rolled back:", exc)
        raise HTTPException(status_code=500, detail="Restore failed — no changes were applied")
    cleanup_directory(backup_upload_root)

    return {"message": "System restore complete"}


@router.delete("/clear")
def clear_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete ALL of the current user's data and uploaded resume files."""
    contact_ids = [contact_id for (contact_id,) in db.query(Contact.id).filter(Contact.user_id == user.id).all()]
    if contact_ids:
        contact_note_ids_clear = [
            nid
            for (nid,) in db.query(ContactNote.id).filter(ContactNote.contact_id.in_(contact_ids)).all()
        ]
        if contact_note_ids_clear:
            db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_(contact_note_ids_clear)).delete(
                synchronize_session=False
            )
        db.query(ContactNote).filter(ContactNote.contact_id.in_(contact_ids)).delete()
        db.query(ContactCompany).filter(ContactCompany.contact_id.in_(contact_ids)).delete()
        db.query(ContactJob).filter(ContactJob.contact_id.in_(contact_ids)).delete()
        db.query(ContactContact).filter(
            or_(ContactContact.contact_id.in_(contact_ids), ContactContact.related_contact_id.in_(contact_ids))
        ).delete(synchronize_session=False)
    db.query(Contact).filter(Contact.user_id == user.id).delete()
    job_ids = [job_id for (job_id,) in db.query(Job.id).filter(Job.user_id == user.id).all()]
    if job_ids:
        db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).delete()
        db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).delete()
        db.query(JobJob).filter(JobJob.job_id.in_(job_ids)).delete()
        db.query(JobJob).filter(JobJob.related_job_id.in_(job_ids)).delete()
    db.query(Application).filter(Application.user_id == user.id).delete()
    db.query(Resume).filter(Resume.user_id == user.id).delete()
    if job_ids:
        db.query(Job).filter(Job.id.in_(job_ids)).delete()
    db.query(ActivityLog).filter(ActivityLog.user_id == user.id).delete()
    log_activity(db, user.id, "deleted", "data", entity_name="All data")
    db.commit()

    # Remove uploaded resume files for this user
    user_upload_dir = Path(settings.UPLOAD_DIR) / user.id
    if user_upload_dir.exists():
        shutil.rmtree(user_upload_dir, ignore_errors=True)

    # Remove company records for this user (notes first due to FK constraint)
    company_ids_clear = [company_id for (company_id,) in db.query(Company.id).filter(Company.user_id == user.id).all()]
    if company_ids_clear:
        db.query(CompanyNote).filter(CompanyNote.company_id.in_(company_ids_clear)).delete(synchronize_session=False)
    db.query(Company).filter(Company.user_id == user.id).delete()
    db.commit()

    return {"message": "All data cleared"}
