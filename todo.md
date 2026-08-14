# Code Review — AI Job Tracker

Review date: 2026-08-14. Tracked from the code review of the FastAPI + Next.js
job application tracker (backend/ + frontend/).

## Status legend

- [ ] Not started
- [x] Done
- [~] In progress
- [-] Skipped / won't fix

---

## Critical — Security (blocks production)

- [x] #1 No authentication — mock user `mock-user-123` in all routes
      (backend/app/api/routes/resume.py, applications.py, analysis.py);
      Clerk installed on frontend but unused
      -> FIXED 2026-08-14: Clerk JWT auth wired end-to-end, all routes scoped by user_id
- [x] #2 SSRF in URL import — `fetch_job_from_url` fetches arbitrary URLs
      server-side (backend/app/services/ai_service.py:173)
- [x] #3 Zip-slip in import — archive entries can write outside uploads dir
      (backend/app/api/routes/data.py:128); `file_path` from JSON can point
      anywhere, `os.remove` deletes arbitrary files
      -> FIXED 2026-08-14: basename-only extraction + is_relative_to guard,
      resume file_path rewritten under uploads/<user_id>/ on import
- [x] #4 Import deletes all data before validating payload, no rollback
      (backend/app/api/routes/data.py:103-110)
      -> FIXED 2026-08-14: full payload validated before any writes;
      single transaction with rollback on failure
- [x] #5 Import has no file size / zip-bomb limit (backend/app/api/routes/data.py:88)
      -> FIXED 2026-08-14: 200MB upload cap + 1GB total-uncompressed cap
- [x] #6 Debug router mounted unconditionally, leaks model responses/errors
      (backend/app/main.py:33)
      -> FIXED 2026-08-14: debug router only included when settings.DEBUG=true

## Bugs

- [x] #7 Resume upload overwrites file when filename repeats
      (backend/app/services/resume_service.py:24)
      -> FIXED 2026-08-14: UUID hex prefix + sanitized basename in save_upload
- [x] #8 PATCH /api/jobs/{id} 500 on explicit null fields (jobs.py:65-67)
      -> FIXED 2026-08-14: explicit nulls ignored for title/company in update_job
- [x] #9 API base URL mismatch — frontend/src/lib/api.ts defaults to :8000,
      backend runs on :8136
      -> FIXED 2026-08-14: api.ts and frontend/.env.example default to :8136
- [ ] #10 Kanban drag has no rollback on API failure (frontend/src/app/tracker/page.tsx:40-55)
- [ ] #11 Resume version/active logic — versions can collide after deletions
      (backend/app/api/routes/resume.py:58-61)
- [ ] #12 Duplicate/dead Gemini fallback code in debug.py and ai_service.py;
      unverifiable model names; slow sequential retries
- [ ] #13 Stale match score copied from most recent analysis regardless of resume
      (backend/app/api/routes/applications.py:29-36)

## Code quality / maintainability

- [ ] #14 No tests, no CI, no migrations — alembic unused; `create_all` at
      startup; deprecated `@app.on_event`
- [ ] #15 Unused dependencies — @radix-ui/*, class-variance-authority remain
      (@clerk/nextjs now used after auth wiring)
- [ ] #16 Identical layouts duplicated 4x (dashboard/resume/jobs/tracker)
- [x] #17 Hardcoded USER_NAME = "Ian" (frontend/src/app/dashboard/page.tsx:8)
      -> FIXED 2026-08-14: replaced with Clerk useUser() firstName/username
- [x] #18 print() logging instead of logging module; deprecated datetime.utcnow()
      -> PARTIAL: datetime.utcnow() replaced with datetime.now(timezone.utc);
      print() logging remains (backend-wide, low priority)
- [ ] #19 Unused imports / `any` types (jobs/page.tsx: ChevronRight, MessageCircle, preview: any)
- [ ] #20 No FK indexes, DB-native ENUM is migration-heavy, no pagination

## Ops / config

- [ ] #21 docker-compose ships dev defaults as prod (hardcoded DB password,
      bind mounts, `--reload`, frontend Dockerfile runs `npm run dev`)
- [ ] #22 settings.DEBUG=True default; FRONTEND_URL empty default
- [ ] #23 Prompt injection surface — job/resume text pasted into Gemini prompts

---

## Priority 1 — Wire real auth (Clerk)

- [x] P1.1 Create backend auth module (Clerk JWT verification via JWKS)
- [x] P1.2 Add user_id to Job model; add Clerk settings to config
- [x] P1.3 Replace mock user in all routes; scope queries by user_id
- [x] P1.4 Frontend: ClerkProvider, middleware, axios auth interceptor
- [x] P1.5 Frontend: replace hardcoded USER_NAME with useUser()
- [x] P1.6 Remove dead mock-user code; disable debug router unless DEBUG

## Priority 2 — Harden import/export

- [x] P2.1 Enforce upload size limit on /api/data/import
- [x] P2.2 Zip-slip guard: resolve paths, assert under uploads dir
- [x] P2.3 Validate entire payload before deleting existing data
- [x] P2.4 Single-transaction import with rollback on failure
- [x] P2.5 Cap total uncompressed size (zip-bomb protection)
- [ ] P2.6 Add Playwright support for better scraping (JS-rendered pages, cookie
      consent walls, e.g. workable.com job postings)
- [ ] P3.4 Add a Settings tab in the frontend to manage the AI model + API key
      (model selection and API key management in one place; fall back to the
      .env defaults when nothing is entered there)

## Priority 3 — Bug fixes

- [x] P3.1 Filename collision: UUID prefix in save_upload
- [x] P3.2 update_job: reject/ignore explicit nulls on required fields
- [x] P3.3 Fix API base URL default (8000 -> 8136) in api.ts and .env.example

## Later (not in this pass)

- #2 SSRF allowlist/validation on job URL import
- #10 Kanban optimistic rollback
- #11-13, #14-16, #19-23 backlog items above

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


