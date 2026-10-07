import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings


INITIAL_REVISION = "8c061375c9cc"


def _has_rows(engine, table_name: str) -> bool:
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT 1 FROM {table_name} LIMIT 1"))
        return result.first() is not None


def main() -> int:
    engine = create_engine(settings.DATABASE_URL)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    has_app_tables = "app_settings" in tables or "jobs" in tables or "users" in tables
    has_alembic_table = "alembic_version" in tables
    has_alembic_revision = has_alembic_table and _has_rows(engine, "alembic_version")

    if has_app_tables and not has_alembic_revision:
        print(f"Existing database without Alembic marker detected; stamping {INITIAL_REVISION}.", flush=True)
        subprocess.check_call(["alembic", "stamp", INITIAL_REVISION])

    subprocess.check_call(["alembic", "upgrade", "head"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
