from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_current_user, hash_password, verify_password
from app.core.config import settings
from app.core.rate_limit import (
    check_account_lockout,
    clear_login_failures,
    login_rate_limit,
    record_failed_login,
    register_rate_limit,
)
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


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="token",
        value=token,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )


@router.post("/register")
def register(
    data: RegisterRequest,
    _limit: None = Depends(register_rate_limit),
    db: Session = Depends(get_db),
):
    """Create a new account and return a session token."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Registration failed")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user)
    response = JSONResponse(content={"access_token": token, "user": _user_payload(user)})
    _set_session_cookie(response, token)
    return response


@router.post("/login")
def login(
    data: LoginRequest,
    _limit: None = Depends(login_rate_limit),
    db: Session = Depends(get_db),
):
    """Verify credentials and return a session token."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        record_failed_login(data.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    check_account_lockout(data.email)
    if not verify_password(data.password, user.password_hash):
        record_failed_login(data.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    clear_login_failures(data.email)
    token = create_access_token(user)
    response = JSONResponse(content={"access_token": token, "user": _user_payload(user)})
    _set_session_cookie(response, token)
    return response


@router.post("/logout")
def logout():
    """Clear the session cookie."""
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie(key="token", path="/")
    return response


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return _user_payload(user)


