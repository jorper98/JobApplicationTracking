from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, admin, resume, jobs, applications, analysis, data, companies, contacts, activity, notes
from app.db.database import engine
from app.models import models  # ensures all models are registered with Base
from app.startup import (
    run_backfills,
    bootstrap_admin,
)

_docs_enabled = settings.docs_enabled
app = FastAPI(
    title="JobApplicationTracker API",
    description="Track job applications, score matches, generate cover letters",
    version="1.2.11",
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
    # Run data backfills (data migrations, not schema)
    run_backfills()

    # Bootstrap admin user on fresh install
    bootstrap_admin()


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/users", tags=["Users"])
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(contacts.router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(notes.router, prefix="/api/notes", tags=["Notes"])
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