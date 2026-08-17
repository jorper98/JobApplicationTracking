"""In-memory sliding-window rate limiting: login/register abuse protection,
per-account lockout, and per-user AI quota.

State is per-process: with multiple uvicorn workers each worker enforces its
own limits, which is acceptable for this deployment size.
"""
from collections import defaultdict, deque
from time import monotonic

from fastapi import Depends, HTTPException, Request

from app.core.auth import get_current_user
from app.core.config import settings
from app.models.models import User

LOGIN_IP_LIMIT = 20
LOGIN_MAX_FAILED_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
REGISTER_IP_LIMIT = 5
REGISTER_WINDOW_SECONDS = 60 * 60


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, window_seconds: int) -> deque[float]:
        now = monotonic()
        queue = self._hits[key]
        while queue and now - queue[0] > window_seconds:
            queue.popleft()
        return queue

    def check_and_record(self, key: str, limit: int, window_seconds: int) -> bool:
        queue = self._prune(key, window_seconds)
        if len(queue) >= limit:
            return False
        queue.append(monotonic())
        return True

    def count(self, key: str, window_seconds: int) -> int:
        return len(self._prune(key, window_seconds))

    def record(self, key: str) -> None:
        self._hits[key].append(monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def clear(self) -> None:
        self._hits.clear()


auth_limiter = SlidingWindowLimiter()
ai_limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def login_rate_limit(request: Request) -> None:
    if not auth_limiter.check_and_record(
        f"ip:login:{client_ip(request)}", LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS
    ):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")


def register_rate_limit(request: Request) -> None:
    if not auth_limiter.check_and_record(
        f"ip:register:{client_ip(request)}", REGISTER_IP_LIMIT, REGISTER_WINDOW_SECONDS
    ):
        raise HTTPException(status_code=429, detail="Too many registrations from this address. Try again later.")


def check_account_lockout(email: str) -> None:
    if auth_limiter.count(f"lock:{email.strip().lower()}", LOGIN_WINDOW_SECONDS) >= LOGIN_MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")


def record_failed_login(email: str) -> None:
    auth_limiter.record(f"lock:{email.strip().lower()}")


def clear_login_failures(email: str) -> None:
    auth_limiter.reset(f"lock:{email.strip().lower()}")


def ai_quota_limit(user: User = Depends(get_current_user)) -> None:
    if not ai_limiter.check_and_record(f"ai:{user.id}", settings.AI_DAILY_QUOTA, 24 * 60 * 60):
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit reached ({settings.AI_DAILY_QUOTA} calls). Try again tomorrow.",
        )
