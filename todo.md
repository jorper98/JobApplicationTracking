# Code Review — AI Job Tracker

Review date: 2026-08-14. Tracked from the code review of the FastAPI + Next.js
job application tracker (backend/ + frontend/).

## Status legend

- [ ] Not started
- [x] Done
- [~] In progress
- [-] Skipped / won't fix

---

---

## Completed

### P1

- [x] P1.001 — No authentication — mock user `mock-user-123` in all routes
      (backend/app/api/routes/resume.py, applications.py, analysis.py);
      Clerk installed on frontend but unused
      -> FIXED 2026-08-14: Clerk JWT auth wired end-to-end, all routes scoped by user_id
- [x] P1.003 — Zip-slip in import — archive entries can write outside uploads dir
      (backend/app/api/routes/data.py:128); `file_path` from JSON can point
      anywhere, `os.remove` deletes arbitrary files
      -> FIXED 2026-08-14: basename-only extraction + is_relative_to guard,
      resume file_path rewritten under uploads/<user_id>/ on import
- [x] P1.004 — Import deletes all data before validating payload, no rollback
      (backend/app/api/routes/data.py:103-110)
      -> FIXED 2026-08-14: full payload validated before any writes;
      single transaction with rollback on failure
- [x] P1.005 — Import has no file size / zip-bomb limit (backend/app/api/routes/data.py:88)
      -> FIXED 2026-08-14: 200MB upload cap + 1GB total-uncompressed cap
- [x] P1.006 — Debug router mounted unconditionally, leaks model responses/errors
      (backend/app/main.py:33)
      -> FIXED 2026-08-14: debug router only included when settings.DEBUG=true
- [x] P1.002 — SSRF in URL import — `fetch_job_from_url` fetches arbitrary URLs
      server-side (backend/app/services/ai_service.py:174)
      -> FIXED 2026-08-16: http/https allowlist + private/loopback/link-local
      IP block via DNS resolution; redirects validated per hop
- [x] P1.007 — settings.DEBUG=True default; FRONTEND_URL empty default
      -> FIXED 2026-08-16: DEBUG code default flipped to False in config.py;
      local dev .env keeps DEBUG=true; FRONTEND_URL stays env-configured
- [x] P1.009 — First registered user becomes admin (backend/app/api/routes/auth.py:35)
      -> FIXED 2026-08-16: register never grants admin; fresh installs
      bootstrap admin from DEFAULT_ADMIN_EMAIL/PASSWORD at startup
      (random password logged if not set)
- [x] P1.011 — Exports/backups include password_hash (backend/app/api/routes/data.py
      serialize_model)
      -> FIXED 2026-08-16: password_hash stripped from the user export;
      system backup keeps it (required for restore)
- [x] P1.014 — Register endpoint leaks account existence (400 "already exists")
      (backend/app/api/routes/auth.py:31)
      -> FIXED 2026-08-16: generic "Registration failed" response
- [x] P1.008 — Prompt injection surface — job/resume text pasted into Gemini prompts
      -> FIXED 2026-08-16: untrusted-data boundary markers + guard instruction
      in all Gemini prompts; AI output used as data only (documented in readme)
- [x] P1.010 — No rate limiting / account lockout on login & register; AI endpoints
      (/analysis/match, /jobs/from-url, cover-letter) have no per-user quota
      -> FIXED 2026-08-16: in-memory sliding-window limits — login 20/15min
      per IP, register 5/hour per IP, lockout after 5 failed logins, AI quota
      40 calls/day/user (AI_DAILY_QUOTA). Per-process state; approximate with
      multiple uvicorn workers
- [x] P1.012 — JWT stored in localStorage (frontend/src/context/AuthContext.tsx:39)
      -> FIXED 2026-08-16: httpOnly SameSite=Lax session cookie, logout
      endpoint, COOKIE_SECURE flag for HTTPS; frontend no longer stores tokens
- [x] P1.013 — Stale dependencies — Next.js 14.2.3 (Apr 2024), fastapi 0.111.0,
      uvicorn 0.29.0
      -> FIXED 2026-08-16: next 14.2.35, axios 1.19.0, fastapi 0.115.14,
      uvicorn 0.34.3, python-multipart 0.0.20 (multipart DoS CVE-2024-24762);
      remaining npm audit highs are dev-time/transitive or require Next 15/16
      (app uses no next/image remotePatterns)

#### P1 — Wire real auth (Clerk)

- [x] P1.015 — Create backend auth module (Clerk JWT verification via JWKS)
- [x] P1.016 — Add user_id to Job model; add Clerk settings to config
- [x] P1.017 — Replace mock user in all routes; scope queries by user_id
- [x] P1.018 — Frontend: ClerkProvider, middleware, axios auth interceptor
- [x] P1.019 — Frontend: replace hardcoded USER_NAME with useUser()
- [x] P1.020 — Remove dead mock-user code; disable debug router unless DEBUG

### P2

- [x] P2.001 — Resume upload overwrites file when filename repeats
      (backend/app/services/resume_service.py:24)
      -> FIXED 2026-08-14: UUID hex prefix + sanitized basename in save_upload
- [x] P2.002 — PATCH /api/jobs/{id} 500 on explicit null fields (jobs.py:65-67)
      -> FIXED 2026-08-14: explicit nulls ignored for title/company in update_job
- [x] P2.003 — API base URL mismatch — frontend/src/lib/api.ts defaults to :8000,
      backend runs on :8136
      -> FIXED 2026-08-14: api.ts and frontend/.env.example default to :8136

#### P2 — Harden import/export

- [x] P2.009 — Enforce upload size limit on /api/data/import
- [x] P2.010 — Zip-slip guard: resolve paths, assert under uploads dir
- [x] P2.011 — Validate entire payload before deleting existing data
- [x] P2.012 — Single-transaction import with rollback on failure
- [x] P2.013 — Cap total uncompressed size (zip-bomb protection)

#### P2 — Bug fixes

- [x] P2.015 — Filename collision: UUID prefix in save_upload
- [x] P2.016 — update_job: reject/ignore explicit nulls on required fields
- [x] P2.017 — Fix API base URL default (8000 -> 8136) in api.ts and .env.example
- [x] P2.004 — Kanban drag has no rollback on API failure (frontend/src/app/tracker/page.tsx:40-55)
      -> FIXED 2026-08-16: drag-drop and delete restore the previous board on API failure
- [x] P2.005 — Resume version/active logic — versions can collide after deletions
      (backend/app/api/routes/resume.py:58-61)
      -> FIXED 2026-08-16: version = max(version)+1 instead of row count
- [x] P2.006 — Duplicate/dead Gemini fallback code in debug.py and ai_service.py;
      unverifiable model names; slow sequential retries
      -> FIXED 2026-08-16: debug.py reuses ai_service helpers; fallback list
      configurable via GEMINI_FALLBACK_MODELS (deduped); retries stay
      sequential by design (primary first)
- [x] P2.007 — Stale match score copied from most recent analysis regardless of resume
      (backend/app/api/routes/applications.py:29-36)
      -> FIXED 2026-08-16: prefers analysis for the user's active resume,
      falls back to most recent job analysis
- [x] P2.008 — docker-compose ships dev defaults as prod (hardcoded DB password,
      bind mounts, `--reload`, frontend Dockerfile runs `npm run dev`)
      -> MITIGATED 2026-08-16: compose file banner marks it DEV-ONLY;
      production path exists (Dockerfile.prod + docker-compose.prod.yml +
      PRODUCTION_DEPLOYMENT_GUIDE.md)
- [x] P2.014 — Add Playwright support for better scraping (JS-rendered pages, cookie
      consent walls, e.g. workable.com job postings)
      -> FIXED 2026-08-16: headless Chromium fallback in fetch_job_from_url
      when HTTP text < 100 chars; optional (degrades gracefully); installed
      in backend Docker images (--no-sandbox, PLAYWRIGHT_BROWSERS_PATH)

### P3

- [x] P3.004 — Hardcoded USER_NAME = "Ian" (frontend/src/app/dashboard/page.tsx:8)
      -> FIXED 2026-08-14: replaced with Clerk useUser() firstName/username
- [x] P3.005 — print() logging instead of logging module; deprecated datetime.utcnow()
      -> PARTIAL: datetime.utcnow() replaced with datetime.now(timezone.utc);
      print() logging remains (backend-wide, low priority)
- [x] P3.008 — readme.md references a LICENSE file that doesn't exist
      -> FIXED 2026-08-16: MIT LICENSE file added
- [x] P3.001 — No tests, no CI, no migrations — alembic unused; `create_all` at
      startup; deprecated `@app.on_event`
      -> FIXED 2026-08-16: pytest suite (19 tests) covering auth, lockout,
      SSRF guard, export, admin AI settings + GitHub Actions CI (backend
      tests, frontend tsc + build); alembic/on_event kept for now
- [x] P3.002 — Unused dependencies — @radix-ui/*, class-variance-authority remain
      -> FIXED 2026-08-16: removed @radix-ui/*, class-variance-authority,
      date-fns from package.json/lock
- [x] P3.003 — Identical layouts duplicated 4x (dashboard/resume/jobs/tracker)
      -> FIXED 2026-08-16: shared PageShell/PageHeader/PageLoading components
      now used by all six pages
- [x] P3.006 — Unused imports / `any` types (jobs/page.tsx: ChevronRight, MessageCircle, preview: any)
      -> FIXED 2026-08-16: shared Job/JobPreview types, unused state removed,
      noUnusedLocals enabled (tsc-clean)
- [x] P3.007 — No FK indexes, DB-native ENUM is migration-heavy, no pagination
      -> FIXED 2026-08-16: FK indexes added to models + auto-created on
      existing DBs at startup; limit/offset pagination on all list endpoints;
      DB ENUM kept as-is (accepted)
- [x] P3.009 — Add an admin-only Settings tab in the frontend to manage the AI
      model + API key (global server config, no per-user keys; persisted
      server-side and used as an override of the .env defaults; admin-only
      endpoints)
      -> FIXED 2026-08-16: app_settings table + admin-only GET/PUT
      /api/users/settings/ai; ai_service resolves model/client per call so
      overrides apply immediately; new /settings page (admin nav only)

---

## Setup notes for the auth change

- Backend `.env` (managed by you, not edited here): add `CLERK_JWT_ISSUER`
  (e.g. `https://your-app.clerk.accounts.dev`). Without it the API returns
  503 "Clerk auth is not configured" for protected endpoints.
- Frontend `.env`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
  (keys were already in `.env.example`).
- New backend deps: `PyJWT`, `cryptography` — run `pip install -r requirements.txt`
  (or rebuild the backend image for Docker).
- DB migration: on startup the app adds `jobs.user_id` automatically if missing.
  Jobs created before auth (mock-user era) have no owner and are hidden —
  delete or reassign them.
- Export bug also fixed in the data.py rewrite: ApplicationStatus enums now
  serialize correctly (export previously crashed on json.dumps).
- AuthBridge refreshes the Clerk token every 30 min; axios interceptor adds
  the Bearer header on every request.

---

## Numbering cross-reference

| New ID | Former ID |
|--------|-----------|
| P1.001 | #1 |
| P1.002 | #2 |
| P1.003 | #3 |
| P1.004 | #4 |
| P1.005 | #5 |
| P1.006 | #6 |
| P1.007 | #22 |
| P1.008 | #23 |
| P1.009 | #24 |
| P1.010 | #25 |
| P1.011 | #26 |
| P1.012 | #27 |
| P1.013 | #28 |
| P1.014 | #29 |
| P1.015 | P1.1 |
| P1.016 | P1.2 |
| P1.017 | P1.3 |
| P1.018 | P1.4 |
| P1.019 | P1.5 |
| P1.020 | P1.6 |
| P2.001 | #7 |
| P2.002 | #8 |
| P2.003 | #9 |
| P2.004 | #10 |
| P2.005 | #11 |
| P2.006 | #12 |
| P2.007 | #13 |
| P2.008 | #21 |
| P2.009 | P2.1 |
| P2.010 | P2.2 |
| P2.011 | P2.3 |
| P2.012 | P2.4 |
| P2.013 | P2.5 |
| P2.014 | P2.6 |
| P2.015 | P3.1 |
| P2.016 | P3.2 |
| P2.017 | P3.3 |
| P3.001 | #14 |
| P3.002 | #15 |
| P3.003 | #16 |
| P3.004 | #17 |
| P3.005 | #18 |
| P3.006 | #19 |
| P3.007 | #20 |
| P3.008 | #30 |
| P3.009 | P3.4 |
