from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db.database import get_db
from app.models.models import User

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str


def _user_payload(user: User) -> dict:
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin}


@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new account and return a session token."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    # First registered user becomes admin (bootstrap)
    is_first_user = db.query(User).count() == 0

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        is_admin=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user), "user": _user_payload(user)}


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Verify credentials and return a session token."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_access_token(user), "user": _user_payload(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return _user_payload(user)


