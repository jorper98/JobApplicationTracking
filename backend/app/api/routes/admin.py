from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin, hash_password
from app.core.config import settings
from app.db.database import get_db
from app.models.models import AppSetting, User

router = APIRouter()


class AdminCreateUser(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str | None = None
    is_admin: bool = False


class AdminUpdateUser(BaseModel):
    full_name: str | None = None
    is_admin: bool | None = None
    password: str | None = Field(default=None, min_length=6)


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _get_user_or_404(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/")
def list_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """List all users (admin only)."""
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [_user_payload(u) for u in users]


@router.post("/")
def create_user(data: AdminCreateUser, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Create a new user (admin only)."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        is_admin=data.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_payload(user)


@router.patch("/{user_id}")
def update_user(user_id: str, data: AdminUpdateUser, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Update a user (admin only): name, admin role, or password."""
    user = _get_user_or_404(db, user_id)

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_admin is not None:
        # Prevent removing admin from the last remaining admin
        if not data.is_admin and user.is_admin:
            admin_count = db.query(User).filter(User.is_admin == True).count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last admin")
        user.is_admin = data.is_admin
    if data.password:
        user.password_hash = hash_password(data.password)

    db.commit()
    db.refresh(user)
    return _user_payload(user)


@router.delete("/{user_id}")
def delete_user(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Delete a user and all their data (admin only)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = _get_user_or_404(db, user_id)
    if user.is_admin:
        admin_count = db.query(User).filter(User.is_admin == True).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


class AISettingsResponse(BaseModel):
    gemini_model: str
    gemini_api_key_set: bool


class AISettingsUpdate(BaseModel):
    gemini_model: str | None = Field(default=None, min_length=1)
    gemini_api_key: str | None = None


def _get_setting(db: Session, key: str) -> str | None:
    row = db.get(AppSetting, key)
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


@router.get("/settings/ai", response_model=AISettingsResponse)
def get_ai_settings(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Return the active AI model and whether an API key override is set (admin only)."""
    model = _get_setting(db, "gemini_model")
    api_key = _get_setting(db, "gemini_api_key")
    return {
        "gemini_model": model if model else settings.GEMINI_MODEL,
        "gemini_api_key_set": bool(api_key),
    }


@router.put("/settings/ai", response_model=AISettingsResponse)
def update_ai_settings(
    data: AISettingsUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Persist AI model/API key overrides and apply them immediately (admin only)."""
    if data.gemini_model is not None:
        _set_setting(db, "gemini_model", data.gemini_model.strip() or settings.GEMINI_MODEL)
    if data.gemini_api_key is not None:
        _set_setting(db, "gemini_api_key", data.gemini_api_key.strip())
    db.commit()

    model = _get_setting(db, "gemini_model") or settings.GEMINI_MODEL
    api_key = _get_setting(db, "gemini_api_key") or ""
    settings.GEMINI_MODEL = model
    settings.GEMINI_API_KEY = api_key
    return {"gemini_model": model, "gemini_api_key_set": bool(api_key)}

