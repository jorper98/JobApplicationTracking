"""Index creation utilities - ensures FK indexes and unique constraints exist."""
from sqlalchemy import text
from app.db.database import engine


def create_indexes() -> None:
    """Create FK indexes and unique constraints. Safe to run repeatedly."""
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
                "CREATE INDEX IF NOT EXISTS ix_users_reset_token_hash ON users (reset_token_hash)",
                "CREATE INDEX IF NOT EXISTS ix_contacts_user_id ON contacts (user_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_notes_contact_id ON contact_notes (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_note_tags_note_id ON contact_note_tags (note_id)",
                "CREATE INDEX IF NOT EXISTS ix_notes_user_entity ON notes (user_id, entity_type, entity_id)",
                "CREATE INDEX IF NOT EXISTS ix_note_mentions_note_id ON note_mentions (note_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_companies_contact_id ON contact_companies (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_jobs_contact_id ON contact_jobs (contact_id)",
                "CREATE INDEX IF NOT EXISTS ix_contact_contacts_contact_id ON contact_contacts (contact_id)",
                # Dedupe legacy duplicate applications before enforcing unique index
                "DELETE FROM applications a USING applications b "
                "WHERE a.user_id = b.user_id AND a.job_id = b.job_id AND a.created_at < b.created_at",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_user_job ON applications (user_id, job_id)",
            ):
                conn.execute(text(index_sql))
    except Exception as exc:
        print("Index creation failed:", exc)