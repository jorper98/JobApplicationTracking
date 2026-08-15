# Changelog

## v1.1.4

### Deployment

- Added production deployment files: ackend/Dockerfile.prod, rontend/Dockerfile.prod, and the production compose file
- Added distribution/ folder for release packaging (gitignored; contains compose, env template, build script, and generated zip)
- Added distribution/create-distribution.ps1 to build jobtracker-distribution-v{version}.zip for server deployment
- Production compose exposes backend/frontend ports for Nginx Proxy Manager bridge access and uses hardened Docker images

### Jobs page

- Jobs page now uses a wider layout — the detail panel (Notes | Resumes tabs) is at least 1400px, and the page grows up to 1920px on large monitors
- Header title and version now link to the Dashboard
- Fixed: job search now filters by note content immediately after notes are added, edited, or deleted (search index stays in sync)

## v1.1.3

### Analysis per resume

- Match analysis is now saved per (job, resume) pair — one analysis per resume per job
- Re-running "Analyze Job" for the same job/resume combination updates the existing analysis in place instead of creating duplicates
- Resume selector on the Jobs page picks which resume to analyze against (defaults to the active resume)
- Saved analyses are shown for the selected resume; switching resumes loads that resume's analysis if one exists
- Analysis panel displays the resume filename the results were analyzed against

### Jobs detail tabs

- Job detail panel now uses Notes | Resumes tabs (with counts) instead of a stacked notes + analysis layout
- Resumes tab lists all resumes with match %, matching/missing skill pills, and per-row Analyze/Re-analyze, Cover Letter, and Details actions
- Resumes tab sorts active resume first, then analyzed by score desc, then unanalyzed alphabetically
- Notes tab keeps the add composer and adds inline Edit (shared modal) and Delete actions for each note
- New drawer (slide-over) shows the full analysis for one resume: score, skills, suggestions, cover letter with Generate/Regenerate
- Removed the single-resume selector and Analyze Job button from the job header — analysis actions now live in the Resumes tab rows

### Dashboard

- Stat cards are now compact squares showing count + label
- Removed the Avg Match card
- Added an Archived card (Rejected + Not Pursued + Ghosted combined)

### Sample data

- Added `sample_data/` with a ready-to-import sample dataset (10 jobs across all statuses, 3 resume versions, 12 analyses, 14 notes)
- `sample_data/job-tracker-sample.zip` imports through the Data page (Import Backup); import replaces all current data
- `sample_data/build_sample.py` rebuilds the zip (and resume PDFs) from `data.json`

## v1.1.2

### Jobs page

- Add/Edit job now uses a modal with two modes: Add Manually and Import from URL
- Search across all fields (title, company, location, URL, description, skills, notes)
- Filter by application status (Saved, Applied, Interview, etc.)
- Filter by extracted skill tags
- Clicking a job selects it and loads saved analysis (no auto-analysis)
- Analysis results are persisted and loaded when selecting a job
- "Analyze Job" button is the only way to run/replace an analysis

## v1.1.0

### UI

- Light theme is now the default, with a dark/light toggle in the header
- New header, top navigation (replaces the left sidebar), and footer
- Footer credit: By Jorge Pereira (35sites.com LLC)
- Sign out button in the header
- Dashboard greeting no longer appends ", there"
- Dashboard now shows Saved jobs count and resume count
- Register form: Name field moved below Password

### Authentication

- Replaced Clerk with internal email/password authentication
- Login and register pages
- JWT sessions (7-day expiry) with PBKDF2-HMAC-SHA256 password hashing
- First registered user becomes admin
- Admin user management page (CRUD users, promote/demote, reset password)
- Default migrated account: admin@local / In1tial$Passw0rd

### Workflow

- New Saved status and tracker column (research first, apply later)
- Analysis is informational only; jobs land in Saved, not auto-Applied
- Optional AI analysis checkbox when adding a job (default on)
- Job delete now cascades analyses and applications

### Other

- Clear All Data option on the Data page
- Data page now uses the same header/nav/footer as the rest of the app
- Gemini model defaults updated to current models (gemini-3.6-flash)
- Per-request token refresh; 401 retry
- Docker .dockerignore files (faster frontend rebuilds)

## v1.0.0

### Initial Release

- Job Application Tracker with AI-powered features
- Resume upload (PDF) with AI skill extraction
- Job posting management with URL scraping
- AI match analysis between resumes and job descriptions
- Cover letter generation
- Kanban-style application tracker with drag-and-drop
- Dashboard with application statistics and charts
- Data export/import functionality (zip bundle)
- Docker Compose setup for local development

### Security & Auth

- Clerk JWT authentication wired end-to-end
- All API routes scoped by user_id
- Mock user pattern removed
- Debug router gated behind DEBUG setting
- Zip-slip vulnerability fixed in import (basename-only extraction + path guard)
- Import payload validated before any data deletion
- Transactional import with rollback on failure
- Upload size limits (200MB) and zip-bomb protection (1GB cap)
- Enum serialization fixed in export

### Bug Fixes

- Resume upload filename collision fixed (UUID prefix)
- PATCH /api/jobs/{id} no longer 500s on explicit null fields
- API base URL mismatch fixed (8000 → 8136)
- datetime.utcnow() replaced with datetime.now(timezone.utc)

### Backend

- FastAPI with PostgreSQL
- SQLAlchemy ORM with auto-migration for existing databases
- Clerk JWT verification via JWKS (PyJWT + cryptography)
- Google Gemini AI integration for skill extraction and analysis
- PDF text extraction with pdfplumber
- URL scraping with BeautifulSoup

### Frontend

- Next.js 14 with TypeScript
- Tailwind CSS for styling
- Clerk authentication (middleware + provider)
- Axios client with auth token interceptor
- Recharts for dashboard visualizations
- React Dropzone for resume uploads


