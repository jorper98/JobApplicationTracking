from sqlalchemy.orm import Session

from app.models.models import ActivityLog


def log_activity(
    db: Session,
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    entity_name: str | None = None,
    details: str | None = None,
) -> None:
    """Append one row to the user's activity log. Callers commit."""
    db.add(
        ActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            details=details,
        )
    )
