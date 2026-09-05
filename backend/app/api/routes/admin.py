from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin, hash_password
from app.core.config import settings
from app.db.database import get_db
from app.models.models import AppSetting, User
from app.services.email_service import send_email, smtp_configured

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


def normalize_email(email: str) -> str:
    return email.strip().lower()


@router.get("/")
def list_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """List all users (admin only)."""
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [_user_payload(u) for u in users]


@router.post("/")
def create_user(data: AdminCreateUser, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Create a new user (admin only)."""
    email = normalize_email(data.email)
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        email=email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        is_admin=data.is_admin,
        verified=True,  # admin-created accounts are trusted
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


_SMTP_SETTING_KEYS = (
    "smtp_host",
    "smtp_port",
    "smtp_user",
    "smtp_password",
    "smtp_from",
    "smtp_from_name",
    "smtp_bcc",
    "smtp_tls",
    "smtp_ssl",
)

_AI_SETTING_KEYS = ("gemini_model", "gemini_api_key")
_ALL_OVERRIDE_KEYS = _AI_SETTING_KEYS + _SMTP_SETTING_KEYS
# Env/default values captured once at import so a cleared override restores
# the original value instead of leaving a stale one active in memory.
_OVERRIDE_DEFAULTS = {key: getattr(settings, key.upper()) for key in _ALL_OVERRIDE_KEYS}


def apply_persisted_overrides(db: Session) -> None:
    """Load AI + SMTP overrides from app_settings into the live settings.

    An empty or missing stored value restores the env default, so clearing a
    setting in the admin UI takes effect immediately, not only after restart.
    """
    for key in _ALL_OVERRIDE_KEYS:
        row = db.get(AppSetting, key)
        attribute = key.upper()
        if row is None or row.value == "":
            setattr(settings, attribute, _OVERRIDE_DEFAULTS[key])
            continue
        current = getattr(settings, attribute)
        if isinstance(current, bool):
            setattr(settings, attribute, row.value.lower() in ("1", "true", "yes"))
        elif isinstance(current, int):
            try:
                setattr(settings, attribute, int(row.value))
            except ValueError:
                pass
        else:
            setattr(settings, attribute, row.value)


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
        _set_setting(db, "gemini_model", data.gemini_model.strip())
    if data.gemini_api_key is not None:
        _set_setting(db, "gemini_api_key", data.gemini_api_key.strip())
    db.commit()
    apply_persisted_overrides(db)

    model = _get_setting(db, "gemini_model") or settings.GEMINI_MODEL
    api_key = _get_setting(db, "gemini_api_key") or ""
    return {"gemini_model": model, "gemini_api_key_set": bool(api_key)}


class SmtpSettingsResponse(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_from: str
    smtp_from_name: str
    smtp_bcc: str
    smtp_tls: bool
    smtp_ssl: bool
    smtp_password_set: bool


class SmtpSettingsUpdate(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_user: str | None = None
    smtp_password: str | None = None  # None = keep, "" = clear
    smtp_from: str | None = None
    smtp_from_name: str | None = None
    smtp_bcc: str | None = None
    smtp_tls: bool | None = None
    smtp_ssl: bool | None = None


def _bool_setting(db: Session, key: str, default: bool) -> bool:
    value = _get_setting(db, key)
    return (value or "").lower() in ("1", "true", "yes") if value else default


def _smtp_payload(db: Session) -> dict:
    stored_password = _get_setting(db, "smtp_password")
    return {
        "smtp_host": _get_setting(db, "smtp_host") or settings.SMTP_HOST,
        "smtp_port": _get_setting(db, "smtp_port") or settings.SMTP_PORT,
        "smtp_user": _get_setting(db, "smtp_user") or settings.SMTP_USER,
        "smtp_from": _get_setting(db, "smtp_from") or settings.SMTP_FROM,
        "smtp_from_name": _get_setting(db, "smtp_from_name") or settings.SMTP_FROM_NAME,
        "smtp_bcc": _get_setting(db, "smtp_bcc") or settings.SMTP_BCC,
        "smtp_tls": _bool_setting(db, "smtp_tls", settings.SMTP_TLS),
        "smtp_ssl": _bool_setting(db, "smtp_ssl", settings.SMTP_SSL),
        "smtp_password_set": bool(stored_password),
    }


@router.get("/settings/smtp", response_model=SmtpSettingsResponse)
def get_smtp_settings(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Return the active SMTP configuration (admin only)."""
    return _smtp_payload(db)


@router.put("/settings/smtp", response_model=SmtpSettingsResponse)
def update_smtp_settings(
    data: SmtpSettingsUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Persist SMTP configuration and apply it immediately (admin only)."""
    if data.smtp_host is not None:
        _set_setting(db, "smtp_host", data.smtp_host.strip())
    if data.smtp_port is not None:
        _set_setting(db, "smtp_port", str(data.smtp_port))
    if data.smtp_user is not None:
        _set_setting(db, "smtp_user", data.smtp_user.strip())
    if data.smtp_password is not None:
        _set_setting(db, "smtp_password", data.smtp_password.strip())
    if data.smtp_from is not None:
        _set_setting(db, "smtp_from", data.smtp_from.strip())
    if data.smtp_from_name is not None:
        _set_setting(db, "smtp_from_name", data.smtp_from_name.strip())
    if data.smtp_bcc is not None:
        _set_setting(db, "smtp_bcc", data.smtp_bcc.strip())
    if data.smtp_tls is not None:
        _set_setting(db, "smtp_tls", "true" if data.smtp_tls else "false")
    if data.smtp_ssl is not None:
        _set_setting(db, "smtp_ssl", "true" if data.smtp_ssl else "false")
    db.commit()
    apply_persisted_overrides(db)
    return _smtp_payload(db)


@router.post("/settings/smtp/test")
def test_smtp_settings(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Send a test email to the current admin (admin only)."""
    apply_persisted_overrides(db)
    if not smtp_configured():
        raise HTTPException(status_code=400, detail="SMTP is not configured")
    try:
        send_email(admin.email, "JobApplicationTracker SMTP test", "<p>Your SMTP configuration works.</p>")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"SMTP test failed: {exc}")
    return {"message": f"Test email sent to {admin.email}"}


class LoginPageSettingsResponse(BaseModel):
    login_page_html: str


class LoginPageSettingsUpdate(BaseModel):
    login_page_html: str = ""


@router.get("/settings/login-page", response_model=LoginPageSettingsResponse)
def get_login_page_settings(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Return the custom HTML for the login page right panel (admin only)."""
    return {"login_page_html": _get_setting(db, "login_page_html") or ""}


@router.put("/settings/login-page", response_model=LoginPageSettingsResponse)
def update_login_page_settings(
    data: LoginPageSettingsUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Persist the custom HTML for the login page right panel (admin only)."""
    _set_setting(db, "login_page_html", data.login_page_html)
    db.commit()
    return {"login_page_html": data.login_page_html}


@router.get("/usage")
def get_ai_usage(
    user_id: str | None = Query(None, description="Filter by user id"),
    feature: str | None = Query(None, description="Filter by AI feature name"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Return the AI usage log with per-user/feature filters (admin only)."""
    from app.models.models import AIUsage

    query = db.query(AIUsage)
    if user_id:
        query = query.filter(AIUsage.user_id == user_id)
    if feature:
        query = query.filter(AIUsage.feature == feature)

    total_calls = query.count()
    prompt_tokens, completion_tokens, total_tokens, cost = (
        query.with_entities(
            func.coalesce(func.sum(AIUsage.prompt_tokens), 0),
            func.coalesce(func.sum(AIUsage.completion_tokens), 0),
            func.coalesce(func.sum(AIUsage.total_tokens), 0),
            func.coalesce(func.sum(AIUsage.cost), 0.0),
        ).one()
    )

    records = query.order_by(AIUsage.created_at.desc()).offset(offset).limit(limit).all()
    user_emails = {u.id: u.email for u in db.query(User).all()}
    users = [
        {"id": u.id, "email": u.email, "full_name": u.full_name}
        for u in db.query(User).order_by(User.email.asc()).all()
    ]
    features = [row[0] for row in db.query(AIUsage.feature).distinct().order_by(AIUsage.feature).all()]

    return {
        "summary": {
            "calls": total_calls,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cost": round(cost, 6),
        },
        "users": users,
        "features": features,
        "records": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_email": user_emails.get(r.user_id, "unknown"),
                "feature": r.feature,
                "model": r.model,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "total_tokens": r.total_tokens,
                "cost": r.cost,
                "status": r.status,
                "error": r.error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }

