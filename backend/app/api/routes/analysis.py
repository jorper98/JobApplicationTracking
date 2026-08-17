from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import JobAnalysis, Job, Resume, User
from app.schemas.schemas import AnalysisRequest, AnalysisResponse
from app.services.ai_service import analyze_match, generate_cover_letter
from app.core.auth import get_current_user
from app.core.rate_limit import ai_quota_limit

router = APIRouter()


@router.post("/match", response_model=AnalysisResponse)
def analyze_job_match(
    data: AnalysisRequest,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Score resume against job description. Returns match score, skills gap, suggestions."""
    job = db.query(Job).filter(Job.id == data.job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resume = db.query(Resume).filter(Resume.id == data.resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if not resume.raw_text:
        raise HTTPException(status_code=400, detail="Resume has no extracted text")

    if not job.description:
        raise HTTPException(status_code=400, detail="Job has no description")

    result = analyze_match(
        resume_text=resume.raw_text,
        job_description=job.description,
        job_skills=job.extracted_skills or [],
    )

    # One analysis per (job, resume) pair: update in place if it already
    # exists, otherwise create a new record. The cover letter is kept on
    # re-analysis since it was generated for the same job and resume.
    analysis = (
        db.query(JobAnalysis)
        .filter(JobAnalysis.job_id == job.id, JobAnalysis.resume_id == resume.id)
        .first()
    )
    if analysis:
        analysis.match_score = result.get("match_score")
        analysis.matching_skills = result.get("matching_skills", [])
        analysis.missing_skills = result.get("missing_skills", [])
        analysis.resume_suggestions = result.get("resume_suggestions", [])
    else:
        analysis = JobAnalysis(
            job_id=job.id,
            resume_id=resume.id,
            match_score=result.get("match_score"),
            matching_skills=result.get("matching_skills", []),
            missing_skills=result.get("missing_skills", []),
            resume_suggestions=result.get("resume_suggestions", []),
        )
        db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.post("/{analysis_id}/cover-letter")
def create_cover_letter(
    analysis_id: str,
    _quota: None = Depends(ai_quota_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a tailored cover letter for a job analysis."""
    analysis = db.query(JobAnalysis).filter(JobAnalysis.id == analysis_id).first()
    if not analysis or analysis.job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    job = analysis.job
    resume = analysis.resume

    cover_letter = generate_cover_letter(
        resume_text=resume.raw_text,
        job_title=job.title,
        company=job.company,
        job_description=job.description or "",
    )

    analysis.cover_letter = cover_letter
    db.commit()

    return {"cover_letter": cover_letter}


@router.get("/job/{job_id}", response_model=list[AnalysisResponse])
def get_analyses_for_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all analyses for a specific job."""
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return db.query(JobAnalysis).filter(JobAnalysis.job_id == job_id).all()
