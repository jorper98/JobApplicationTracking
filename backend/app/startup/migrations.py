"""Schema migration utilities - runs on startup to ensure database compatibility."""
import uuid
import secrets
from sqlalchemy import inspect, text, func
from app.db.database import engine, SessionLocal, Base
from app.core.config import settings
from app.core.auth import hash_password
from app.models import models
from app.models.models import User, ApplicationStatus, ContactCompany, ContactJob, Company, CompanyNote, Job, JobNote, ContactNote, ContactNoteTag, Note, NoteMention


def run_schema_migrations() -> None:
    """Run all schema compatibility migrations. Safe to run repeatedly."""
    _add_jobs_user_id_column()
    _add_application_status_enums()
    _normalize_application_statuses()
    _ensure_users_columns()
    _migrate_legacy_clerk_users()
    _ensure_jobs_company_id_column()
    _migrate_contacts_relationships()
    _migrate_company_notes()
    _migrate_centralized_notes()
    _apply_persisted_settings()
    Base.metadata.create_all(bind=engine)


def _add_jobs_user_id_column() -> None:
    """Add user_id column to jobs table if missing."""
    try:
        inspector = inspect(engine)
        if "jobs" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("jobs")}
            if "user_id" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id VARCHAR"))
    except Exception as exc:
        print("Schema compatibility check failed:", exc)


def _add_application_status_enums() -> None:
    """Add new application status enum values if missing."""
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


def _normalize_application_statuses() -> None:
    """Normalize legacy lowercase status values. Must run in separate transaction."""
    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE applications SET status = 'SAVED' WHERE status = 'saved'"))
            conn.execute(text("UPDATE applications SET status = 'NOT_PURSUED' WHERE status = 'not_pursued'"))
    except Exception as exc:
        print("Application status normalization failed:", exc)


def _ensure_users_columns() -> None:
    """Ensure all required columns exist on users table."""
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
                if "reset_token_hash" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR"))
                if "reset_token_expires_at" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP WITH TIME ZONE"))
                if "welcome_seen_at" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN welcome_seen_at TIMESTAMP WITH TIME ZONE"))
    except Exception as exc:
        print("users column check failed:", exc)


def _migrate_legacy_clerk_users() -> None:
    """Migrate legacy Clerk-era schema to password-based auth."""
    try:
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("users")}
            if "clerk_id" in columns:
                admin_id = str(uuid.uuid4())
                admin_email = settings.DEFAULT_ADMIN_EMAIL
                admin_password = settings.DEFAULT_ADMIN_PASSWORD
                if not admin_password:
                    admin_password = secrets.token_urlsafe(12)
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
                    # Re-link data owned by legacy users
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


def _ensure_jobs_company_id_column() -> None:
    """Ensure jobs.company_id column exists."""
    try:
        inspector = inspect(engine)
        if "jobs" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("jobs")}
            if "company_id" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN company_id VARCHAR"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_jobs_company_id ON jobs (company_id)"))
    except Exception as exc:
        print("jobs.company_id schema check failed:", exc)


def _migrate_contacts_relationships() -> None:
    """Migrate legacy single-link contacts to many-to-many tables."""
    try:
        inspector = inspect(engine)
        if "contacts" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("contacts")}
            if "company_id" in columns or "job_id" in columns:
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
                # Drop legacy columns
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE contacts DROP COLUMN IF EXISTS company_id"))
                    conn.execute(text("ALTER TABLE contacts DROP COLUMN IF EXISTS job_id"))
    except Exception as exc:
        print("Contact relationship migration setup failed:", exc)


def _migrate_company_notes() -> None:
    """Migrate legacy Company.notes to CompanyNote records."""
    try:
        inspector = inspect(engine)
        if "companies" in inspector.get_table_names() and "company_notes" in inspector.get_table_names():
            company_columns = {col["name"] for col in inspector.get_columns("companies")}
            if "notes" in company_columns:
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


def _migrate_centralized_notes() -> None:
    """Migrate entity-specific note tables into centralized notes model."""
    try:
        db = SessionLocal()
        try:
            migrated = 0
            # Job notes
            for job_note in db.query(JobNote).join(models.Job, models.Job.id == JobNote.job_id).all():
                exists = db.query(Note.id).filter(Note.legacy_source == "job_notes", Note.legacy_id == job_note.id).first()
                if not exists and job_note.job and job_note.job.user_id:
                    db.add(Note(
                        user_id=job_note.job.user_id,
                        entity_type="job",
                        entity_id=job_note.job_id,
                        note=job_note.note,
                        legacy_source="job_notes",
                        legacy_id=job_note.id,
                        created_at=job_note.created_at,
                    ))
                    migrated += 1
            # Company notes
            for company_note in db.query(CompanyNote).join(models.Company, models.Company.id == CompanyNote.company_id).all():
                exists = db.query(Note.id).filter(Note.legacy_source == "company_notes", Note.legacy_id == company_note.id).first()
                if not exists and company_note.company and company_note.company.user_id:
                    db.add(Note(
                        user_id=company_note.company.user_id,
                        entity_type="company",
                        entity_id=company_note.company_id,
                        note=company_note.note,
                        legacy_source="company_notes",
                        legacy_id=company_note.id,
                        created_at=company_note.created_at,
                    ))
                    migrated += 1
            # Contact notes
            contact_notes = db.query(ContactNote).join(models.Contact, models.Contact.id == ContactNote.contact_id).all()
            for contact_note in contact_notes:
                exists = db.query(Note.id).filter(Note.legacy_source == "contact_notes", Note.legacy_id == contact_note.id).first()
                if not exists and contact_note.contact and contact_note.contact.user_id:
                    db.add(Note(
                        user_id=contact_note.contact.user_id,
                        entity_type="contact",
                        entity_id=contact_note.contact_id,
                        note=contact_note.note,
                        legacy_source="contact_notes",
                        legacy_id=contact_note.id,
                        created_at=contact_note.created_at,
                    ))
                    migrated += 1
            db.flush()
            # Migrate contact note tags to mentions
            contact_note_map = {
                note.legacy_id: note.id
                for note in db.query(Note).filter(Note.legacy_source == "contact_notes").all()
                if note.legacy_id
            }
            for tag in db.query(ContactNoteTag).all():
                note_id = contact_note_map.get(tag.note_id)
                if not note_id:
                    continue
                exists = db.query(NoteMention.id).filter(
                    NoteMention.note_id == note_id,
                    NoteMention.entity_type == tag.entity_type,
                    NoteMention.entity_id == tag.entity_id,
                ).first()
                if not exists:
                    db.add(NoteMention(note_id=note_id, entity_type=tag.entity_type, entity_id=tag.entity_id))
            if migrated:
                db.commit()
                print(f"Centralized notes migration complete: {migrated} note(s) migrated")
            else:
                db.rollback()
        except Exception as exc:
            db.rollback()
            print("Centralized notes migration failed:", exc)
        finally:
            db.close()
    except Exception as exc:
        print("Centralized notes migration setup failed:", exc)


def _apply_persisted_settings() -> None:
    """Apply persisted settings overrides (AI model/API key, SMTP)."""
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