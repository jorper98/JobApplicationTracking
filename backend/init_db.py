#!/usr/bin/env python3
"""Initialize database tables directly (dev convenience script)."""
import sys
sys.path.append(".")

from app.db.database import engine, Base
from app.models.models import User, Resume, Job, JobAnalysis, Application

print("Creating all tables...")
Base.metadata.create_all(bind=engine)
print("✅ Tables created successfully!")
print("Tables:", list(Base.metadata.tables.keys()))
