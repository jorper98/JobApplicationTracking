from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import (
    create_access_token,
    create_email_verification_token,
    decode_email_verification_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.core.config import settings
from app.core.rate_limit import (
    check_account_lockout,
    clear_login_failures,
    login_rate_limit,
    record_failed_login,
    register_rate_limit,
    resend_rate_limit,
)
from app.db.database import get_db
from app.models.models import User
from app.services.email_service import send_verification_email, smtp_configured

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str


class ResendRequest(BaseModel):
    email: str = Field(min_length=3)


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
    """Create a new account. Sends an email verification link (double
    opt-in) when SMTP is configured; otherwise auto-verifies (dev mode)."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Registration failed")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        verified=not smtp_configured(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if smtp_configured():
        token = create_email_verification_token(user.id)
        try:
            send_verification_email(user.email, token)
        except Exception as exc:
            # Never leave a half-created account behind: without the email the
            # user could never verify and would be locked out of login.
            db.delete(user)
            db.commit()
            print(f"Verification email failed to send to {user.email}:", exc)
            raise HTTPException(
                status_code=502,
                detail="Could not send the verification email. Please check the SMTP configuration and try again.",
            )
        return JSONResponse(
            status_code=201,
            content={
                "message": "Registration successful. To avoid spammers and bad actors, we need to confirm the email is really yours. Please check your inbox (or spam folders) and click the link to verify, then log in with your credentials.",
                "requires_verification": True,
            },
        )
    # SMTP not configured (e.g. local dev): auto-verify and start a session.
    token = create_access_token(user)
    response = JSONResponse(content={"access_token": token, "user": _user_payload(user)})
    _set_session_cookie(response, token)
    return response


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Verify a new user's email address via the link from the email."""
    user_id = decode_email_verification_token(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification link")
    if user.verified:
        return {"message": "Email already verified. You can log in now."}
    user.verified = True
    db.commit()
    return {"message": "Email verified. You can log in now."}


@router.post("/resend-verification")
def resend_verification(
    data: ResendRequest,
    _limit: None = Depends(resend_rate_limit),
    db: Session = Depends(get_db),
):
    """Resend the verification email (rate limited; always returns the same
    response to avoid account enumeration)."""
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if user and not user.verified and smtp_configured():
        token = create_email_verification_token(user.id)
        try:
            send_verification_email(user.email, token)
        except Exception as exc:
            print(f"Verification email failed to send to {user.email}:", exc)
            raise HTTPException(
                status_code=502,
                detail="Could not send the verification email. Please check the SMTP configuration and try again.",
            )
    return {"message": "If that email has an unverified account, a verification link has been sent. Please check your inbox (or spam folders)."}


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
    if not user.verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in. Check your inbox (or spam folders) for the verification link.",
        )
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


