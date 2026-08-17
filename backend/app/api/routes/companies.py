from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Company, Job, User
from app.schemas.schemas import CompanyCreate, CompanyUpdate, CompanyResponse
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
