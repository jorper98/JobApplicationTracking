from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Company, Contact, ContactNote, ContactNoteTag, ContactCompany, ContactJob, ContactContact, Job, User
from app.schemas.schemas import (
    ContactCreate,
    ContactUpdate,
    ContactResponse,
    ContactLinkResponse,
    ContactNoteCreate,
    ContactNoteUpdate,
    ContactNoteResponse,
    ContactNoteTagResponse,
)
from app.core.auth import get_current_user
from app.core.activity import log_activity
from typing import List

router = APIRouter()


def _get_owned_contact(db: Session, user: User, contact_id: str) -> Contact:
    contact = db.query(Contact).filter(Contact.id == contact_id, Contact.user_id == user.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


def _get_owned_company(db: Session, user: User, company_id: str):
    company = db.query(Company).filter(Company.id == company_id, Company.user_id == user.id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _get_owned_job(db: Session, user: User, job_id: str):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _contact_note_count(db: Session, contact_id: str) -> int:
    return (
        db.query(func.count(ContactNote.id))
        .filter(ContactNote.contact_id == contact_id)
        .scalar()
        or 0
    )


def _contact_to_response(db: Session, contact: Contact, note_count: int = 0) -> ContactResponse:
    company_links = [
        ContactLinkResponse(id=cc.company.id, name=cc.company.name, email=None)
        for cc in contact.contact_companies if cc.company
    ]
    job_links = [
        ContactLinkResponse(id=cj.job.id, name=cj.job.title, email=None)
        for cj in contact.contact_jobs if cj.job
    ]
    contact_links = [
        ContactLinkResponse(id=rc.related_contact.id, name=rc.related_contact.name, email=rc.related_contact.email)
        for rc in contact.related_contacts if rc.related_contact
    ]
    return ContactResponse(
        id=contact.id,
        name=contact.name,
        email=contact.email,
        phone=contact.phone,
        companies=company_links,
        jobs=job_links,
        contacts=contact_links,
        note_count=note_count,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


def _note_tags_to_response(db: Session, user: User, tags: List[ContactNoteTag]) -> List[ContactNoteTagResponse]:
    if not tags:
        return []
    company_ids = [t.entity_id for t in tags if t.entity_type == "company"]
    job_ids = [t.entity_id for t in tags if t.entity_type == "job"]
    contact_ids = [t.entity_id for t in tags if t.entity_type == "contact"]
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()} if company_ids else {}
    jobs = {j.id: j.title for j in db.query(Job).filter(Job.id.in_(job_ids)).all()} if job_ids else {}
    contacts = {c.id: c.name for c in db.query(Contact).filter(Contact.id.in_(contact_ids)).all()} if contact_ids else {}
    result = []
    for tag in tags:
        name = None
        if tag.entity_type == "company":
            name = companies.get(tag.entity_id)
        elif tag.entity_type == "job":
            name = jobs.get(tag.entity_id)
        elif tag.entity_type == "contact":
            name = contacts.get(tag.entity_id)
        result.append(ContactNoteTagResponse(
            id=tag.id,
            entity_type=tag.entity_type,
            entity_id=tag.entity_id,
            entity_name=name,
        ))
    return result


@router.get("/", response_model=List[ContactResponse])
def list_contacts(
    search: str = "",
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's contacts, optionally filtered by name/email."""
    query = db.query(Contact).filter(Contact.user_id == user.id)
    q = search.strip()
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Contact.name).like(pattern)
            | func.coalesce(func.lower(Contact.email), "").like(pattern)
        )
    contacts = query.order_by(func.lower(Contact.name)).offset(offset).limit(limit).all()
    if not contacts:
        return []
    note_counts = dict(
        db.query(ContactNote.contact_id, func.count(ContactNote.id))
        .filter(ContactNote.contact_id.in_([c.id for c in contacts]))
        .group_by(ContactNote.contact_id)
        .all()
    )
    return [_contact_to_response(db, c, note_counts.get(c.id, 0)) for c in contacts]


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a single contact."""
    contact = _get_owned_contact(db, user, contact_id)
    return _contact_to_response(db, contact, _contact_note_count(db, contact.id))


@router.post("/", response_model=ContactResponse)
def create_contact(
    contact_data: ContactCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a contact."""
    contact = Contact(
        user_id=user.id,
        name=contact_data.name.strip(),
        email=(contact_data.email or "").strip() or None,
        phone=(contact_data.phone or "").strip() or None,
    )
    db.add(contact)
    log_activity(db, user.id, "created", "contact", contact.id, contact.name)
    db.commit()
    db.refresh(contact)
    return _contact_to_response(db, contact, _contact_note_count(db, contact.id))


@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: str,
    contact_data: ContactUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a contact's details."""
    contact = _get_owned_contact(db, user, contact_id)
    update_data = contact_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "name" and (value is None or not str(value).strip()):
            continue
        if field in ("email", "phone") and value is not None:
            value = value.strip() or None
        setattr(contact, field, value)
    log_activity(db, user.id, "updated", "contact", contact.id, contact.name)
    db.commit()
    db.refresh(contact)
    return _contact_to_response(db, contact, _contact_note_count(db, contact.id))


@router.delete("/{contact_id}")
def delete_contact(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a contact and its notes/relationships."""
    contact = _get_owned_contact(db, user, contact_id)
    # Remove the reverse side of any contact-to-contact links pointing here.
    db.query(ContactContact).filter(ContactContact.related_contact_id == contact_id).delete(
        synchronize_session=False
    )
    log_activity(db, user.id, "deleted", "contact", contact.id, contact.name)
    db.delete(contact)
    db.commit()
    return {"message": "Contact deleted"}


# ── Relationships ─────────────────────────────────────────────────────

@router.get("/{contact_id}/relationships")
def get_relationships(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all relationships for a contact."""
    contact = _get_owned_contact(db, user, contact_id)
    companies = [{"id": cc.company.id, "name": cc.company.name} for cc in contact.contact_companies if cc.company]
    jobs = [{"id": cj.job.id, "name": cj.job.title, "company": cj.job.company} for cj in contact.contact_jobs if cj.job]
    contacts = [{"id": rc.related_contact.id, "name": rc.related_contact.name, "email": rc.related_contact.email} for rc in contact.related_contacts if rc.related_contact]
    return {"companies": companies, "jobs": jobs, "contacts": contacts}


@router.post("/{contact_id}/relationships")
def add_relationship(
    contact_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a relationship to a contact. Payload: {entity_type, entity_id}."""
    contact = _get_owned_contact(db, user, contact_id)
    entity_type = payload.get("entity_type")
    entity_id = payload.get("entity_id")
    if entity_type == "company":
        _get_owned_company(db, user, entity_id)
        exists = db.query(ContactCompany).filter(
            ContactCompany.contact_id == contact_id,
            ContactCompany.company_id == entity_id,
        ).first()
        if not exists:
            db.add(ContactCompany(contact_id=contact_id, company_id=entity_id))
            company = db.query(Company).filter(Company.id == entity_id).first()
            log_activity(db, user.id, "updated", "contact", contact.id, contact.name, details=f"linked company: {company.name if company else entity_id}")
            db.commit()
    elif entity_type == "job":
        _get_owned_job(db, user, entity_id)
        exists = db.query(ContactJob).filter(
            ContactJob.contact_id == contact_id,
            ContactJob.job_id == entity_id,
        ).first()
        if not exists:
            db.add(ContactJob(contact_id=contact_id, job_id=entity_id))
            job = db.query(Job).filter(Job.id == entity_id).first()
            log_activity(db, user.id, "updated", "contact", contact.id, contact.name, details=f"linked job: {job.title if job else entity_id}")
            db.commit()
    elif entity_type == "contact":
        if entity_id == contact_id:
            raise HTTPException(status_code=400, detail="Cannot link a contact to itself")
        _get_owned_contact(db, user, entity_id)
        exists = db.query(ContactContact).filter(
            ContactContact.contact_id == contact_id,
            ContactContact.related_contact_id == entity_id,
        ).first()
        if not exists:
            # Store both directions so the relationship is mutual.
            db.add(ContactContact(contact_id=contact_id, related_contact_id=entity_id))
            db.add(ContactContact(contact_id=entity_id, related_contact_id=contact_id))
            other = db.query(Contact).filter(Contact.id == entity_id).first()
            log_activity(db, user.id, "updated", "contact", contact.id, contact.name, details=f"linked contact: {other.name if other else entity_id}")
            db.commit()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type. Use: company, job, or contact")
    return {"message": "Relationship added"}


@router.delete("/{contact_id}/relationships/{entity_type}/{entity_id}")
def remove_relationship(
    contact_id: str,
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a relationship from a contact."""
    contact = _get_owned_contact(db, user, contact_id)
    if entity_type == "company":
        db.query(ContactCompany).filter(
            ContactCompany.contact_id == contact_id,
            ContactCompany.company_id == entity_id,
        ).delete()
    elif entity_type == "job":
        db.query(ContactJob).filter(
            ContactJob.contact_id == contact_id,
            ContactJob.job_id == entity_id,
        ).delete()
    elif entity_type == "contact":
        # Remove both directions of the mutual link.
        db.query(ContactContact).filter(
            ContactContact.contact_id == contact_id,
            ContactContact.related_contact_id == entity_id,
        ).delete()
        db.query(ContactContact).filter(
            ContactContact.contact_id == entity_id,
            ContactContact.related_contact_id == contact_id,
        ).delete()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type")
    log_activity(db, user.id, "updated", "contact", contact.id, contact.name, details=f"unlinked {entity_type}: {entity_id}")
    db.commit()
    return {"message": "Relationship removed"}


# ── Notes + tags ──────────────────────────────────────────────────────

def _validate_tags(db: Session, user: User, tags: List[dict]) -> None:
    for tag in tags:
        et = tag.get("entity_type")
        eid = tag.get("entity_id")
        if not et or not eid:
            raise HTTPException(status_code=400, detail="Each tag must have entity_type and entity_id")
        if et not in ("company", "job", "contact"):
            raise HTTPException(status_code=400, detail="Tag entity_type must be company, job, or contact")
        if et == "company":
            _get_owned_company(db, user, eid)
        elif et == "job":
            _get_owned_job(db, user, eid)
        elif et == "contact":
            _get_owned_contact(db, user, eid)


@router.get("/{contact_id}/notes", response_model=List[ContactNoteResponse])
def list_contact_notes(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all notes for a contact, including tags."""
    contact = _get_owned_contact(db, user, contact_id)
    notes = (
        db.query(ContactNote)
        .filter(ContactNote.contact_id == contact.id)
        .order_by(ContactNote.created_at.desc())
        .all()
    )
    all_tags = db.query(ContactNoteTag).filter(ContactNoteTag.note_id.in_([n.id for n in notes])).all() if notes else []
    tags_by_note: dict = {}
    for tag in all_tags:
        tags_by_note.setdefault(tag.note_id, []).append(tag)
    result = []
    for note in notes:
        tags = _note_tags_to_response(db, user, tags_by_note.get(note.id, []))
        result.append(ContactNoteResponse(
            id=note.id,
            contact_id=note.contact_id,
            note=note.note,
            created_at=note.created_at,
            tags=tags,
        ))
    return result


@router.post("/{contact_id}/notes", response_model=ContactNoteResponse)
def create_contact_note(
    contact_id: str,
    note_data: ContactNoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new note for a contact, with optional tags."""
    contact = _get_owned_contact(db, user, contact_id)
    if not note_data.note.strip():
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    tags_payload = note_data.tags or []
    if tags_payload:
        _validate_tags(db, user, tags_payload)
    note = ContactNote(contact_id=contact.id, note=note_data.note.strip())
    db.add(note)
    db.flush()
    for tag in tags_payload:
        db.add(ContactNoteTag(
            note_id=note.id,
            entity_type=tag["entity_type"],
            entity_id=tag["entity_id"],
        ))
    log_activity(db, user.id, "created", "note", note.id, f"Note on {contact.name}", details=note_data.note.strip()[:120])
    db.commit()
    db.refresh(note)
    tags = db.query(ContactNoteTag).filter(ContactNoteTag.note_id == note.id).all()
    return ContactNoteResponse(
        id=note.id,
        contact_id=note.contact_id,
        note=note.note,
        created_at=note.created_at,
        tags=_note_tags_to_response(db, user, tags),
    )


@router.patch("/{contact_id}/notes/{note_id}", response_model=ContactNoteResponse)
def update_contact_note(
    contact_id: str,
    note_id: str,
    note_data: ContactNoteUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a contact note and optionally its tags."""
    contact = _get_owned_contact(db, user, contact_id)
    note = (
        db.query(ContactNote)
        .filter(ContactNote.id == note_id, ContactNote.contact_id == contact.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.note = note_data.note.strip()
    if note_data.created_at:
        note.created_at = note_data.created_at
    if note_data.tags is not None:
        _validate_tags(db, user, note_data.tags)
        db.query(ContactNoteTag).filter(ContactNoteTag.note_id == note.id).delete()
        for tag in note_data.tags:
            db.add(ContactNoteTag(
                note_id=note.id,
                entity_type=tag["entity_type"],
                entity_id=tag["entity_id"],
            ))
    log_activity(db, user.id, "updated", "note", note.id, f"Note on {contact.name}")
    db.commit()
    db.refresh(note)
    tags = db.query(ContactNoteTag).filter(ContactNoteTag.note_id == note.id).all()
    return ContactNoteResponse(
        id=note.id,
        contact_id=note.contact_id,
        note=note.note,
        created_at=note.created_at,
        tags=_note_tags_to_response(db, user, tags),
    )


@router.delete("/{contact_id}/notes/{note_id}")
def delete_contact_note(
    contact_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a contact note."""
    contact = _get_owned_contact(db, user, contact_id)
    note = (
        db.query(ContactNote)
        .filter(ContactNote.id == note_id, ContactNote.contact_id == contact.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    log_activity(db, user.id, "deleted", "note", note.id, f"Note on {contact.name}")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
