"""Data backfill utilities - populates missing data on startup."""
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from app.db.database import engine, SessionLocal
from app.models.models import Company, Job, Application


def run_backfills() -> None:
    """Run all data backfills. Safe to run repeatedly."""
    _backfill_saved_applications()
    _backfill_company_records()


def _backfill_saved_applications() -> None:
    """Ensure every job without an application gets a 'saved' application."""
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


def _backfill_company_records() -> None:
    """Create company records from job company names and link jobs to them."""
    try:
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