from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.core.config import settings
from app.api.routes import auth, admin, resume, jobs, applications, analysis, data
from app.db.database import engine, Base
from app.models import models  # ensures all models are registered with Base

app = FastAPI(
    title="JobApplicationTracker API",
    description="Track job applications, score matches, generate cover letters",
    version="1.1.2",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS + ([settings.FRONTEND_URL] if settings.FRONTEND_URL else []),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Dev convenience: add jobs.user_id to databases created before the column existed.
    try:
        inspector = inspect(engine)
        if "jobs" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("jobs")}
            if "user_id" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id VARCHAR"))
    except Exception as exc:
        print("Schema compatibility check failed:", exc)
    # Adds new application status values to existing Postgres enum types.
    try:
        with engine.begin() as conn:
            result = conn.execute(text(
                "SELECT enumlabel FROM pg_enum WHERE enumtypid = "
                "(SELECT oid FROM pg_type WHERE typname = 'applicationstatus')"
            )).fetchall()
            existing = {row[0] for row in result}
            for value in ("SAVED", "NOT_PURSUED"):
                if value not in existing:
                    conn.execute(text(f"ALTER TYPE applicationstatus ADD VALUE '{value}'"))
    except Exception as exc:
        print("Application status enum check failed:", exc)
    # Normalize legacy lowercase rows. Must run in a SEPARATE transaction:
    # PostgreSQL forbids using a new enum value in the same transaction
    # that added it.
    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE applications SET status = 'SAVED' WHERE status = 'saved'"))
            conn.execute(text("UPDATE applications SET status = 'NOT_PURSUED' WHERE status = 'not_pursued'"))
    except Exception as exc:
        print("Application status normalization failed:", exc)
    # Ensure is_admin / updated_at columns exist on the users table.
    try:
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("users")}
            with engine.begin() as conn:
                if "is_admin" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE"))
    except Exception as exc:
        print("users column check failed:", exc)
    # Legacy Clerk-era schema: replace clerk_id with password_hash and link
    # existing data to a default account (admin@local / admin123).
    try:
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("users")}
            if "clerk_id" in columns:
                import uuid
                import secrets as _secrets
                from app.core.auth import hash_password
                admin_id = str(uuid.uuid4())
                admin_email = settings.DEFAULT_ADMIN_EMAIL
                admin_password = settings.DEFAULT_ADMIN_PASSWORD
                if not admin_password:
                    admin_password = _secrets.token_urlsafe(12)
                    print(f"Legacy admin account created: {admin_email} / {admin_password} (change it after first login)")
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR"))
                    conn.execute(text("ALTER TABLE users DROP COLUMN clerk_id"))
                    conn.execute(
                        text(
                            "INSERT INTO users (id, email, password_hash, full_name) "
                            "VALUES (:id, :email, :pwd, :name) ON CONFLICT (email) DO NOTHING"
                        ),
                        {"id": admin_id, "email": admin_email, "pwd": hash_password(admin_password), "name": "Admin"},
                    )
                    # Re-link data owned by legacy users (those without a password)
                    conn.execute(
                        text("UPDATE jobs SET user_id = :new_id WHERE user_id IN (SELECT id FROM users WHERE password_hash IS NULL)"),
                        {"new_id": admin_id},
                    )
                    conn.execute(
                        text("UPDATE resumes SET user_id = :new_id WHERE user_id IN (SELECT id FROM users WHERE password_hash IS NULL)"),
                        {"new_id": admin_id},
                    )
                    conn.execute(
                        text("UPDATE applications SET user_id = :new_id WHERE user_id IN (SELECT id FROM users WHERE password_hash IS NULL)"),
                        {"new_id": admin_id},
                    )
                    conn.execute(text("DELETE FROM users WHERE password_hash IS NULL"))
                    conn.execute(text("UPDATE users SET is_admin = TRUE WHERE email = :email"), {"email": "admin@local"})
                print("Legacy Clerk users migrated to admin@local / admin123")
    except Exception as exc:
        print("Users schema migration failed:", exc)
    # Backfill: every job without an application gets a "saved" application so
    # it appears on the tracker board and dashboard counts stay consistent.
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO applications (id, user_id, job_id, status, created_at) "
                "SELECT gen_random_uuid()::text, j.user_id, j.id, 'SAVED', now() "
                "FROM jobs j "
                "WHERE j.user_id IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM applications a WHERE a.job_id = j.id)"
            ))
    except Exception as exc:
        print("Saved-application backfill failed:", exc)
    # Creates any tables that do not exist yet (safe to run repeatedly)
    Base.metadata.create_all(bind=engine)


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/users", tags=["Users"])
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])

if settings.DEBUG:
    from app.api.routes import debug
    app.include_router(debug.router, prefix="/api/debug", tags=["Debug"])


@app.get("/")
async def root():
    return {"message": "JobApplicationTracker API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}














