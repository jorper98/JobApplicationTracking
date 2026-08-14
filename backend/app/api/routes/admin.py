from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin, hash_password
from app.db.database import get_db
from app.models.models import User

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

