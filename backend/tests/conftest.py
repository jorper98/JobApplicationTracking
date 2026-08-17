import os
import tempfile

_db_path = os.path.join(tempfile.gettempdir(), "jobtracker_test.db")
if os.path.exists(_db_path):
    os.remove(_db_path)

os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET"] = "test-secret-for-unit-tests-only-0123456789abcdefghijklmnopqrstuvwxyz"
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["DEBUG"] = "false"
os.environ["AI_DAILY_QUOTA"] = "40"

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import ai_limiter, auth_limiter


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_rate_limiters():
    auth_limiter.clear()
    ai_limiter.clear()
    yield
    auth_limiter.clear()
    ai_limiter.clear()
