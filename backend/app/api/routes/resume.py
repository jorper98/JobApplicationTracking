from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Resume, User
from app.schemas.schemas import ResumeResponse
from app.services.resume_service import extract_text_from_pdf, save_upload
from app.services.ai_service import extract_skills_from_resume
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.rate_limit import ai_quota_limit
from typing import List
import os

router = APIRouter()


@router.post("/upload", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a PDF resume, extract text and skills."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    contents = await file.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {settings.MAX_FILE_SIZE_MB}MB)")

    # Save file
    file_path = save_upload(contents, file.filename, user.id)

    # Extract text
    raw_text = extract_text_from_pdf(file_path)
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    # Extract skills with AI (fallback to empty skill list if the model call fails)
    try:
        extracted_skills = extract_skills_from_resume(raw_text)
    except Exception as exc:
        print("AI skill extraction failed, continuing with empty skill list:", exc)
        extracted_skills = []

    # Deactivate previous resumes
    db.query(Resume).filter(Resume.user_id == user.id).update({"is_active": False})

    # Next version: max(version)+1 so deleted versions never collide
    latest_version = db.query(func.max(Resume.version)).filter(Resume.user_id == user.id).scalar()

    resume = Resume(
        user_id=user.id,
        filename=file.filename,
        file_path=file_path,
        raw_text=raw_text,
        extracted_skills=extracted_skills,
        is_active=True,
        version=(latest_version or 0) + 1,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


@router.get("/", response_model=List[ResumeResponse])
def list_resumes(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's resumes, newest first, with pagination."""
    return (
        db.query(Resume)
        .filter(Resume.user_id == user.id)
        .order_by(Resume.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/active", response_model=ResumeResponse)
def get_active_resume(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get the user's currently active resume."""
    resume = db.query(Resume).filter(Resume.user_id == user.id, Resume.is_active == True).first()
    if not resume:
        raise HTTPException(status_code=404, detail="No active resume found")
    return resume

@router.patch("/{resume_id}/activate", response_model=ResumeResponse)
def set_active_resume(resume_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Make this resume the active one (deactivates all others)."""
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Deactivate all, then activate this one
    db.query(Resume).filter(Resume.user_id == user.id).update({"is_active": False})
    resume.is_active = True
    db.commit()
    db.refresh(resume)
    return resume

@router.delete("/{resume_id}")
def delete_resume(resume_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a resume and its linked analyses."""
    from app.models.models import JobAnalysis
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Remove linked analyses first (avoids foreign key constraint error)
    db.query(JobAnalysis).filter(JobAnalysis.resume_id == resume_id).delete()

    if os.path.exists(resume.file_path):
        os.remove(resume.file_path)

    db.delete(resume)
    db.commit()
    return {"message": "Resume deleted"}
