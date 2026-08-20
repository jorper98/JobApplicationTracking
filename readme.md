# JobApplicationTracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.2.0-green.svg)](changelog.md)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()

**AI-powered job application tracker that helps you manage your job search, analyze resume matches, and generate tailored cover letters.**

JobApplicationTracker streamlines your job hunting workflow by combining application tracking with AI insights. Upload your resume, import jobs from URLs, get match scores, identify skill gaps, and generate personalized cover letters—all in one place.

## Open Source & Managed

JobApplicationTracker is open source and ready for you to use. It is also provided as a managed application at [35sites.com/applications/job-application-tracker/](https://35sites.com/applications/job-application-tracker/) — a demo of the app is there, the same as the one from this repository!

## Features

- **Resume Management** — Upload PDF resumes with automatic AI-powered skill extraction
- **Job Tracking** — Add jobs manually or scrape from URLs with AI extraction
- **Kanban Board** — Drag-and-drop application status tracking (Saved → Applied → Interview → Offer)
- **AI Match Analysis** — Score resume-to-job matches, identify matching and missing skills
- **Cover Letter Generation** — Generate personalized cover letters tailored to each job
- **Dashboard** — Application statistics, status breakdown charts, and recent activity
- **Search & Filter** — Full-text search across jobs, notes, and skills with status/tag filters
- **Data Export/Import** — Backup and restore your data as a zip bundle
- **User Management** — Multi-user support with admin controls (JWT authentication)
- **Admin Settings** — Manage the AI model and Gemini API key from an admin-only Settings page
- **Dark Mode** — Light/dark theme toggle with system preference detection

## Tech Stack

**Backend:** FastAPI · SQLAlchemy 2.0 · PostgreSQL 15 · Google Gemini AI · PyJWT · pdfplumber

**Frontend:** Next.js 14 · TypeScript · Tailwind CSS · Recharts · react-dropzone · axios

**Infrastructure:** Docker Compose · PostgreSQL container

## Quick Start

### Prerequisites
- Docker and Docker Compose
- (Optional) Google Gemini API key for AI features

### 1. Clone the repository
```bash
git clone <repository-url>
cd JobApplicationTracker
```

### 2. Configure environment variables

Create `.env` files in both `backend/` and `frontend/` directories:

**backend/.env**
```env
DATABASE_URL=postgresql://postgres:password@db:5432/job_tracker
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_secure_random_secret_here
DEBUG=true
```

**frontend/.env**
```env
NEXT_PUBLIC_API_URL=http://localhost:8136
```

### 3. Start with Docker Compose
```bash
docker-compose up --build
```

The application will be available at:
- **Frontend:** http://localhost:8137
- **Backend API:** http://localhost:8136
- **API Docs:** http://localhost:8136/docs

### 4. Create your account

1. Open http://localhost:8137
2. Click "Create one" to register
3. On a fresh install, the admin account is created from `DEFAULT_ADMIN_EMAIL` /
   `DEFAULT_ADMIN_PASSWORD` in `backend/.env`; if the password is empty, a
   random one is generated and printed in the backend logs on first startup.
   New registrations never receive admin rights.

### 5. Start tracking jobs

1. Upload your resume (PDF) under **Resume**
2. Add jobs under **Jobs** (manually or import from URL)
3. Run AI analysis to get match scores
4. Track applications on the **Tracker** board

## Production Deployment

The Quick Start above runs the app **locally** with hot-reload. To deploy
on a VPS in production (Docker volumes, HTTPS via reverse proxy, backups,
admin system backup/restore), follow the
[Production Deployment Guide](PRODUCTION_DEPLOYMENT_GUIDE.md).

## Sample Data

A ready-to-import sample dataset lives in [`sample_data/`](sample_data/): **10 jobs** across every tracker status, **3 resume versions** with extracted skills and PDFs, **12 AI match analyses** (several with cover letters), and **14 notes**.

To import: log in, open **Data → Import Backup**, choose `sample_data/job-tracker-sample.zip`.

> **Warning:** Import replaces **all** of your current data. Use it on a fresh account, or export a backup first.

Rebuild the zip after editing `data.json` (Python 3.10+): `python sample_data/build_sample.py`

## API Documentation

Interactive API docs: http://localhost:8136/docs (local dev only — disabled by default in production for security; set `SHOW_API_DOCS=true` in `.env.prod` to enable, see the [Production Deployment Guide](PRODUCTION_DEPLOYMENT_GUIDE.md)). Key groups: auth (`/api/auth/*`), jobs (`/api/jobs/*`), analysis (`/api/analysis/*`), kanban (`/api/applications/kanban`), data export/import (`/api/data/*`).

## Development

### Docker (recommended)

The dev `docker-compose.yml` mounts the code into the containers, so most
changes are picked up automatically:

- **Backend changes** — any file in `backend/app/` (uvicorn `--reload` auto-restarts)
- **Frontend changes** — any file in `frontend/src/` (Next.js hot-reloads)

Just edit and save. **No rebuild is needed for code changes.** Rebuild
when you change dependencies or Docker configuration (e.g. edited
`requirements.txt`, `package.json`, a `Dockerfile`, or `docker-compose.yml`).

```bash
docker-compose up                 # start services
docker-compose up --build         # rebuild images + start
docker-compose up -d              # start in background
docker-compose down               # stop services
docker-compose down -v            # stop and delete volumes (fresh start)
docker-compose logs -f backend    # follow backend logs
docker-compose restart backend    # restart a single service
docker-compose up --build backend # rebuild a single service
```

### Backend only

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8136
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the existing style and includes appropriate tests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## AI Disclaimer

This codebase was developed with the assistance of AI tools and should be reviewed and tested accordingly before production use. AI prompts treat user-supplied content (resumes, job descriptions, scraped pages) as untrusted data with injection guardrails, and AI output is used as data only — it never executes or drives control flow.

## Author

**Jorge Pereira**  
[35sites.com LLC](https://35sites.com/)

## Original Repository

This project is a heavily modified fork of
[Job-Application-Tracker](https://github.com/iansiosontech/Job-Application-Tracker)
by [Kristoffer Ian Sioson](https://github.com/iansiosontech) — credit goes to
him for the original application.

It has been heavily modified from the original repository, with new features
and improvements. The changes include a more user-friendly interface, better
data validation, and enhanced security measures. Additionally, the codebase
has been refactored for better readability and maintainability.

---

**Version:** 1.1.9  
**Last Updated:** 2026-08-16
