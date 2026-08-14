# Deploy & Build Instructions

## Initial Setup

### 1. Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql://postgres:password@db:5432/job_tracker
GEMINI_API_KEY=your-gemini-api-key-here
JWT_SECRET=
DEBUG=true
```

`JWT_SECRET` is **required**. Generate a unique secret, then paste it into
`backend/.env` as `JWT_SECRET=<generated-value>`. Without it the backend
will not issue login tokens.

**Generate a JWT secret (PowerShell):**

```powershell
# Preferred on Windows (uses the Python launcher)
py -c "import secrets; print(secrets.token_urlsafe(48))"

# If `py` is not available, use PowerShell cryptography instead:
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes) -replace '\+','-' -replace '/','_' -replace '='

# Or generate it inside the running backend container:
docker-compose exec backend python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the printed string into `backend/.env`, then restart:

```powershell
docker-compose restart backend
```

**Frontend** (`frontend/.env`):
```
NEXT_PUBLIC_API_URL=http://localhost:8136
```

### 2. First Build

```bash
docker-compose up --build
```

This builds both backend and frontend images, installs all dependencies,
and starts the services.

### 3. First-Time Login

After the services start, open http://localhost:8137 — you will be asked to
sign in.

**Default admin account (created automatically when upgrading from the old
Clerk-based auth):**

- Email: `admin@local` (set `DEFAULT_ADMIN_EMAIL` in `backend/.env` to change)
- Password: set `DEFAULT_ADMIN_PASSWORD` in `backend/.env`, OR leave it
  empty and a random password is generated and printed in the backend logs
  on the first migration.

**Fresh installs:** register a new account at /register — the FIRST registered
account automatically becomes an admin. Additional accounts created via
User Management are regular users unless marked as admin.

> `JWT_SECRET` is REQUIRED: generate one with
> `python -c "import secrets; print(secrets.token_urlsafe(48))"` and add it to
> `backend/.env`. The backend refuses to issue tokens without it.

### 4. Access the Application

- Frontend: http://localhost:8137
- Backend API: http://localhost:8136
- API docs: http://localhost:8136/docs

---

## Development Workflow

### When You DON'T Need to Rebuild

Your `docker-compose.yml` uses volume mounts, so most code changes are
picked up automatically:

**Backend changes** (no rebuild needed):
- Any Python files in `backend/app/`
- Backend runs with `--reload`, so uvicorn auto-restarts on changes

**Frontend changes** (no rebuild needed):
- Any TypeScript/React files in `frontend/src/`
- CSS, Tailwind config, component changes
- Next.js dev server hot-reloads automatically

Just edit files and save — the dev servers pick up changes instantly.

```bash
# Just start the containers (no --build)
docker-compose up
```

### When You DO Need to Rebuild

Use `docker-compose up --build` when:

1. **Adding new Python dependencies**
   - You edited `backend/requirements.txt`
   - Example: added `PyJWT`, `cryptography`, or any new package

2. **Adding new npm dependencies**
   - You edited `frontend/package.json`
   - Example: added `@clerk/nextjs`, `recharts`, or any new package

3. **Changing Docker configuration**
   - You edited `backend/Dockerfile` or `frontend/Dockerfile`
   - You edited `docker-compose.yml` itself

```bash
# Rebuild and restart
docker-compose up --build
```

---

## Common Commands

### Start Services (Development)
```bash
docker-compose up
```

### Start with Rebuild
```bash
docker-compose up --build
```

### Start in Background (Detached)
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Stop and Remove Volumes (Fresh Start)
```bash
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

### Restart a Single Service
```bash
docker-compose restart backend
docker-compose restart frontend
```

### Rebuild a Single Service
```bash
docker-compose up --build backend
docker-compose up --build frontend
```

---

## Troubleshooting

### Backend Won't Start
```bash
# Check logs
docker-compose logs backend

# Rebuild backend
docker-compose up --build backend
```

### Frontend Won't Start
```bash
# Check logs
docker-compose logs frontend

# Rebuild frontend (especially if package.json changed)
docker-compose up --build frontend
```

### Database Issues
```bash
# Stop everything and remove database volume
docker-compose down -v

# Start fresh
docker-compose up --build
```

### Port Already in Use
If ports 8136, 8137, or 5432 are in use:
```bash
# Stop any existing containers
docker-compose down

# Or change ports in docker-compose.yml
```

---

## Production Deployment

For production, you would:

1. Set `DEBUG=false` in backend `.env`
2. Use production database credentials
3. Build optimized images (not dev mode)
4. Use proper SSL/HTTPS
5. Configure proper CORS origins in backend settings

The current `docker-compose.yml` is configured for local development
with hot-reload enabled.







