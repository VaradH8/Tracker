# 07 — Tech Stack

Pin specific versions. Use what's listed unless there's a strong reason to deviate.

## Backend

- **Language**: Python 3.12
- **Framework**: FastAPI 0.115+
- **ORM**: SQLAlchemy 2.0 + Alembic for migrations
- **DB driver**: `psycopg[binary]` 3.x
- **Validation**: Pydantic v2
- **Auth**:
  - `passlib[bcrypt]` for password hashing
  - Custom session middleware writing to `sessions` table (don't use JWT for MVP — sessions are simpler to revoke and audit)
  - `itsdangerous` for signed CSRF tokens
- **Background jobs**: APScheduler 3.x (in-process, single worker container)
- **Email**: `aiosmtplib` for sending; templates rendered via Jinja2
- **xlsx**:
  - Read: `openpyxl`
  - Write: `openpyxl` for export (preserves Excel column order)
- **Testing**: pytest + httpx + pytest-asyncio

## Frontend

- **Framework**: React 18 + TypeScript 5.4
- **Build**: Vite 5
- **Routing**: React Router 6
- **State management**: TanStack Query (React Query) for server state + minimal Zustand for UI state
- **HTTP client**: native `fetch` wrapped in a thin client
- **UI primitives**: Radix UI (unstyled, accessible) for dialog, dropdown, popover, etc.
- **Styling**: Tailwind CSS 3.4, configured to match the visual style guide in `docs/04-screens.md`
- **Drag and drop**: `@dnd-kit/core` (Kanban)
- **Date pickers**: `react-day-picker`
- **Forms**: React Hook Form + Zod
- **Icons**: `lucide-react`
- **Fonts**: load Space Grotesk + Poppins from Google Fonts CDN with `<link>` preconnect

## Infrastructure

- **Database**: PostgreSQL 16
- **Cache / job queue (light use)**: Redis 7 — used for rate limit counters and APScheduler job locking only
- **Reverse proxy & TLS**: Caddy 2 (auto-TLS via Let's Encrypt; one config file)
- **Object storage**: AWS S3 for backups (same region as EC2)
- **Container runtime**: Docker 24+ via Portainer CE
- **Host OS**: Ubuntu 24.04 LTS on AWS EC2 (t3.medium minimum)

## Repository structure

```
project-tracker/
├── README.md
├── compose.yml                  ← Portainer stack file
├── .env.example
├── caddy/
│   └── Caddyfile
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py              ← FastAPI app
│   │   ├── config.py            ← env-based settings
│   │   ├── db.py                ← engine, session
│   │   ├── auth/
│   │   │   ├── routes.py
│   │   │   ├── deps.py          ← dependency injection (current_user, require_admin, etc.)
│   │   │   └── permissions.py   ← the matrix from docs/02
│   │   ├── models/              ← SQLAlchemy ORM
│   │   ├── schemas/             ← Pydantic
│   │   ├── routers/
│   │   │   ├── users.py
│   │   │   ├── teams.py
│   │   │   ├── projects.py
│   │   │   ├── tasks.py
│   │   │   ├── remarks.py
│   │   │   ├── audit.py
│   │   │   ├── notifications.py
│   │   │   ├── dashboard.py
│   │   │   ├── import_xlsx.py
│   │   │   └── export_xlsx.py
│   │   ├── services/
│   │   │   ├── audit.py
│   │   │   ├── notifications.py
│   │   │   ├── email.py
│   │   │   └── xlsx_import.py
│   │   ├── jobs/
│   │   │   ├── scheduler.py
│   │   │   ├── overdue_digest.py
│   │   │   └── weekly_summary.py
│   │   └── tests/
│   └── seed.py                  ← creates initial admin user
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                 ← typed client
│       ├── components/
│       │   ├── ui/              ← buttons, dialog, etc.
│       │   ├── kanban/
│       │   ├── task-drawer/
│       │   ├── task-card/
│       │   └── nav/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── ForgotPassword.tsx
│       │   ├── ResetPassword.tsx
│       │   ├── SetupAccount.tsx
│       │   ├── MyDay.tsx
│       │   ├── OrgDashboard.tsx
│       │   ├── TeamBoard.tsx
│       │   ├── MyTasks.tsx
│       │   ├── ProjectDetail.tsx
│       │   ├── admin/
│       │   │   ├── Teams.tsx
│       │   │   ├── Users.tsx
│       │   │   ├── AuditLog.tsx
│       │   │   ├── Import.tsx
│       │   │   └── Settings.tsx
│       │   └── Profile.tsx
│       ├── hooks/
│       └── lib/
├── docs/                        ← copy of /docs from this PRD package
└── specs/                       ← copy of /specs from this PRD package
```

## Environment variables (.env.example)

```
# Database
DATABASE_URL=postgresql+psycopg://tracker:tracker@postgres:5432/tracker

# Redis
REDIS_URL=redis://redis:6379/0

# App
APP_BASE_URL=https://tracker.example.com
SECRET_KEY=<generate via: openssl rand -hex 32>
SESSION_COOKIE_NAME=tracker_session
SESSION_LIFETIME_HOURS=12

# Initial admin (seeded on first boot if no users exist)
ADMIN_EMAIL=admin@example.com
ADMIN_INITIAL_PASSWORD=<change-on-first-login>

# SMTP (can be set via UI later; envs are defaults)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=tracker@example.com

# Backups
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
BACKUP_S3_BUCKET=tracker-backups

# Misc
TIMEZONE=Asia/Kolkata
WORKING_HOURS_PER_DAY=8
LOG_LEVEL=INFO
```

## Why these choices

- **FastAPI + SQLAlchemy + Postgres**: industry-standard, fast to build with, easy to hire for, plays well with single-EC2 deployments
- **React + Vite + Tailwind**: fast HMR, small bundle, easy to style precisely to the visual guide
- **Caddy over nginx**: zero-config TLS, simpler Caddyfile vs. nginx.conf for our needs
- **APScheduler over Celery**: 30 users / 500 tasks doesn't justify Celery's complexity; APScheduler runs fine in-process in a dedicated worker container
- **Sessions over JWT**: easier to revoke, easier to debug, no token bloat; we already have a database
- **Single Redis**: only used for rate limiting + scheduler locking, doesn't need to be HA at this scale
