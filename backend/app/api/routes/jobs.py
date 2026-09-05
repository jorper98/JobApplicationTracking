from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Company, Contact, ContactJob, ContactNote, ContactNoteTag, Job, JobAnalysis, JobJob, JobNote, ApplicationStatus, User
from app.schemas.schemas import JobCreate, JobUpdate, JobResponse, JobNoteCreate, JobNoteUpdate, JobNoteResponse
from app.services.ai_service import extract_skills_from_job, fetch_job_from_url, extract_job_from_text, track_usage
from app.api.routes.companies import get_or_create_company
from app.api.routes.applications import get_or_create_application
from app.core.auth import get_current_user
from app.core.activity import log_activity
from app.core.rate_limit import ai_quota_limit
from typing import List

router = APIRouter()


def _get_owned_job(db: Session, user: User, job_id: str) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _job_to_response(job: Job, note_count: int = 0) -> JobResponse:
    return JobResponse(
        id=job.id,
        title=job.title,
        company=job.company,
        company_id=job.company_id,
        description=job.description,
        url=job.url,
        location=job.location,
        extracted_skills=job.extracted_skills,
        note_count=note_count,
        created_at=job.created_at,
    )


def _extract_job_skills_in_background(user_id: str, job_id: str, description: str) -> None:
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

    with track_usage(user_id, "extract_job_skills"):
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
    get_or_create_application(db, job.id, user.id, job_data.status or ApplicationStatus.SAVED)
    log_activity(db, user.id, "created", "job", job.id, job.title)
    db.commit()
    db.refresh(job)

    if job_data.description:
        background_tasks.add_task(_extract_job_skills_in_background, user.id, job.id, job_data.description)

    return _job_to_response(job)


@router.get("/", response_model=List[JobResponse])
def list_jobs(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's jobs, newest first, with pagination."""
    jobs = (
        db.query(Job)
        .filter(Job.user_id == user.id)
        .order_by(Job.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    if not jobs:
        return []
    note_counts = dict(
        db.query(JobNote.job_id, func.count(JobNote.id))
        .filter(JobNote.job_id.in_([j.id for j in jobs]))
        .group_by(JobNote.job_id)
        .all()
    )
    return [_job_to_response(job, note_counts.get(job.id, 0)) for job in jobs]


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a specific job."""
    job = _get_owned_job(db, user, job_id)
    note_count = (
        db.query(func.count(JobNote.id)).filter(JobNote.job_id == job.id).scalar() or 0
    )
    return _job_to_response(job, note_count)


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: str, job_data: JobUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing job."""
    job = _get_owned_job(db, user, job_id)

    update_data = job_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Ignore explicit nulls for required fields (avoids NOT NULL constraint errors)
        if value is None and field in ("title", "company"):
            continue
        if field == "status":
            # Status lives on the tracker entry, not the job row.
            if value is not None:
                app = get_or_create_application(db, job.id, user.id, value)
                if app.status != value:
                    old_status = app.status.value if app.status else None
                    app.status = value
                    log_activity(
                        db, user.id, "updated", "application", app.id, job.title,
                        details=(f"{old_status} -> {value.value}" if old_status else f"status: {value.value}"),
                    )
            continue
        if field == "company_id":
            if value is None:
                job.company_id = None
            else:
                job.company_id = _resolve_company_id(db, user, value, job.company)
            continue
        setattr(job, field, value)

    log_activity(db, user.id, "updated", "job", job.id, job.title)
    db.commit()
    db.refresh(job)
    return _job_to_response(job)


@router.delete("/{job_id}")
def delete_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a job and all linked notes, analyses, and applications."""
    job = _get_owned_job(db, user, job_id)

    log_activity(db, user.id, "deleted", "job", job.id, job.title)
    db.delete(job)
    db.commit()
    return {"message": "Job deleted"}


@router.get("/{job_id}/notes", response_model=List[JobNoteResponse])
def list_job_notes(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_owned_job(db, user, job_id)
    return db.query(JobNote).filter(JobNote.job_id == job_id).order_by(JobNote.created_at.desc()).all()


@router.post("/{job_id}/notes", response_model=JobNoteResponse)
def create_job_note(job_id: str, note_data: JobNoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _get_owned_job(db, user, job_id)

    job_note = JobNote(job_id=job_id, note=note_data.note)
    db.add(job_note)
    log_activity(db, user.id, "created", "note", job_note.id, f"Note on {job.title}", details=note_data.note.strip()[:120])
    db.commit()
    db.refresh(job_note)
    return job_note


@router.patch("/{job_id}/notes/{note_id}", response_model=JobNoteResponse)
def update_job_note(job_id: str, note_id: str, note_data: JobNoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _get_owned_job(db, user, job_id)
    note = db.query(JobNote).filter(JobNote.id == note_id, JobNote.job_id == job_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.note = note_data.note
    if note_data.created_at is not None:
        note.created_at = note_data.created_at
    log_activity(db, user.id, "updated", "note", note.id, f"Note on {job.title}")
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{job_id}/notes/{note_id}")
def delete_job_note(job_id: str, note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _get_owned_job(db, user, job_id)
    note = db.query(JobNote).filter(JobNote.id == note_id, JobNote.job_id == job_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    log_activity(db, user.id, "deleted", "note", note.id, f"Note on {job.title}")
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
        with track_usage(user.id, "extract_job"):
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
    log_activity(db, user.id, "created", "job", job.id, job.title)
    db.commit()
    db.refresh(job)
    return _job_to_response(job)


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
        with track_usage(user.id, "extract_job"):
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
        with track_usage(user.id, "extract_job"):
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
    log_activity(db, user.id, "created", "job", job.id, job.title)
    db.commit()
    db.refresh(job)
    return _job_to_response(job)


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
        with track_usage(user.id, "extract_job"):
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


@router.get("/{job_id}/contacts")
def list_job_contacts(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List contacts linked to this job."""
    job = _get_owned_job(db, user, job_id)
    rows = (
        db.query(Contact)
        .join(ContactJob, ContactJob.contact_id == Contact.id)
        .filter(ContactJob.job_id == job.id, Contact.user_id == user.id)
        .order_by(func.lower(Contact.name))
        .all()
    )
    return [
        {"id": c.id, "name": c.name, "email": c.email, "phone": c.phone}
        for c in rows
    ]


@router.get("/{job_id}/relationships")
def get_job_relationships(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List everything related to this job: linked contacts and notes
    (the job's own notes plus contact notes tagged with this job)."""
    job = _get_owned_job(db, user, job_id)

    contacts = (
        db.query(Contact)
        .join(ContactJob, ContactJob.contact_id == Contact.id)
        .filter(ContactJob.job_id == job.id, Contact.user_id == user.id)
        .order_by(func.lower(Contact.name))
        .all()
    )
    own_notes = (
        db.query(JobNote)
        .filter(JobNote.job_id == job.id)
        .order_by(JobNote.created_at.desc())
        .all()
    )
    tagged_notes = (
        db.query(ContactNote)
        .join(ContactNoteTag, ContactNoteTag.note_id == ContactNote.id)
        .join(Contact, Contact.id == ContactNote.contact_id)
        .filter(
            ContactNoteTag.entity_type == "job",
            ContactNoteTag.entity_id == job.id,
            Contact.user_id == user.id,
        )
        .all()
    )
    contact_ids = {n.contact_id for n in tagged_notes}
    contacts_by_id = {
        c.id: c
        for c in db.query(Contact).filter(Contact.id.in_(contact_ids)).all()
    } if contact_ids else {}
    tag_rows = (
        db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_([n.id for n in tagged_notes])).all()
        if tagged_notes else []
    )
    tags_by_note: dict = {}
    for tag in tag_rows:
        tags_by_note.setdefault(tag.note_id, []).append(tag)
    company_names = {
        c.id: c.name
        for c in db.query(Company).filter(Company.id.in_([t.entity_id for t in tag_rows if t.entity_type == "company"])).all()
    } if tag_rows else {}
    job_names = {
        j.id: j.title
        for j in db.query(Job).filter(Job.id.in_([t.entity_id for t in tag_rows if t.entity_type == "job"])).all()
    } if tag_rows else {}
    contact_tag_names = {
        c.id: c.name
        for c in db.query(Contact).filter(Contact.id.in_([t.entity_id for t in tag_rows if t.entity_type == "contact"])).all()
    } if tag_rows else {}

    notes = [
        {
            "id": n.id,
            "note": n.note,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "source": "job",
            "contact_id": None,
            "contact_name": None,
            "tags": [],
        }
        for n in own_notes
    ]
    for n in tagged_notes:
        contact = contacts_by_id.get(n.contact_id)
        tags = []
        for tag in tags_by_note.get(n.id, []):
            name = None
            if tag.entity_type == "company":
                name = company_names.get(tag.entity_id)
            elif tag.entity_type == "job":
                name = job_names.get(tag.entity_id)
            elif tag.entity_type == "contact":
                name = contact_tag_names.get(tag.entity_id)
            tags.append({
                "id": tag.id,
                "entity_type": tag.entity_type,
                "entity_id": tag.entity_id,
                "entity_name": name,
            })
        notes.append({
            "id": n.id,
            "note": n.note,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "source": "contact",
            "contact_id": contact.id if contact else None,
            "contact_name": contact.name if contact else None,
            "tags": tags,
        })

    company = None
    if job.company_id:
        company_obj = (
            db.query(Company)
            .filter(Company.id == job.company_id, Company.user_id == user.id)
            .first()
        )
        if company_obj:
            company = {"id": company_obj.id, "name": company_obj.name}

    related_jobs = (
        db.query(Job)
        .join(JobJob, JobJob.related_job_id == Job.id)
        .filter(JobJob.job_id == job.id, Job.user_id == user.id)
        .all()
    )

    return {
        "company": company,
        "contacts": [
            {"id": c.id, "name": c.name, "email": c.email, "phone": c.phone}
            for c in contacts
        ],
        "related_jobs": [
            {"id": j.id, "title": j.title, "company": j.company}
            for j in related_jobs
        ],
        "notes": notes,
    }


@router.post("/{job_id}/relationships")
def add_job_relationship(
    job_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link this job to a contact, company, or another job."""
    job = _get_owned_job(db, user, job_id)
    entity_type = payload.get("entity_type")
    entity_id = payload.get("entity_id")
    if not entity_type or not entity_id:
        raise HTTPException(status_code=400, detail="entity_type and entity_id are required")

    if entity_type == "contact":
        contact = db.query(Contact).filter(Contact.id == entity_id, Contact.user_id == user.id).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        exists = db.query(ContactJob).filter(
            ContactJob.contact_id == entity_id, ContactJob.job_id == job.id
        ).first()
        if not exists:
            db.add(ContactJob(contact_id=entity_id, job_id=job.id))
            log_activity(db, user.id, "updated", "job", job.id, job.title, details=f"linked contact: {contact.name}")
            db.commit()
    elif entity_type == "company":
        company = db.query(Company).filter(Company.id == entity_id, Company.user_id == user.id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        job.company_id = company.id
        job.company = company.name
        log_activity(db, user.id, "updated", "job", job.id, job.title, details=f"linked company: {company.name}")
        db.commit()
    elif entity_type == "job":
        if entity_id == job_id:
            raise HTTPException(status_code=400, detail="Cannot link a job to itself")
        other = db.query(Job).filter(Job.id == entity_id, Job.user_id == user.id).first()
        if not other:
            raise HTTPException(status_code=404, detail="Job not found")
        exists = db.query(JobJob).filter(
            JobJob.job_id == job.id, JobJob.related_job_id == entity_id
        ).first()
        if not exists:
            db.add(JobJob(job_id=job.id, related_job_id=entity_id))
            db.add(JobJob(job_id=entity_id, related_job_id=job.id))
            log_activity(db, user.id, "updated", "job", job.id, job.title, details=f"linked job: {other.title}")
            db.commit()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type")
    return {"message": "Relationship added"}


@router.delete("/{job_id}/relationships/{entity_type}/{entity_id}")
def remove_job_relationship(
    job_id: str,
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unlink this job from a contact, company, or another job."""
    job = _get_owned_job(db, user, job_id)
    if entity_type == "contact":
        db.query(ContactJob).filter(
            ContactJob.contact_id == entity_id, ContactJob.job_id == job.id
        ).delete()
        log_activity(db, user.id, "updated", "job", job.id, job.title, details=f"unlinked contact: {entity_id}")
        db.commit()
    elif entity_type == "company":
        if job.company_id == entity_id:
            job.company_id = None
            log_activity(db, user.id, "updated", "job", job.id, job.title, details="unlinked company")
            db.commit()
    elif entity_type == "job":
        db.query(JobJob).filter(
            JobJob.job_id == job.id, JobJob.related_job_id == entity_id
        ).delete()
        db.query(JobJob).filter(
            JobJob.job_id == entity_id, JobJob.related_job_id == job.id
        ).delete()
        log_activity(db, user.id, "updated", "job", job.id, job.title, details=f"unlinked job: {entity_id}")
        db.commit()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type")
    return {"message": "Relationship removed"}
