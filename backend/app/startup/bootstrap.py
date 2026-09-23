"""Bootstrap utilities - creates admin user on fresh installs."""
import secrets
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.models import User
from app.core.auth import hash_password
from app.core.config import settings


def bootstrap_admin() -> None:
    """Create admin account on fresh install if no users exist."""
    try:
        db = SessionLocal()
        try:
            if db.query(User).count() == 0 and settings.DEFAULT_ADMIN_EMAIL:
                admin_password = settings.DEFAULT_ADMIN_PASSWORD or secrets.token_urlsafe(12)
                db.add(User(
                    email=settings.DEFAULT_ADMIN_EMAIL,
                    password_hash=hash_password(admin_password),
                    full_name="Admin",
                    is_admin=True,
                ))
                db.commit()
                if settings.DEFAULT_ADMIN_PASSWORD:
                    print(f"Bootstrap admin created: {settings.DEFAULT_ADMIN_EMAIL}")
                else:
                    print(f"Bootstrap admin created: {settings.DEFAULT_ADMIN_EMAIL} / {admin_password} (change it after first login)")
        finally:
            db.close()
    except Exception as exc:
        print("Admin bootstrap failed:", exc)