# JobApplicationTracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.1.4-green.svg)](changelog.md)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()

**AI-powered job application tracker that helps you manage your job search, analyze resume matches, and generate tailored cover letters.**

JobApplicationTracker streamlines your job hunting workflow by combining application tracking with AI insights. Upload your resume, import jobs from URLs, get match scores, identify skill gaps, and generate personalized cover letters—all in one place.

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
- **Dark Mode** — Light/dark theme toggle with system preference detection

## Tech Stack

### Backend
- **FastAPI** — Modern Python web framework
- **SQLAlchemy 2.0** — Database ORM with async support
- **PostgreSQL 15** — Relational database
- **Google Gemini AI** — AI model for skill extraction, match analysis, and cover letters
- **PyJWT** — JWT-based authentication with PBKDF2-HMAC-SHA256 password hashing
- **pdfplumber** — PDF text extraction
- **BeautifulSoup + httpx** — Web scraping for job posting URLs

### Frontend
- **Next.js 14** — React framework with App Router
- **TypeScript** — Type-safe development
- **Tailwind CSS** — Utility-first styling
- **Recharts** — Data visualization (dashboard charts)
- **react-dropzone** — Drag-and-drop file uploads
- **axios** — HTTP client with interceptors

### Infrastructure
- **Docker Compose** — Containerized development environment
- **PostgreSQL Docker** — Database container

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
3. The first registered user automatically becomes an admin

### 5. Start tracking jobs

1. Upload your resume (PDF) under **Resume**
2. Add jobs under **Jobs** (manually or import from URL)
3. Run AI analysis to get match scores
4. Track applications on the **Tracker** board

## Sample Data

A ready-to-import sample dataset lives in the [`sample_data/`](sample_data/) folder so you can explore every feature without entering data by hand:

- `sample_data/data.json` — the raw dataset (jobs, resumes, applications, analyses, notes)
- `sample_data/uploads/` — sample resume PDFs
- `sample_data/job-tracker-sample.zip` — the importable bundle (what you upload)
- `sample_data/build_sample.py` — rebuilds the zip from `data.json`

What's included:

- **10 jobs** (Stripe, Vercel, Snowflake, Datadog, Cloudflare, HashiCorp, Notion, Linear, Airbnb, OpenAI) covering every tracker status: saved, applied, interview, offer, rejected, ghosted, not_pursued
- **3 resume versions** (software engineer, data engineer, engineering lead) with extracted skills and matching PDFs
- **12 match analyses** across job/resume pairs, several with ready-to-read cover letters
- **14 notes** attached to jobs (recruiter screens, follow-ups, offers, rejections)

### How to import

1. Start the app and log in
2. Open the **Data** page (Export / Import Data) from the top navigation
3. Under **Import Backup**, choose `sample_data/job-tracker-sample.zip`
4. Wait for "Import complete", then reload the app

> **Warning:** Import replaces **all** of your current data (jobs, resumes, applications, analyses, notes, and uploaded files) with the contents of the archive. Use it on a fresh account, or export a backup first with **Export Backup**.

To rebuild the zip after editing `data.json` (requires Python 3.10+):

```bash
python sample_data/build_sample.py
```

## API Documentation

Interactive API documentation is available at http://localhost:8136/docs when the backend is running.

Key endpoints:
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Authenticate
- `POST /api/resume/upload` — Upload resume
- `POST /api/jobs/` — Create job
- `POST /api/jobs/from-url` — Import job from URL
- `POST /api/analysis/match` — Analyze resume-job match
- `POST /api/analysis/{id}/cover-letter` — Generate cover letter
- `GET /api/applications/kanban` — Get Kanban board data
- `GET /api/data/export` — Export data as zip
- `POST /api/data/import` — Import data from zip

## Project Structure

```
JobApplicationTracker/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers
│   │   ├── core/             # Config, auth, database
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic (AI, resume)
│   │   └── main.py           # FastAPI app entry point
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js pages
│   │   ├── components/       # React components
│   │   ├── context/          # Auth context
│   │   └── lib/              # API client, utilities
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── readme.md
└── sample_data/               # Sample dataset + import bundle (see Sample Data section)
```

## Development

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

## Author

**Jorge Pereira**  
[35sites.com LLC](https://35sites.com/)

---

**Version:** 1.1.4  
**Last Updated:** 2026-08-14
