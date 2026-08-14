from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime
from app.models.models import ApplicationStatus


# ── Resume ────────────────────────────────────────────────────────────────────

class ResumeResponse(BaseModel):
    id: str
    filename: str
    extracted_skills: Optional[List[str]] = None
    is_active: bool
    version: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Job ───────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str
    company: str
    description: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


class JobResponse(BaseModel):
    id: str
    title: str
    company: str
    description: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    extracted_skills: Optional[List[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class JobNoteCreate(BaseModel):
    note: str


class JobNoteResponse(BaseModel):
    id: str
    job_id: str
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Analysis ──────────────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    job_id: str
    resume_id: str


class AnalysisResponse(BaseModel):
    id: str
    job_id: str
    resume_id: str
    match_score: Optional[float] = None
    matching_skills: Optional[List[str]] = None
    missing_skills: Optional[List[str]] = None
    resume_suggestions: Optional[List[str]] = None
    cover_letter: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Application ───────────────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    job_id: str
    status: ApplicationStatus = ApplicationStatus.APPLIED
    notes: Optional[str] = None


class ApplicationUpdate(BaseModel):
    status: Optional[ApplicationStatus] = None
    notes: Optional[str] = None
    follow_up_date: Optional[datetime] = None


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    status: ApplicationStatus
    applied_date: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    notes: Optional[str] = None
    match_score: Optional[float] = None
    job: Optional[JobResponse] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
