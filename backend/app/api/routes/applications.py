from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Application, Job, JobAnalysis, JobNote, Resume, User, ApplicationStatus
from app.schemas.schemas import ApplicationCreate, ApplicationUpdate, ApplicationResponse
from app.core.auth import get_current_user
from app.core.activity import log_activity
from typing import List
from datetime import datetime, timezone

router = APIRouter()


def get_or_create_application(
    db: Session, job_id: str, user_id: str, status: ApplicationStatus, notes: str | None = None
) -> Application:
    """Return the existing tracker entry for a job, or create a new one.

    Idempotent: a job is tracked once, so retries and stale clients cannot
    create duplicates. Field initialization (including the match score from
    the active resume) lives here so every creation path builds the same row.
    Callers are responsible for committing.
    """
    existing = (
        db.query(Application)
        .filter(Application.job_id == job_id, Application.user_id == user_id)
        .first()
    )
    if existing:
        return existing

    # Prefer the analysis computed against the user's active resume; only
    # fall back to the most recent analysis for the job otherwise.
    analysis = None
    active_resume = (
        db.query(Resume)
        .filter(Resume.user_id == user_id, Resume.is_active == True)
        .first()
    )
    if active_resume:
        analysis = (
            db.query(JobAnalysis)
            .filter(JobAnalysis.job_id == job_id, JobAnalysis.resume_id == active_resume.id)
            .order_by(JobAnalysis.created_at.desc())
            .first()
        )
    if analysis is None:
        analysis = (
            db.query(JobAnalysis)
            .filter(JobAnalysis.job_id == job_id)
            .order_by(JobAnalysis.created_at.desc())
            .first()
        )

    application = Application(
        user_id=user_id,
        job_id=job_id,
        status=status,
        notes=notes,
        applied_date=datetime.now(timezone.utc),
        match_score=analysis.match_score if analysis else None,
    )
    db.add(application)
    return application


@router.post("/", response_model=ApplicationResponse)
def create_application(data: ApplicationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new job application."""
    job = db.query(Job).filter(Job.id == data.job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = (
        db.query(Application)
        .filter(Application.job_id == data.job_id, Application.user_id == user.id)
        .first()
    )
    if existing:
        if existing.status != data.status:
            raise HTTPException(
                status_code=409,
                detail="This job is already in the tracker with a different status.",
            )
        db.refresh(existing)
        return existing

    application = get_or_create_application(db, data.job_id, user.id, data.status, data.notes)
    status_value = data.status.value if data.status else None
    log_activity(db, user.id, "created", "application", application.id, job.title, details=f"status: {status_value}")
    db.commit()
    db.refresh(application)
    return application


@router.get("/", response_model=List[ApplicationResponse])
def list_applications(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List applications for the current user, newest first, with pagination."""
    return (
        db.query(Application)
        .filter(Application.user_id == user.id)
        .order_by(Application.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/kanban")
def get_kanban(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return applications grouped by status for Kanban board."""
    applications = (
        db.query(Application)
        .filter(Application.user_id == user.id)
        .all()
    )

    note_counts = dict(
        db.query(JobNote.job_id, func.count(JobNote.id))
        .group_by(JobNote.job_id)
        .all()
    )

    board = {status.value: [] for status in ApplicationStatus}
    for app in applications:
        job = app.job
        board[app.status.value].append({
            "id": app.id,
            "job_id": app.job_id,
            "title": job.title if job else "Unknown",
            "company": job.company if job else "Unknown",
            "company_id": job.company_id if job else None,
            "location": job.location if job else None,
            "match_score": app.match_score,
            "applied_date": app.applied_date.isoformat() if app.applied_date else None,
            "follow_up_date": app.follow_up_date.isoformat() if app.follow_up_date else None,
            "notes": app.notes,
            "note_count": note_counts.get(app.job_id, 0),
        })

    return board


@router.patch("/{app_id}", response_model=ApplicationResponse)
def update_application(app_id: str, data: ApplicationUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update application status or notes."""
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    job_title = app.job.title if app.job else "Application"
    old_status = app.status.value if app.status else None
    if data.status is not None:
        app.status = data.status
    if data.notes is not None:
        app.notes = data.notes
    if data.follow_up_date is not None:
        app.follow_up_date = data.follow_up_date

    details = None
    if data.status is not None and old_status and old_status != data.status.value:
        details = f"{old_status} -> {data.status.value}"
    log_activity(db, user.id, "updated", "application", app.id, job_title, details=details)
    db.commit()
    db.refresh(app)
    return app


@router.delete("/{app_id}")
def delete_application(app_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete an application."""
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    job_title = app.job.title if app.job else "Application"
    log_activity(db, user.id, "deleted", "application", app.id, job_title)
    db.delete(app)
    db.commit()
    return {"message": "Application deleted"}
