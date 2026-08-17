"""Internal authentication: local JWT tokens + PBKDF2-HMAC-SHA256 password hashing."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.models import User

PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"{PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored hash (format: iterations$salt$digest)."""
    try:
        iterations, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def create_access_token(user: User) -> str:
    """Create a signed JWT for the user."""
    if not settings.JWT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="JWT_SECRET is not configured in the backend environment",
        )
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user.id, "email": user.email, "exp": expires}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: resolve the authenticated user from the Bearer
    token or the httpOnly session cookie."""
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = request.cookies.get("token", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        claims = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == claims.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: require the authenticated user to be an admin."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


