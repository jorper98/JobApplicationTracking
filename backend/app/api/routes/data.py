from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import User, Resume, Job, Application, JobAnalysis, JobNote
from app.core.config import settings
from app.core.auth import get_current_user
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
        "users": [serialize_model(user)],
        "resumes": [serialize_model(resume) for resume in resumes],
        "jobs": [serialize_model(job) for job in jobs],
        "applications": [serialize_model(app) for app in applications],
        "analyses": [serialize_model(analysis) for analysis in analyses],
        "notes": [serialize_model(note) for note in notes],
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", json.dumps(payload, indent=2))

        upload_root = Path(settings.UPLOAD_DIR)
        if upload_root.exists():
            for file_path in upload_root.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, arcname=str(Path("uploads") / file_path.relative_to(upload_root)))

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=job-tracker-export.zip"},
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
        for info in archive.infolist():
            if info.is_dir() or not info.filename.startswith("uploads/"):
                continue
            basename = Path(info.filename).name
            target_path = (user_upload_dir / basename).resolve()
            if not target_path.is_relative_to(user_upload_dir.resolve()):
                raise HTTPException(status_code=400, detail="Archive contains paths outside the upload directory")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, open(target_path, "wb") as sink:
                sink.write(source.read())
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
        db.flush()

        for row in payload.get("jobs", []):
            db.add(Job(**{**filter_columns(Job, sanitize_row(row)), "user_id": user.id}))

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

    return {"message": "All data cleared"}
