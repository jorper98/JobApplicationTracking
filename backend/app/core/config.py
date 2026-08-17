from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "JobApplicationTracker"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/job_tracker"

    # Gemini
    GEMINI_API_KEY: str = ""
    # Model used for AI features; first candidate, with real fallbacks after it.
    GEMINI_MODEL: str = "gemini-3.6-flash"
    # Fallback models tried in order when the primary is unavailable.
    GEMINI_FALLBACK_MODELS: List[str] = [
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
    ]
    # Per-user daily cap on AI calls (match analysis, cover letters, URL import)
    AI_DAILY_QUOTA: int = 40

    # Auth (internal JWT)
    # REQUIRED: set JWT_SECRET in .env. Empty default fails closed so a
    # known public secret is never used to sign tokens.
    JWT_SECRET: str = ""
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    # Session cookie flags: COOKIE_SECURE must be true when served over HTTPS.
    COOKIE_SECURE: bool = False
    # Legacy-migration bootstrap account. If DEFAULT_ADMIN_PASSWORD is empty,
    # a random password is generated and printed in the backend logs.
    DEFAULT_ADMIN_EMAIL: str = "admin@local"
    DEFAULT_ADMIN_PASSWORD: str = ""

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:8137",
        "http://127.0.0.1:8137",
    ]
    FRONTEND_URL: str = ""  # Vercel URL added in production

    # File Upload
    MAX_FILE_SIZE_MB: int = 10
    UPLOAD_DIR: str = "uploads"

    # API docs (Swagger UI / ReDoc) - disabled by default in production.
    # Set SHOW_API_DOCS=true to enable, or docs are auto-enabled when DEBUG=true.
    SHOW_API_DOCS: bool = False

    @property
    def docs_enabled(self) -> bool:
        return self.DEBUG or self.SHOW_API_DOCS

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()





