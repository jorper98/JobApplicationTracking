# Changelog

## v1.2.6

### Security and reliability

- Hardened backup import and system restore so uploaded files are staged first,
  previous upload directories are preserved for rollback, and database/file
  changes no longer leave partial restores on failure
- Sanitized admin-configured login page HTML before rendering to remove unsafe
  tags, event handlers, and scriptable link schemes
- Normalized imported application statuses so exported backups restore cleanly
  across database backends
- Normalized email handling across registration, login, verification resend,
  and admin-created users to avoid case-sensitive duplicate accounts
- Hardened job URL fetching by disabling environment proxy use, revalidating
  redirect targets, and removing uncontrolled Playwright fallback fetching
- Resume uploads now clean up saved files and return controlled errors when PDF
  parsing fails or no text can be extracted

### Usability

- Preserved tracker status when editing jobs from the Companies page
- Added keyboard-accessible tracker status controls for changing application
  status without drag and drop
- Guarded Jobs page analysis rendering against nullable backend arrays and
  prevented stale detail responses from overwriting a newer selected job

### Version bump

- Version bumped to 1.2.6

## v1.2.5

### Features

- Dashboard stat boxes are now clickable and deep-link to their pages: Jobs,
  Applications (Tracker), Companies, Contacts, and Resumes; each stat box
  also shows a small note count under Jobs, Applications, Companies, and
  Contacts
- Dashboard Status Breakdown rows are clickable and open the Jobs page
  pre-filtered to that status (`/jobs?status=...`)
- Dashboard search bar above Recent Applications: searches jobs, companies,
  and contacts (including note text) with a type icon per result
  (briefcase / building / person) and deep-links to the selected record;
  recent application rows are now clickable and open that job
- Tracker board refactor: all columns now share one board with the archive
  columns (Rejected, Ghosted, Not Pursued) collapsed to compact vertical
  strips by default, so cards move between pipelines without switching views;
  Pipeline and Archive buttons in the control bar show live totals and expand
  or collapse their group with one click
- Tracker columns: card lists scroll independently (fixed max height), empty
  columns use a subtle compact drop zone that expands while a card is dragged
  over, and each column can be collapsed/expanded individually
- Tracker "Compact View" toggle renders cards as single-line items; the view
  mode, compact setting, and collapsed columns persist in localStorage
- Tracker cards: an eye icon opens a job preview modal without leaving the
  page (title, company, company notes, location, date added, status, tags,
  notes, and a collapsible description)
- Note count badges on cards: the tracker board and the Jobs, Companies, and
  Contacts list pages show a small count in the top-right corner of each card
  that has notes; the Jobs/Companies/Contacts list and detail APIs return the
  counts, so no extra requests are needed

### Bug fixes

- The job description popup no longer scrolls the page behind it: body
  scroll is locked while open and long descriptions scroll inside the modal
- Closing the Add Job modal (cancel or save) now strips the lingering
  `?new=true` from the URL so the modal no longer re-opens on navigation
  or refresh
- Dashboard note counts were inflated for multi-line notes (newlines inside a
  note were counted as separate notes) and Applications always showed 0 (it
  counted the unused tracker-entry notes field instead of the records' job
  notes); both now count actual note records

### Version bump

- Version bumped to 1.2.5

## v1.2.4

### Features

- Jobs page: after adding a job, the new record is selected and pinned at
  the top of the list so it lands in the detail panel immediately
- Edit Job modal: assign the application status (Saved, Applied, Interview,
  Offer, Rejected, Ghosted, Not Pursued) without leaving the jobs page; the
  tracker stays in sync and the status change is recorded in the activity log
- Edit Job modal: add or remove tags on a job (saved to the job's skill
  tags, which feed the All Tags filter on the Jobs page)

### Dev tooling

- Added `recompile.ps1`: tears down the dev containers, rebuilds with
  `docker compose up --build --detach`, and tails the logs of the first
  container for a one-command dev rebuild cycle

### Version bump

- Version bumped to 1.2.4

## v1.2.3

### Features

- New Activity log: adds, edits, and deletes of jobs, applications (tracker
  moves with the status transition, e.g. "saved -> applied"), companies,
  contacts, notes, resumes, and data import/clear are recorded with date,
  time, record, and action, and shown on the new Activity page
- Jobs page: the Relationships tab now shows the job's linked company by
  default, supports linking/unlinking contacts, companies, and other jobs,
  and job-to-job relationships are stored in a new `job_jobs` table
- Companies page: the Relationships tab now supports linking/unlinking
  contacts and jobs with the same control style as Contacts
- Contacts page: tags on notes are added on dropdown change (no separate
  "Add tag" button)
- Dashboard stat boxes are sticky and show Jobs, Applications, Companies,
  Contacts, and Resumes; Applications excludes Saved and Not Pursued
- Jobs relationships API now returns the job's `company`, `contacts`,
  `related_jobs`, and `notes`

### Bug fixes

- Data import no longer fails with a duplicate-key error when the backup
  contains IDs that already exist in another account (e.g. importing the
  sample data twice, or restoring a shared export): every imported record now
  gets a fresh ID and all relationships (companies, jobs, resumes, contacts,
  notes, tags, analyses, applications) are remapped to the new IDs

### Version bump

- Version bumped to 1.2.3

## v1.2.2

### Features

- Contacts are now mutually linked: adding a contact-to-contact relationship
  stores both directions, so each side shows the other in its Relationships tab;
  deleting a contact cleans up the reverse links
- Companies page: new Relationships tab (single mixed list with type-colored
  icons: contacts, jobs, notes) with deep links into each record
- Jobs page: new Relationships tab (single mixed list with type-colored icons:
  contacts, notes) with deep links into each record
- All note displays now use a shared note card: text clamped to 4 lines, a
  "More" button opens the full note in a wide scrollable modal, and the last
  line shows the note date plus any tags; relationships tabs include the note
  tags so tagged notes show them on the target record too
- Deep linking: `/contacts?contact_id=...` and `/companies?company_id=...` focus
  the record on page load, so cross-page links land on the right item
- New Contacts page: keep people (recruiters, hiring managers, references) with
  name, email, phone; each contact can link to many companies, jobs and other
  contacts; detail panel has two tabs: Notes (with multi-entity tags per note
  linking to jobs / companies / other contacts) and Relationships (single mixed
  list grouped by name, with clickable links to each job/company), editable in
  place
- Contacts, relationships and note tags are included in data export/import,
  admin system backup/restore, and Clear All Data; a one-off startup migration
  moves legacy single-link rows (contacts.company_id / contacts.job_id) into
  the new many-to-many tables
- Sample data rebuilt: the importable `sample_data/job-tracker-sample.zip` now
  includes 7 contacts with company/job/contact relationships and tagged notes
- Login page right panel is now customizable: admins can paste HTML in the
  Settings page that renders on the login page for everyone (stored server-side)

### Version bump

- Version bumped to 1.2.2

## v1.2.1

### Features

- Admin AI usage dashboard: token counts, estimated cost, and a usage
  log per user with user/feature filters
- AI usage tracking for every Gemini call (match analysis, cover letters,
  skill extraction, job extraction from URL/pasted text)
- Job description modal with "Go to Record" and "View original posting"
  links, available from the jobs list, the job detail pane, and the edit
  dialog
- Resume viewer modal showing the extracted text of an uploaded resume

### Changes

- Tracker Kanban cards slimmed down: show only job title and company,
  with the edit action kept and the delete button removed
- Jobs page: a job opened via deep link (e.g. from the tracker) is pinned
  to the top of the list; selecting a job scrolls the detail pane into view
- Fixed version number display on login, register, verify-email, and
  footer pages

### Infrastructure

- AI usage records are included in the full system backup and restore

## v1.2.0

### Features

- Job URL scraping now uses trafilatura for better content extraction,
  automatically falling back to BeautifulSoup when needed
- Hardened Playwright scraping: rotating user agents, stealth browser args,
  networkidle wait, cookie-consent dismissal, and retries for JS-heavy sites
- New "Paste Text" mode when adding a job: paste a job description directly
  and let AI extract title, company, location, description, and skills
- Backend endpoints for pasted-text jobs: `POST /api/jobs/from-text` and
  `POST /api/jobs/from-text/preview`

### Infrastructure

- Added `trafilatura` to backend requirements

## v1.1.9

### Features

- Email verification (double opt-in): new registrations receive a
  verification email and cannot log in until they confirm via the link;
  auto-verified when SMTP is not configured
- SMTP configuration in the admin Settings page (host, port, credentials,
  TLS/SSL, from name/address, BCC), persisted server-side and applied
  immediately, falling back to .env defaults
- Resend verification email with rate limiting
- New /verify-email page to confirm the token from the email link
- Job notes: the note date can be edited after entry (Edit Note dialog)
- Jobs page: detail panel is now responsive — the fixed 1400px minimum
  width is gone; the layout stacks on smaller screens
- Tracker Kanban: the delete action moved to the bottom of each card,
  separated from the edit icon

### Bug fixes

- Saving a new job is now instant: AI skill extraction moved to a
  background task instead of blocking the save request (Gemini could take
  tens of seconds, causing client timeouts and spurious errors)
- Job and tracker entry are created atomically: a new job always appears
  in the tracker; a timed-out save can no longer leave a job that shows in
  Jobs but is missing from the Tracker
- AI calls now have a 45s timeout so a hung model cannot block requests;
  frontend API timeout raised from 30s to 120s to cover slow URL scraping
- Creating an application is idempotent: retries or stale clients cannot
  create duplicate tracker entries for the same job

### Security

- Email verification tokens can no longer be used as session tokens: access
  tokens now carry a `type` claim and `get_current_user` rejects any other
  token type plus unverified users, closing a double opt-in bypass
- Rate limits no longer trust a client-supplied `X-Forwarded-For` header
  unless `TRUST_PROXY_HEADERS=true` (only set it behind a reverse proxy that
  overwrites the header); the resend/register limits are no longer spoofable
- Registration rolls back the account when the verification email cannot be
  sent, so a misconfigured SMTP can no longer strand users in a permanent
  "unverified" state with no recovery path (previously: swallowed error,
  201 response, account locked out of login forever)
- Clearing the SMTP password or Gemini API key in the admin Settings page now
  takes effect immediately (an empty override restores the env default
  instead of keeping the stale value in memory until restart)
- The SMTP password and settings admin payload no longer expose an unused
  `smtp_enabled` field

### Reliability

- Job and tracker entry are created in a single transaction, and a unique
  `(user_id, job_id)` index on applications is enforced (existing duplicates
  are deduplicated on startup), so a job can never exist without its tracker
  entry
- Background skill extraction no longer holds a DB connection across the AI
  call, preventing connection-pool exhaustion under bursts of job saves
- Editing a note's text no longer silently rewrites its date; `created_at`
  is only sent when the date field actually changed
- `POST /api/applications/` returns 409 when a job is already tracked with a
  different status instead of silently discarding the requested status
- Production image defaults to a single uvicorn worker (was 2): admin-saved
  SMTP/AI settings and in-memory rate limits diverge between workers until
  restart; the deployment guide documents this constraint
- Production compose forwards the `SMTP_*`, `COOKIE_SECURE`, and
  `TRUST_PROXY_HEADERS` variables to the backend (previously the documented
  env SMTP path was silently dropped, leaving double opt-in disabled in
  production)

### Quality

- Added pytest coverage for the verification flow (register, verify,
  resend, rate limit)
- Fixed useSearchParams Suspense boundary on /jobs and /verify-email so
  `next build` succeeds

## v1.1.8

### Version bump

- Version bumped to 1.1.8

### Security

- SSRF guard on job URL import: only http/https URLs allowed, hosts resolving
  to private/loopback/link-local addresses are rejected, redirects are
  validated per hop (P1.002)
- `DEBUG` code default flipped to `false` so /docs and /api/debug routes stay
  off unless explicitly enabled (P1.007)
- Admin bootstrap from env: on a fresh install the admin account is created
  from `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` at startup; the
  first-registered-user-becomes-admin behavior is removed (P1.009)
- Password hashes stripped from the user data export (P1.011)
- Registration no longer reveals whether an email is already registered (P1.014)
- Added MIT LICENSE file referenced by readme.md (P3.008)
- Rate limiting: login capped at 20 attempts / 15 min per IP, registration at
  5 / hour per IP, account lockout after 5 failed logins, per-user AI quota
  of 40 calls / day (P1.010)
- Sessions moved from localStorage to an httpOnly SameSite=Lax cookie with a
  logout endpoint; `COOKIE_SECURE` flag for HTTPS deployments (P1.012)
- Prompt injection guardrails: user-supplied resume/job text is wrapped in
  untrusted-data markers with an instruction to ignore embedded instructions
  (P1.008)
- Dependency updates: Next.js 14.2.35, axios 1.19.0, fastapi 0.115.14,
  uvicorn 0.34.3, python-multipart 0.0.20 (fixes multipart DoS CVE-2024-24762)
  (P1.013)

### Quality

- Removed unused frontend dependencies: @radix-ui/*, class-variance-authority,
  date-fns (P3.002)
- Typed Job/JobPreview shared types; removed stray `any` types and unused
  imports; `noUnusedLocals` enabled in tsconfig (P3.006)
- Added pytest suite for the security-critical paths (auth, lockout, SSRF
  guard, export, admin AI settings) and a GitHub Actions CI workflow running
  backend tests + frontend typecheck/build (P3.001)
- Extracted shared PageShell / PageHeader / PageLoading components used by
  all six app pages (P3.003)
- FK indexes on resumes.user_id, job_notes.job_id, job_analyses.job_id,
  job_analyses.resume_id, applications.user_id, applications.job_id (created
  automatically for new and existing databases) and limit/offset pagination
  on all list endpoints (P3.007)
- New admin-only Settings page to manage the Gemini model + API key override
  (persisted server-side, applied immediately, falls back to .env defaults)
  (P3.009)

### Bug fixes

- Match score on new applications prefers the analysis computed against the
  user's active resume instead of the most recent analysis for the job (P2.007)
- Resume versions use max(version)+1 so deleted versions never collide (P2.005)
- Kanban drag-and-drop and card deletion roll back to the previous board when
  the API call fails (P2.004)
- Dev docker-compose.yml marked DEV-ONLY; production deploys use the hardened
  Dockerfile.prod + docker-compose.prod.yml path (P2.008)
- Gemini client/fallback code deduplicated — debug.py now reuses ai_service,
  and the fallback model list is configurable via GEMINI_FALLBACK_MODELS (P2.006)
- Playwright support: JS-heavy job pages and cookie consent walls now render
  in headless Chromium when plain HTTP scraping returns too little text;
  degrades gracefully when the browser is not installed (P2.014)

### Docs

- readme.md now credits the original repository: Job-Application-Tracker by
  Kristoffer Ian Sioson (https://github.com/iansiosontech/Job-Application-Tracker)

## v1.1.7

### Version bump

- Version bumped to 1.1.7

## v1.1.6

### Version bump

- Version bumped to 1.1.6

### Security

- API docs (`/docs`, `/redoc`, `/openapi.json`) are now disabled by default in production (`SHOW_API_DOCS=false`); auto-enabled in local dev via `DEBUG=true`, or opt in with `SHOW_API_DOCS=true`

### Docs

- Renamed DEPLOY-BUILD.md to PRODUCTION_DEPLOYMENT_GUIDE.md — now a production-only guide (VPS install, upgrades, HTTPS, firewall, backups, troubleshooting)
- readme.md is now local-development focused and links to the production guide; added Docker dev workflow and common commands

## v1.1.5

### Admin system backup

- Admin-only full system backup: downloads a zip with ALL users' data (accounts, companies, jobs, resumes, applications, analyses, notes) and all uploaded files
- Admin-only system restore: replaces all data for all users, including accounts (you may need to log in again after a restore)
- Data export now includes only the logged-in user's uploaded files; import removes orphaned upload files

### Companies

- New Company records with notes, created automatically from the company name when entering a job
- Company autocomplete in the Add/Edit Job modal: typing 2+ letters searches existing records; pick one or a new record is created on save
- Company notes editable in the job modal; company records backfilled from existing jobs on startup
- Company filter dropdown on the Jobs page and Tracker kanban
- Companies included in data export/import

### Jobs page

- Job detail header now shows the date the job was added, with a pencil icon to edit it
- Edit Job modal has a new Date added field; supports backdating historical entries

### Deployment

- Distribution zip now ships `docker-compose.prod.example.yml` instead of `docker-compose.prod.yml`
- Upgrades are in-place: unzip over the existing install folder; the live compose file and `.env.prod` are never overwritten

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


