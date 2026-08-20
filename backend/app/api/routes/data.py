from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import User, Resume, Job, Application, JobAnalysis, JobNote, Company, AIUsage
from app.core.config import settings
from app.core.auth import get_current_user, get_current_admin
from pathlib import Path
from datetime import datetime
import enum as enum_module
import io
import json
import shutil
import zipfile

router = APIRouter()

MAX_IMPORT_FILE_MB = 200
MAX_IMPORT_TOTAL_MB = 1024  # zip-bomb cap: total uncompressed size

REQUIRED_FIELDS = {
    "companies": ["id", "name"],
    "resumes": ["id", "filename", "file_path"],
    "jobs": ["id", "title", "company"],
    "applications": ["id", "job_id", "status"],
    "analyses": ["id", "job_id", "resume_id"],
    "notes": ["id", "job_id", "note"],
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


@router.get("/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Export the current user's data and uploaded files as a zip bundle."""
    jobs = db.query(Job).filter(Job.user_id == user.id).all()
    job_ids = [job.id for job in jobs]
    resumes = db.query(Resume).filter(Resume.user_id == user.id).all()
    applications = db.query(Application).filter(Application.user_id == user.id).all()
    analyses = db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).all() if job_ids else []
    notes = db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).all() if job_ids else []

    payload = {
        "users": [
            {key: value for key, value in serialize_model(user).items() if key != "password_hash"}
        ],
        "companies": [serialize_model(company) for company in db.query(Company).filter(Company.user_id == user.id).all()],
        "resumes": [serialize_model(resume) for resume in resumes],
        "jobs": [serialize_model(job) for job in jobs],
        "applications": [serialize_model(app) for app in applications],
        "analyses": [serialize_model(analysis) for analysis in analyses],
        "notes": [serialize_model(note) for note in notes],
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

    # 4. Extract uploaded files with a zip-slip guard (before the DB transaction)
    try:
        zip_basenames = set()
        for info in archive.infolist():
            if info.is_dir() or not info.filename.startswith("uploads/"):
                continue
            basename = Path(info.filename).name
            zip_basenames.add(basename)
            target_path = (user_upload_dir / basename).resolve()
            if not target_path.is_relative_to(user_upload_dir.resolve()):
                raise HTTPException(status_code=400, detail="Archive contains paths outside the upload directory")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, open(target_path, "wb") as sink:
                sink.write(source.read())

        # Remove orphaned files not in the zip
        if user_upload_dir.exists():
            for existing in user_upload_dir.iterdir():
                if existing.is_file() and existing.name not in zip_basenames:
                    existing.unlink()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not extract archive contents")

    # 5. Replace the current user's data in a single transaction
    try:
        job_ids = [job_id for (job_id,) in db.query(Job.id).filter(Job.user_id == user.id).all()]
        if job_ids:
            db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).delete()
            db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).delete()
        db.query(Application).filter(Application.user_id == user.id).delete()
        db.query(Resume).filter(Resume.user_id == user.id).delete()
        db.query(Job).filter(Job.user_id == user.id).delete()
        db.query(Company).filter(Company.user_id == user.id).delete()
        db.flush()

        # Companies first so jobs can be linked by name
        companies_by_name = {}
        for row in payload.get("companies", []):
            sanitized = sanitize_row(row)
            if not sanitized.get("name"):
                continue
            company = Company(**{**filter_columns(Company, sanitized), "user_id": user.id})
            db.add(company)
            companies_by_name[sanitized["name"].strip().lower()] = company
        db.flush()

        for row in payload.get("jobs", []):
            job_row = {**filter_columns(Job, sanitize_row(row)), "user_id": user.id}
            job_row.pop("company_id", None)
            company_name = (job_row.get("company") or "").strip().lower()
            if company_name in companies_by_name:
                job_row["company_id"] = companies_by_name[company_name].id
            db.add(Job(**job_row))

        for row in payload.get("resumes", []):
            sanitized = sanitize_row(row)
            if sanitized.get("file_path"):
                sanitized["file_path"] = str(user_upload_dir / Path(sanitized["file_path"]).name)
            db.add(Resume(**{**filter_columns(Resume, sanitized), "user_id": user.id}))

        for row in payload.get("analyses", []):
            db.add(JobAnalysis(**filter_columns(JobAnalysis, sanitize_row(row))))

        for row in payload.get("notes", []):
            db.add(JobNote(**filter_columns(JobNote, sanitize_row(row))))

        for row in payload.get("applications", []):
            db.add(Application(**{**filter_columns(Application, sanitize_row(row)), "user_id": user.id}))

        db.commit()
    except Exception as exc:
        db.rollback()
        print("Data import failed, changes rolled back:", exc)
        raise HTTPException(status_code=500, detail="Import failed — no changes were applied")

@router.get("/system-backup")
def system_backup(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Admin-only: full system backup of ALL users' data and uploaded files."""
    users = db.query(User).order_by(User.created_at).all()
    user_ids = [u.id for u in users]
    jobs = db.query(Job).filter(Job.user_id.in_(user_ids)).all() if user_ids else []
    job_ids = [j.id for j in jobs]
    payload = {
        "users": [serialize_model(u) for u in users],
        "companies": [serialize_model(c) for c in db.query(Company).filter(Company.user_id.in_(user_ids)).all()] if user_ids else [],
        "resumes": [serialize_model(r) for r in db.query(Resume).filter(Resume.user_id.in_(user_ids)).all()] if user_ids else [],
        "jobs": [serialize_model(j) for j in jobs],
        "applications": [serialize_model(a) for a in db.query(Application).filter(Application.user_id.in_(user_ids)).all()] if user_ids else [],
        "analyses": [serialize_model(a) for a in db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).all()] if job_ids else [],
        "notes": [serialize_model(n) for n in db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).all()] if job_ids else [],
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

    # 1. Extract uploaded files into a staging dir (full tree, zip-slip guard)
    try:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
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
        db.query(AIUsage).delete()
        db.query(JobAnalysis).delete()
        db.query(JobNote).delete()
        db.query(Application).delete()
        db.query(Resume).delete()
        db.query(Job).delete()
        db.query(Company).delete()
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

        for row in payload.get("analyses", []):
            db.add(JobAnalysis(**filter_columns(JobAnalysis, sanitize_row(row))))
        for row in payload.get("notes", []):
            db.add(JobNote(**filter_columns(JobNote, sanitize_row(row))))
        for row in payload.get("applications", []):
            db.add(Application(**filter_columns(Application, sanitize_row(row))))
        for row in payload.get("ai_usage", []):
            db.add(AIUsage(**filter_columns(AIUsage, sanitize_row(row))))

        db.commit()
    except Exception as exc:
        db.rollback()
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        print("System restore failed, changes rolled back:", exc)
        raise HTTPException(status_code=500, detail="Restore failed — no changes were applied")

    # 3. Swap uploads: replace the live folder with the extracted staging tree
    try:
        if upload_root.exists():
            shutil.rmtree(upload_root, ignore_errors=True)
        staging.rename(upload_root)
    except Exception as exc:
        print("System restore: uploads swap failed:", exc)
        raise HTTPException(status_code=500, detail="Restore failed during uploads swap — re-upload the backup")

    return {"message": "System restore complete"}

    return {"message": "Data import complete"}


@router.delete("/clear")
def clear_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete ALL of the current user's data and uploaded resume files."""
    job_ids = [job_id for (job_id,) in db.query(Job.id).filter(Job.user_id == user.id).all()]
    if job_ids:
        db.query(JobAnalysis).filter(JobAnalysis.job_id.in_(job_ids)).delete()
        db.query(JobNote).filter(JobNote.job_id.in_(job_ids)).delete()
    db.query(Application).filter(Application.user_id == user.id).delete()
    db.query(Resume).filter(Resume.user_id == user.id).delete()
    if job_ids:
        db.query(Job).filter(Job.id.in_(job_ids)).delete()
    db.commit()

    # Remove uploaded resume files for this user
    user_upload_dir = Path(settings.UPLOAD_DIR) / user.id
    if user_upload_dir.exists():
        shutil.rmtree(user_upload_dir, ignore_errors=True)

    # Remove company records for this user
    db.query(Company).filter(Company.user_id == user.id).delete()
    db.commit()

    return {"message": "All data cleared"}
