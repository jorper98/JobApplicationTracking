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
    payload = {"sub": user.id, "email": user.email, "type": "access", "exp": expires}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def create_email_verification_token(user_id: str, expires_hours: int = 24) -> str:
    """Create a short-lived JWT used to verify a new user's email."""
    if not settings.JWT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="JWT_SECRET is not configured in the backend environment",
        )
    expires = datetime.now(timezone.utc) + timedelta(hours=expires_hours)
    payload = {"sub": user_id, "type": "verify_email", "exp": expires}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def create_password_reset_token(expires_hours: int = 6) -> str:
    """Create an opaque token for single-use password reset links."""
    return secrets.token_urlsafe(48)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def decode_email_verification_token(token: str) -> str:
    """Decode a verification token and return the user id.

    Raises HTTPException(400) for invalid, expired, or wrong-purpose tokens.
    """
    try:
        claims = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    if claims.get("type") != "verify_email" or not claims.get("sub"):
        raise HTTPException(status_code=400, detail="Invalid verification link")
    return claims["sub"]


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

    # Only session tokens authenticate. Email verification tokens are signed
    # with the same secret and must never be usable as session credentials
    # (tokens minted before the "access" type was added have no type claim).
    if claims.get("type") not in (None, "access"):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == claims.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Double opt-in gate: unverified users cannot open sessions, even with a
    # valid token, until they confirm their email address.
    if not user.verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in. Check your inbox (or spam folders) for the verification link.",
        )
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: require the authenticated user to be an admin."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


