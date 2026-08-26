from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text, func
from app.core.config import settings
from app.api.routes import auth, admin, resume, jobs, applications, analysis, data, companies, contacts, activity
from app.db.database import engine, Base
from app.models import models  # ensures all models are registered with Base

_docs_enabled = settings.docs_enabled
app = FastAPI(
    title="JobApplicationTracker API",
    description="Track job applications, score matches, generate cover letters",
    version="1.2.3",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
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
                if "verified" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN verified BOOLEAN NOT NULL DEFAULT TRUE"))
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
    # Bootstrap admin: on a fresh install with no users, create the admin
    # account from env settings so registration never grants admin.
    try:
        from app.db.database import SessionLocal
        from app.models.models import User
        from app.core.auth import hash_password
        import secrets as _secrets
        db = SessionLocal()
        try:
            if db.query(User).count() == 0 and settings.DEFAULT_ADMIN_EMAIL:
                admin_password = settings.DEFAULT_ADMIN_PASSWORD or _secrets.token_urlsafe(12)
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
    # Ensure FK indexes exist on existing databases (create_all only indexes
    # newly created tables).
    try:
        with engine.begin() as conn:
            for index_sql in (
                "CREATE INDEX IF NOT EXISTS ix_resumes_user_id ON resumes (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_job_notes_job_id ON job_notes (job_id)",
                "CREATE INDEX IF NOT EXISTS ix_job_analyses_job_id ON job_analyses (job_id)",
                "CREATE INDEX IF NOT EXISTS ix_job_analyses_resume_id ON job_analyses (resume_id)",
                "CREATE INDEX IF NOT EXISTS ix_applications_user_id ON applications (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_applications_job_id ON applications (job_id)",
                "CREATE INDEX IF NOT EXISTS ix_ai_usage_user_id ON ai_usage (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_ai_usage_feature ON ai_usage (feature)",
                "CREATE INDEX IF NOT EXISTS ix_contacts_user_id ON contacts (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_notes_contact_id ON contact_notes (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_note_tags_note_id ON contact_note_tags (note_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_companies_contact_id ON contact_companies (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_jobs_contact_id ON contact_jobs (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_contacts_contact_id ON contact_contacts (contact_id)",
                # A job is tracked exactly once. Dedupe any legacy duplicates
                # (keep the newest row) before enforcing the unique index.
                "DELETE FROM applications a USING applications b "
                "WHERE a.user_id = b.user_id AND a.job_id = b.job_id AND a.created_at < b.created_at",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_user_job ON applications (user_id, job_id)",
            ):
                conn.execute(text(index_sql))
    except Exception as exc:
        print("Index creation failed:", exc)
    # Migrate any legacy contacts.company_id / contacts.job_id single-link
    # rows into the many-to-many tables (v1.2.x one-off). Then drop the columns.
    try:
        inspector = inspect(engine)
        if "contacts" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("contacts")}
            if "company_id" in columns or "job_id" in columns:
                from app.db.database import SessionLocal
                from app.models.models import ContactCompany, ContactJob
                db = SessionLocal()
                try:
                    rows = db.execute(text(
                        "SELECT id, company_id, job_id FROM contacts "
                        "WHERE company_id IS NOT NULL OR job_id IS NOT NULL"
                    )).fetchall()
                    for contact_id, company_id, job_id in rows:
                        if company_id:
                            exists = db.query(ContactCompany).filter(
                                ContactCompany.contact_id == contact_id,
                                ContactCompany.company_id == company_id,
                            ).first()
                            if not exists:
                                db.add(ContactCompany(contact_id=contact_id, company_id=company_id))
                        if job_id:
                            exists = db.query(ContactJob).filter(
                                ContactJob.contact_id == contact_id,
                                ContactJob.job_id == job_id,
                            ).first()
                            if not exists:
                                db.add(ContactJob(contact_id=contact_id, job_id=job_id))
                    if rows:
                        db.commit()
                        print(f"Contacts relationship migration: {len(rows)} contact(s) migrated")
                except Exception as exc:
                    db.rollback()
                    print("Contact relationship migration failed:", exc)
                finally:
                    db.close()
                # Drop the legacy columns in a single transaction. Never inspect
                # the table from another connection inside this transaction: the
                # DDL lock would deadlock against it.
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE contacts DROP COLUMN IF EXISTS company_id"))
                    conn.execute(text("ALTER TABLE contacts DROP COLUMN IF EXISTS job_id"))
    except Exception as exc:
        print("Contact relationship migration setup failed:", exc)
    # Apply persisted settings overrides (admin Settings tab) on startup:
    # AI model/API key and SMTP configuration.
    try:
        from app.db.database import SessionLocal
        from app.api.routes.admin import apply_persisted_overrides
        db = SessionLocal()
        try:
            apply_persisted_overrides(db)
        finally:
            db.close()
    except Exception as exc:
        print("Settings override load failed:", exc)
    # Ensure jobs.company_id exists, then backfill company records from the
    # company name stored on each job.
    try:
        inspector = inspect(engine)
        if "jobs" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("jobs")}
            if "company_id" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN company_id VARCHAR"))
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS ix_jobs_company_id ON jobs (company_id)"
                    ))
    except Exception as exc:
        print("jobs.company_id schema check failed:", exc)
    try:
        from app.db.database import SessionLocal
        from app.models.models import Company
        db = SessionLocal()
        try:
            rows = db.execute(text(
                "SELECT j.user_id, j.company FROM jobs j "
                "WHERE j.user_id IS NOT NULL AND j.company IS NOT NULL "
                "AND j.company_id IS NULL GROUP BY j.user_id, j.company"
            )).fetchall()
            for user_id, company_name in rows:
                existing = db.query(Company).filter(
                    Company.user_id == user_id,
                    func.lower(Company.name) == company_name.strip().lower(),
                ).first()
                if not existing:
                    existing = Company(user_id=user_id, name=company_name.strip())
                    db.add(existing)
                    db.flush()
                db.execute(text(
                    "UPDATE jobs SET company_id = :cid WHERE user_id = :uid AND company_id IS NULL AND company = :name"
                ), {"cid": existing.id, "uid": user_id, "name": company_name})
            db.commit()
            print(f"Company backfill complete: {len(rows)} company name(s) processed")
        except Exception as exc:
            db.rollback()
            print("Company backfill failed:", exc)
        finally:
            db.close()
    except Exception as exc:
        print("Company backfill setup failed:", exc)
    # Migrate the legacy single Company.notes text field into per-note
    # CompanyNote records (runs once; new notes are added via the API).
    try:
        inspector = inspect(engine)
        if "companies" in inspector.get_table_names() and "company_notes" in inspector.get_table_names():
            company_columns = {col["name"] for col in inspector.get_columns("companies")}
            if "notes" in company_columns:
                from app.db.database import SessionLocal
                from app.models.models import Company, CompanyNote
                db = SessionLocal()
                try:
                    rows = db.execute(text(
                        "SELECT id, notes FROM companies "
                        "WHERE notes IS NOT NULL AND TRIM(notes) <> ''"
                    )).fetchall()
                    migrated = 0
                    for company_id, notes_text in rows:
                        exists = db.query(CompanyNote.id).filter(CompanyNote.company_id == company_id).first()
                        if exists:
                            continue
                        db.add(CompanyNote(company_id=company_id, note=notes_text))
                        migrated += 1
                    if migrated:
                        db.commit()
                        print(f"Company notes migration complete: {migrated} note(s) migrated")
                except Exception as exc:
                    db.rollback()
                    print("Company notes migration failed:", exc)
                finally:
                    db.close()
    except Exception as exc:
        print("Company notes migration setup failed:", exc)


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/users", tags=["Users"])
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(contacts.router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(activity.router, prefix="/api/activity", tags=["Activity"])

if settings.DEBUG:
    from app.api.routes import debug
    app.include_router(debug.router, prefix="/api/debug", tags=["Debug"])


@app.get("/")
async def root():
    return {"message": "JobApplicationTracker API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}














