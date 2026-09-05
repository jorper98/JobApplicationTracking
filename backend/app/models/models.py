from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, ForeignKey,
    Boolean, JSON, Enum, text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import enum
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class ApplicationStatus(str, enum.Enum):
    SAVED = "saved"
    APPLIED = "applied"
    INTERVIEW = "interview"
    REJECTED = "rejected"
    OFFER = "offer"
    GHOSTED = "ghosted"
    NOT_PURSUED = "not_pursued"


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    reset_token_hash = Column(String, nullable=True, index=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    # Email verification (double opt-in). Existing rows default to verified.
    verified = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    companies = relationship("Company", back_populates="user", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="user", cascade="all, delete-orphan")
    ai_usage = relationship("AIUsage", back_populates="user", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    raw_text = Column(Text, nullable=True)
    extracted_skills = Column(JSON, nullable=True)  # ["Python", "React", ...]
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="resumes")
    analyses = relationship("JobAnalysis", back_populates="resume")


class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="companies")
    jobs = relationship("Job", back_populates="company_record")
    company_notes = relationship("CompanyNote", back_populates="company", cascade="all, delete-orphan")


class CompanyNote(Base):
    __tablename__ = "company_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="company_notes")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="contacts")
    contact_companies = relationship("ContactCompany", back_populates="contact", cascade="all, delete-orphan")
    contact_jobs = relationship("ContactJob", back_populates="contact", cascade="all, delete-orphan")
    related_contacts = relationship("ContactContact", foreign_keys="ContactContact.contact_id", back_populates="contact", cascade="all, delete-orphan")
    contact_notes = relationship("ContactNote", back_populates="contact", cascade="all, delete-orphan")


class ContactCompany(Base):
    __tablename__ = "contact_companies"

    contact_id = Column(String, ForeignKey("contacts.id"), primary_key=True)
    company_id = Column(String, ForeignKey("companies.id"), primary_key=True)

    contact = relationship("Contact", back_populates="contact_companies")
    company = relationship("Company")


class ContactJob(Base):
    __tablename__ = "contact_jobs"

    contact_id = Column(String, ForeignKey("contacts.id"), primary_key=True)
    job_id = Column(String, ForeignKey("jobs.id"), primary_key=True)

    contact = relationship("Contact", back_populates="contact_jobs")
    job = relationship("Job")


class ContactContact(Base):
    __tablename__ = "contact_contacts"

    contact_id = Column(String, ForeignKey("contacts.id"), primary_key=True)
    related_contact_id = Column(String, ForeignKey("contacts.id"), primary_key=True)

    contact = relationship("Contact", foreign_keys=[contact_id], back_populates="related_contacts")
    related_contact = relationship("Contact", foreign_keys=[related_contact_id])


class JobJob(Base):
    __tablename__ = "job_jobs"

    job_id = Column(String, ForeignKey("jobs.id"), primary_key=True)
    related_job_id = Column(String, ForeignKey("jobs.id"), primary_key=True)

    job = relationship("Job", foreign_keys=[job_id], back_populates="related_jobs")
    related_job = relationship("Job", foreign_keys=[related_job_id])


class ContactNote(Base):
    __tablename__ = "contact_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    contact_id = Column(String, ForeignKey("contacts.id"), nullable=False, index=True)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contact = relationship("Contact", back_populates="contact_notes")
    tags = relationship("ContactNoteTag", back_populates="note", cascade="all, delete-orphan")


class ContactNoteTag(Base):
    __tablename__ = "contact_note_tags"

    id = Column(String, primary_key=True, default=generate_uuid)
    note_id = Column(String, ForeignKey("contact_notes.id"), nullable=False, index=True)
    entity_type = Column(String, nullable=False)  # 'job', 'company', 'contact'
    entity_id = Column(String, nullable=False)

    note = relationship("ContactNote", back_populates="tags")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    extracted_skills = Column(JSON, nullable=True)   # Skills extracted by AI
    extracted_data = Column(JSON, nullable=True)     # Full AI extraction result
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")
    analyses = relationship("JobAnalysis", back_populates="job", cascade="all, delete-orphan")
    notes = relationship("JobNote", back_populates="job", cascade="all, delete-orphan")
    related_jobs = relationship("JobJob", foreign_keys="JobJob.job_id", back_populates="job", cascade="all, delete-orphan")
    related_to = relationship("JobJob", foreign_keys="JobJob.related_job_id", back_populates="related_job", cascade="all, delete-orphan")
    user = relationship("User", back_populates="jobs")
    company_record = relationship("Company", back_populates="jobs")


class JobNote(Base):
    __tablename__ = "job_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("Job", back_populates="notes")


class JobAnalysis(Base):
    __tablename__ = "job_analyses"

    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    resume_id = Column(String, ForeignKey("resumes.id"), nullable=False, index=True)
    match_score = Column(Float, nullable=True)          # 0-100
    matching_skills = Column(JSON, nullable=True)       # ["Python", "Git"]
    missing_skills = Column(JSON, nullable=True)        # ["Docker", "React"]
    resume_suggestions = Column(JSON, nullable=True)    # ["Highlight FastAPI projects"]
    cover_letter = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("Job", back_populates="analyses")
    resume = relationship("Resume", back_populates="analyses")


class Application(Base):
    __tablename__ = "applications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    status = Column(Enum(ApplicationStatus), default=ApplicationStatus.APPLIED)
    applied_date = Column(DateTime(timezone=True), nullable=True)
    follow_up_date = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    match_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="applications")
    job = relationship("Job", back_populates="applications")


class AIUsage(Base):
    __tablename__ = "ai_usage"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    feature = Column(String, nullable=False, index=True)
    model = Column(String, nullable=True)
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    cost = Column(Float, nullable=False, default=0.0)  # estimated USD
    status = Column(String, nullable=False, default="success")  # success | failed
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="ai_usage")


class ActivityLog(Base):
    """Simple audit trail: who did what and when (date/time, record, action)."""

    __tablename__ = "activity_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)  # created | updated | deleted
    entity_type = Column(String, nullable=False, index=True)  # job | company | contact | ...
    entity_id = Column(String, nullable=True)
    entity_name = Column(String, nullable=True)  # human-readable record label
    details = Column(Text, nullable=True)  # optional extra, e.g. "saved -> applied"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="activity_logs")





