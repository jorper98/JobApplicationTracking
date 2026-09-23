"""Startup modules for application initialization."""

from app.startup.migrations import run_schema_migrations
from app.startup.bootstrap import bootstrap_admin
from app.startup.indexes import create_indexes
from app.startup.backfills import run_backfills

__all__ = [
    "run_schema_migrations",
    "bootstrap_admin",
    "create_indexes",
    "run_backfills",
]