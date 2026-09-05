from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from app.core.auth import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_email_verification_token,
    get_current_user,
    hash_reset_token,
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
from app.models.models import AppSetting, User
from app.services.email_service import send_password_reset_email, send_verification_email, smtp_configured

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


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    password: str = Field(min_length=6)


class ProfileUpdateRequest(BaseModel):
    email: str | None = Field(default=None, min_length=3)
    full_name: str | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=6)


DEFAULT_WELCOME_TITLE = "Welcome to JobApplicationTracker"
DEFAULT_WELCOME_HTML = """
<p>JobApplicationTracker helps you organize your job search from first lead to final decision.</p>
<h3>How to get started</h3>
<ol>
  <li>Upload your resume so the app can extract your skills.</li>
  <li>Add jobs manually or import a job posting URL.</li>
  <li>Run match analysis to compare your resume against each job.</li>
  <li>Track each opportunity on the application tracker board.</li>
  <li>Use Companies, Contacts, Notes, and Activity to keep every detail in one place.</li>
</ol>
<p>You can update your profile from your name in the top-right header.</p>
""".strip()


def _user_payload(user: User) -> dict:
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin}


def _get_setting(db: Session, key: str) -> str | None:
    row = db.get(AppSetting, key)
    return row.value if row else None


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


def normalize_email(email: str) -> str:
    return email.strip().lower()


def require_normalized_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized:
        raise HTTPException(status_code=400, detail="Email is required")
    return normalized


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()


@router.post("/register")
def register(
    data: RegisterRequest,
    _limit: None = Depends(register_rate_limit),
    db: Session = Depends(get_db),
):
    """Create a new account. Sends an email verification link (double
    opt-in) when SMTP is configured; otherwise auto-verifies (dev mode)."""
    email = require_normalized_email(data.email)
    existing = find_user_by_email(db, email)
    if existing:
        raise HTTPException(status_code=400, detail="Registration failed")

    user = User(
        email=email,
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
    email = require_normalized_email(data.email)
    user = find_user_by_email(db, email)
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
    email = require_normalized_email(data.email)
    user = find_user_by_email(db, email)
    if not user:
        record_failed_login(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    check_account_lockout(email)
    if not verify_password(data.password, user.password_hash):
        record_failed_login(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in. Check your inbox (or spam folders) for the verification link.",
        )
    clear_login_failures(email)
    token = create_access_token(user)
    response = JSONResponse(content={"access_token": token, "user": _user_payload(user)})
    _set_session_cookie(response, token)
    return response


@router.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordRequest,
    _limit: None = Depends(resend_rate_limit),
    db: Session = Depends(get_db),
):
    """Send a single-use password reset link when the account exists."""
    generic = {"message": "If that email has an account, a password reset link has been sent. Please check your inbox."}
    if not smtp_configured():
        raise HTTPException(status_code=503, detail="Password reset email is not available because SMTP is not configured")

    email = require_normalized_email(data.email)
    user = find_user_by_email(db, email)
    if not user:
        return generic

    token = create_password_reset_token()
    user.reset_token_hash = hash_reset_token(token)
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=6)
    db.commit()
    try:
        send_password_reset_email(user.email, token)
    except Exception as exc:
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        db.commit()
        print(f"Password reset email failed to send to {user.email}:", exc)
        raise HTTPException(status_code=502, detail="Could not send the password reset email. Please try again later.")
    return generic


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset a password using a valid, unexpired, single-use reset token."""
    token_hash = hash_reset_token(data.token)
    user = db.query(User).filter(User.reset_token_hash == token_hash).first()
    if not user or not user.reset_token_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link")

    expires_at = user.reset_token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link")

    user.password_hash = hash_password(data.password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    db.commit()
    return {"message": "Password updated. You can log in with your new password."}


@router.patch("/profile")
def update_profile(data: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update the signed-in user's profile. Password/email changes require the current password."""
    changing_email = data.email is not None and normalize_email(data.email) != user.email.lower()
    changing_password = bool(data.new_password)
    if (changing_email or changing_password) and not verify_password(data.current_password or "", user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is required to change email or password")

    if data.full_name is not None:
        user.full_name = data.full_name.strip() or None
    if changing_email:
        email = require_normalized_email(data.email or "")
        existing = find_user_by_email(db, email)
        if existing and existing.id != user.id:
            raise HTTPException(status_code=400, detail="An account with this email already exists")
        user.email = email
        user.verified = not smtp_configured()
    if changing_password:
        user.password_hash = hash_password(data.new_password or "")
        user.reset_token_hash = None
        user.reset_token_expires_at = None

    if changing_email and smtp_configured():
        token = create_email_verification_token(user.id)
        try:
            send_verification_email(user.email, token)
        except Exception as exc:
            db.rollback()
            print(f"Profile email verification failed to send to {user.email}:", exc)
            raise HTTPException(status_code=502, detail="Could not send the verification email. Please try again later.")

    db.commit()
    db.refresh(user)
    payload = _user_payload(user)
    if changing_email and smtp_configured():
        payload["requires_verification"] = True
    return payload


@router.get("/welcome")
def get_welcome(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return first-login welcome modal content until dismissed by this user."""
    return {
        "show": user.welcome_seen_at is None,
        "title": _get_setting(db, "welcome_modal_title") or DEFAULT_WELCOME_TITLE,
        "html": _get_setting(db, "welcome_modal_html") or DEFAULT_WELCOME_HTML,
    }


@router.post("/welcome/dismiss")
def dismiss_welcome(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark the first-login welcome modal as seen for this user."""
    if user.welcome_seen_at is None:
        user.welcome_seen_at = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Welcome dismissed"}


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


@router.get("/login-page")
def login_page(db: Session = Depends(get_db)):
    """Return the admin-configured custom HTML for the login page right
    panel (public, no auth required)."""
    row = db.get(AppSetting, "login_page_html")
    return {"login_page_html": row.value if row else ""}


