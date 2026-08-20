from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Job, JobNote, ApplicationStatus, User
from app.schemas.schemas import JobCreate, JobUpdate, JobResponse, JobNoteCreate, JobNoteUpdate, JobNoteResponse
from app.services.ai_service import extract_skills_from_job, fetch_job_from_url, extract_job_from_text
from app.api.routes.companies import get_or_create_company
from app.api.routes.applications import get_or_create_application
from app.core.auth import get_current_user
from app.core.rate_limit import ai_quota_limit
from typing import List

router = APIRouter()


def _get_owned_job(db: Session, user: User, job_id: str) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _extract_job_skills_in_background(job_id: str, description: str) -> None:
    """Run after the response is sent: AI-extract skills and update the job.

    The DB connection is only held for the quick lookups, never across the
    Gemini call, so a burst of saves cannot exhaust the connection pool.
    """
    from app.db.database import SessionLocal

    db = SessionLocal()
    try:
        exists = db.query(Job.id).filter(Job.id == job_id).first()
    finally:
        db.close()
    if not exists:
        return

    extracted = extract_skills_from_job(description)

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job.extracted_skills = extracted.get("skills", [])
        job.extracted_data = extracted
        db.commit()
    except Exception as exc:
        print(f"Background AI extraction failed for job {job_id}: {exc}")
    finally:
        db.close()


def _resolve_company_id(db: Session, user: User, company_id, company_name) -> str:
    """Validate an explicit company_id, or auto-create a company from the name."""
    from app.models.models import Company
    if company_id:
        company = db.query(Company).filter(Company.id == company_id, Company.user_id == user.id).first()
        if not company:
            raise HTTPException(status_code=400, detail="Company not found")
        return company_id
    if company_name:
        company = get_or_create_company(db, user.id, company_name)
        if company:
            return company.id
    return None


@router.post("/", response_model=JobResponse)
def create_job(
    job_data: JobCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a job entry and add it to the tracker.

    The job is saved immediately; AI skill extraction runs in the background
    so saving never blocks on the Gemini API. The tracker entry ("saved")
    is created in the same request, so the job and its application are
    always consistent.
    """
    job = Job(
        user_id=user.id,
        title=job_data.title,
        company=job_data.company,
        company_id=_resolve_company_id(db, user, job_data.company_id, job_data.company),
        description=job_data.description,
        url=job_data.url,
        location=job_data.location,
        salary_min=job_data.salary_min,
        salary_max=job_data.salary_max,
        extracted_skills=[],
        extracted_data={},
    )
    db.add(job)
    db.flush()
    # Track the new job in the SAME transaction: a failure here can never
    # leave a job committed without its tracker entry.
    get_or_create_application(db, job.id, user.id, ApplicationStatus.SAVED)
    db.commit()
    db.refresh(job)

    if job_data.description:
        background_tasks.add_task(_extract_job_skills_in_background, job.id, job_data.description)

    return job


@router.get("/", response_model=List[JobResponse])
def list_jobs(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's jobs, newest first, with pagination."""
    return (
        db.query(Job)
        .filter(Job.user_id == user.id)
        .order_by(Job.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific job."""
    return _get_owned_job(db, user, job_id)


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: str, job_data: JobUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing job."""
    job = _get_owned_job(db, user, job_id)

    update_data = job_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Ignore explicit nulls for required fields (avoids NOT NULL constraint errors)
        if value is None and field in ("title", "company"):
            continue
        if field == "company_id":
            if value is None:
                job.company_id = None
            else:
                job.company_id = _resolve_company_id(db, user, value, job.company)
            continue
        setattr(job, field, value)

    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a job and all linked notes, analyses, and applications."""
    job = _get_owned_job(db, user, job_id)

    db.delete(job)
    db.commit()
    return {"message": "Job deleted"}


@router.get("/{job_id}/notes", response_model=List[JobNoteResponse])
def list_job_notes(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_job(db, user, job_id)
    return db.query(JobNote).filter(JobNote.job_id == job_id).order_by(JobNote.created_at.desc()).all()


@router.post("/{job_id}/notes", response_model=JobNoteResponse)
def create_job_note(job_id: str, note_data: JobNoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_job(db, user, job_id)

    job_note = JobNote(job_id=job_id, note=note_data.note)
    db.add(job_note)
    db.commit()
    db.refresh(job_note)
    return job_note


@router.patch("/{job_id}/notes/{note_id}", response_model=JobNoteResponse)
def update_job_note(job_id: str, note_id: str, note_data: JobNoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_job(db, user, job_id)
    note = db.query(JobNote).filter(JobNote.id == note_id, JobNote.job_id == job_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.note = note_data.note
    if note_data.created_at is not None:
        note.created_at = note_data.created_at
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{job_id}/notes/{note_id}")
def delete_job_note(job_id: str, note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_job(db, user, job_id)
    note = db.query(JobNote).filter(JobNote.id == note_id, JobNote.job_id == job_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}


@router.post("/from-url", response_model=JobResponse)
def create_job_from_url(
    payload: dict,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Scrape a job posting URL, extract details with AI, and save it."""
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # 1. Scrape the page text
    try:
        page_text = fetch_job_from_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # 2. AI extracts structured job data
    try:
        extracted = extract_job_from_text(page_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}")

    # 3. Save the job
    extracted_company = extracted.get("company") or "Unknown"
    job = Job(
        user_id=user.id,
        title=extracted.get("title") or "Untitled Role",
        company=extracted_company,
        company_id=_resolve_company_id(db, user, None, extracted_company),
        description=extracted.get("description"),
        location=extracted.get("location"),
        url=url,
        extracted_skills=extracted.get("skills", []),
        extracted_data=extracted,
    )
    db.add(job)
    db.flush()
    get_or_create_application(db, job.id, user.id, ApplicationStatus.SAVED)
    db.commit()
    db.refresh(job)
    return job


@router.post("/from-url/preview")
def preview_job_from_url(
    payload: dict,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
):
    """Scrape a job posting URL and return extracted fields without saving."""
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        page_text = fetch_job_from_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        extracted = extract_job_from_text(page_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}")

    # Return structured extracted data without persisting
    result = {
        "title": extracted.get("title") or "Untitled Role",
        "company": extracted.get("company") or "Unknown",
        "description": extracted.get("description"),
        "location": extracted.get("location"),
        "url": url,
        "skills": extracted.get("skills", []),
        "extracted_data": extracted,
    }
    return result

@router.post("/from-text", response_model=JobResponse)
def create_job_from_text(
    payload: dict,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract job details from pasted text with AI, and save it."""
    text = payload.get("text")
    if not text or not str(text).strip():
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        extracted = extract_job_from_text(str(text).strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}")

    extracted_company = extracted.get("company") or "Unknown"
    job = Job(
        user_id=user.id,
        title=extracted.get("title") or "Untitled Role",
        company=extracted_company,
        company_id=_resolve_company_id(db, user, None, extracted_company),
        description=extracted.get("description"),
        location=extracted.get("location"),
        url=payload.get("url"),
        extracted_skills=extracted.get("skills", []),
        extracted_data=extracted,
    )
    db.add(job)
    db.flush()
    get_or_create_application(db, job.id, user.id, ApplicationStatus.SAVED)
    db.commit()
    db.refresh(job)
    return job


@router.post("/from-text/preview")
def preview_job_from_text(
    payload: dict,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
):
    """Extract job details from pasted text without saving."""
    text = payload.get("text")
    if not text or not str(text).strip():
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        extracted = extract_job_from_text(str(text).strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}")

    return {
        "title": extracted.get("title") or "Untitled Role",
        "company": extracted.get("company") or "Unknown",
        "description": extracted.get("description"),
        "location": extracted.get("location"),
        "skills": extracted.get("skills", []),
        "extracted_data": extracted,
    }

