from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.activity import log_activity
from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.models import Company, Contact, Job, Note, NoteMention, User
from app.schemas.schemas import NoteCreate, NoteMentionPayload, NoteResponse, NoteUpdate

router = APIRouter()

ENTITY_TYPES = ("company", "job", "contact")


def _owned_entity(db: Session, user: User, entity_type: str, entity_id: str):
    if entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type must be company, job, or contact")
    if entity_type == "company":
        entity = db.query(Company).filter(Company.id == entity_id, Company.user_id == user.id).first()
    elif entity_type == "job":
        entity = db.query(Job).filter(Job.id == entity_id, Job.user_id == user.id).first()
    else:
        entity = db.query(Contact).filter(Contact.id == entity_id, Contact.user_id == user.id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    return entity


def _entity_name(db: Session, entity_type: str, entity_id: str) -> str | None:
    if entity_type == "company":
        row = db.query(Company.name).filter(Company.id == entity_id).first()
    elif entity_type == "job":
        row = db.query(Job.title).filter(Job.id == entity_id).first()
    elif entity_type == "contact":
        row = db.query(Contact.name).filter(Contact.id == entity_id).first()
    else:
        row = None
    return row[0] if row else None


def _mention_payload(data: NoteCreate | NoteUpdate) -> list[NoteMentionPayload]:
    return data.mentions if data.mentions is not None else data.tags or []


def _validate_mentions(db: Session, user: User, mentions: list[NoteMentionPayload]) -> None:
    for mention in mentions:
        _owned_entity(db, user, mention.entity_type, mention.entity_id)


def _note_response(db: Session, note: Note) -> NoteResponse:
    mentions = [
        {
            "id": mention.id,
            "entity_type": mention.entity_type,
            "entity_id": mention.entity_id,
            "entity_name": _entity_name(db, mention.entity_type, mention.entity_id),
        }
        for mention in note.mentions
    ]
    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        entity_type=note.entity_type,
        entity_id=note.entity_id,
        note=note.note,
        created_at=note.created_at,
        updated_at=note.updated_at,
        mentions=mentions,
        tags=mentions,
        job_id=note.entity_id if note.entity_type == "job" else None,
        company_id=note.entity_id if note.entity_type == "company" else None,
        contact_id=note.entity_id if note.entity_type == "contact" else None,
    )


def _note_or_404(db: Session, user: User, note_id: str) -> Note:
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("/", response_model=list[NoteResponse])
def list_notes(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_entity(db, user, entity_type, entity_id)
    rows = (
        db.query(Note)
        .filter(Note.user_id == user.id, Note.entity_type == entity_type, Note.entity_id == entity_id)
        .order_by(Note.created_at.desc())
        .all()
    )
    return [_note_response(db, note) for note in rows]


@router.post("/", response_model=NoteResponse)
def create_note(data: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entity = _owned_entity(db, user, data.entity_type, data.entity_id)
    mentions = _mention_payload(data)
    _validate_mentions(db, user, mentions)
    note_text = data.note.strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Note cannot be empty")

    note = Note(user_id=user.id, entity_type=data.entity_type, entity_id=data.entity_id, note=note_text)
    db.add(note)
    db.flush()
    for mention in mentions:
        db.add(NoteMention(note_id=note.id, entity_type=mention.entity_type, entity_id=mention.entity_id))
    log_activity(db, user.id, "created", "note", note.id, f"Note on {getattr(entity, 'name', getattr(entity, 'title', 'record'))}", details=note_text[:120])
    db.commit()
    db.refresh(note)
    return _note_response(db, note)


@router.patch("/{note_id}", response_model=NoteResponse)
def update_note(note_id: str, data: NoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = _note_or_404(db, user, note_id)
    note_text = data.note.strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    note.note = note_text
    if data.created_at is not None:
        note.created_at = data.created_at
    mentions = data.mentions if data.mentions is not None else data.tags
    if mentions is not None:
        _validate_mentions(db, user, mentions)
        db.query(NoteMention).filter(NoteMention.note_id == note.id).delete()
        for mention in mentions:
            db.add(NoteMention(note_id=note.id, entity_type=mention.entity_type, entity_id=mention.entity_id))
    log_activity(db, user.id, "updated", "note", note.id, "Note")
    db.commit()
    db.refresh(note)
    return _note_response(db, note)


@router.delete("/{note_id}")
def delete_note(note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = _note_or_404(db, user, note_id)
    log_activity(db, user.id, "deleted", "note", note.id, "Note")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
