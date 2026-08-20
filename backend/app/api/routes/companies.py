from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Company, CompanyNote, Job, User
from app.schemas.schemas import (
    CompanyCreate,
    CompanyUpdate,
    CompanyResponse,
    CompanyNoteCreate,
    CompanyNoteUpdate,
    CompanyNoteResponse,
)
from app.core.auth import get_current_user
from typing import List

router = APIRouter()


def _get_owned_company(db: Session, user: User, company_id: str) -> Company:
    company = db.query(Company).filter(Company.id == company_id, Company.user_id == user.id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def get_or_create_company(db: Session, user_id: str, name: str) -> Company:
    """Find an existing company by exact (case-insensitive) name or create one."""
    if not name or not name.strip():
        return None
    name = name.strip()
    existing = (
        db.query(Company)
        .filter(
            Company.user_id == user_id,
            func.lower(Company.name) == name.lower(),
        )
        .first()
    )
    if existing:
        return existing
    company = Company(user_id=user_id, name=name)
    db.add(company)
    db.flush()
    return company


def _with_job_count(db: Session, user: User, companies: List[Company]) -> List[CompanyResponse]:
    counts = dict(
        db.query(Job.company_id, func.count(Job.id))
        .filter(Job.user_id == user.id, Job.company_id.isnot(None))
        .group_by(Job.company_id)
        .all()
    )
    return [
        CompanyResponse(
            id=c.id,
            name=c.name,
            notes=c.notes,
            job_count=counts.get(c.id, 0),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in companies
    ]


@router.get("/", response_model=List[CompanyResponse])
def list_companies(
    search: str = "",
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's companies, optionally filtered by name (2+ chars)."""
    query = db.query(Company).filter(Company.user_id == user.id)
    q = search.strip()
    if q:
        query = query.filter(func.lower(Company.name).contains(q.lower()))
    companies = query.order_by(func.lower(Company.name)).offset(offset).limit(limit).all()
    return _with_job_count(db, user, companies)


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a single company with its notes."""
    company = _get_owned_company(db, user, company_id)
    return _with_job_count(db, user, [company])[0]


@router.post("/", response_model=CompanyResponse)
def create_company(
    company_data: CompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a company. If one with the same name already exists, return it."""
    company = get_or_create_company(db, user.id, company_data.name)
    if company_data.notes is not None and company.notes != company_data.notes:
        company.notes = company_data.notes
    db.commit()
    db.refresh(company)
    return _with_job_count(db, user, [company])[0]


@router.patch("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: str,
    company_data: CompanyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a company's name or notes."""
    company = _get_owned_company(db, user, company_id)

    update_data = company_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is None and field == "name":
            continue
        setattr(company, field, value)

    db.commit()
    db.refresh(company)
    return _with_job_count(db, user, [company])[0]


@router.delete("/{company_id}")
def delete_company(company_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a company. Jobs keep their company name but lose the link."""
    company = _get_owned_company(db, user, company_id)
    db.query(Job).filter(Job.company_id == company_id, Job.user_id == user.id).update({Job.company_id: None})
    db.delete(company)
    db.commit()
    return {"message": "Company deleted"}


@router.get("/{company_id}/notes", response_model=List[CompanyNoteResponse])
def list_company_notes(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all notes for a company."""
    company = _get_owned_company(db, user, company_id)
    return (
        db.query(CompanyNote)
        .filter(CompanyNote.company_id == company.id)
        .order_by(CompanyNote.created_at.desc())
        .all()
    )


@router.post("/{company_id}/notes", response_model=CompanyNoteResponse)
def create_company_note(
    company_id: str,
    note_data: CompanyNoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new note for a company."""
    company = _get_owned_company(db, user, company_id)
    if not note_data.note.strip():
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    note = CompanyNote(company_id=company.id, note=note_data.note.strip())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{company_id}/notes/{note_id}", response_model=CompanyNoteResponse)
def update_company_note(
    company_id: str,
    note_id: str,
    note_data: CompanyNoteUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a company note."""
    company = _get_owned_company(db, user, company_id)
    note = (
        db.query(CompanyNote)
        .filter(CompanyNote.id == note_id, CompanyNote.company_id == company.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.note = note_data.note.strip()
    if note_data.created_at:
        note.created_at = note_data.created_at
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{company_id}/notes/{note_id}")
def delete_company_note(
    company_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a company note."""
    company = _get_owned_company(db, user, company_id)
    note = (
        db.query(CompanyNote)
        .filter(CompanyNote.id == note_id, CompanyNote.company_id == company.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
