# Task Manager

Role-aware task and project management for engineering services teams. Four roles (Admin, Co-ordinator, Business Developer, Developer), client-scoped projects, RACI-style task assignment (Person Responsible + Person Accountable), and resource visibility for planning.

## What's in the box

| Surface | Role | Notes |
| --- | --- | --- |
| `/` | Public | Hero + features + role overview |
| `/login` | Public | Email + password (NextAuth Credentials) |
| `/dashboard` | Admin | Cross-team rollup with drill-down stat cards |
| `/my-day` | Co-ord, Dev | Today's queue, sorted by urgency |
| `/my-tasks` | Co-ord, Dev | Personal queue grouped by status |
| `/projects` | All | Scoped to projects the role can see |
| `/projects/[id]` | All | Tabs: Tasks (Kanban) · Details (client info) · History (Coord/Admin only) |
| `/resources` | Admin, Co-ord | Per-person workload, performance signals, leave summary |
| `/clients` | Admin, BD | Client list + their projects |
| `/leaves` | All | Self-service; Dev/BD see own + names-only team availability |
| `/settings` | Admin | General · Users · Audit log · Import xlsx |

## Stack

- Next.js 15 (App Router) + TypeScript
- NextAuth v5 (Credentials provider, JWT sessions, 12-hour sliding)
- Prisma 6 + SQLite locally; swap to Postgres for production
- Tailwind 3 + Lucide icons
- bcryptjs + zod for input validation
- TanStack Query (wired progressively as we move pages off mock data)

## Run locally

```bash
cd demo
cp .env.example .env
# generate AUTH_SECRET:
#   on macOS / Linux:   openssl rand -hex 32
#   on Windows (PS):    -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
npm install
npx prisma migrate dev
npm run seed
npm run dev
# open http://localhost:3000
```

Seeded users (all password `ChangeMe2026!`):

| Email | Role |
| --- | --- |
| `varad@example.com` | Admin |
| `manasi@example.com` | Co-ordinator |
| `priyanka@example.com` | Co-ordinator |
| `kiran@example.com` | Co-ordinator |
| `rohit@example.com` | Business Developer |
| `sanjana@example.com` | Developer |
| `abhishek@example.com` | Developer |
| `adil@example.com` | Developer |

## Deploy to Vercel

1. Provision Postgres (Neon / Supabase / Vercel Postgres) and copy the connection string.
2. **Edit `prisma/schema.prisma`**: change `provider = "sqlite"` → `provider = "postgresql"`.
3. In Vercel → **Project Settings → Environment Variables**, add:
   - `DATABASE_URL` — your Postgres URL
   - `AUTH_SECRET` — `openssl rand -hex 32`
   - `AUTH_TRUST_HOST` — `true`
   - `NEXT_PUBLIC_SITE_URL` — `https://your-vercel-domain`
4. In Vercel → **Settings → General → Root Directory**, set to `demo`.
5. Deploy. First-run will need migrations:
   ```bash
   DATABASE_URL=<prod-url> npx prisma migrate deploy
   DATABASE_URL=<prod-url> npm run seed   # optional — bootstraps Admin + sample data
   ```

The build script already includes `prisma generate`, so the client is available at build time.

## Person Responsible vs Person Accountable

This product uses an inverted-RACI convention:

- **Person Responsible** = the user who **assigned** the task (typically the Co-ordinator). Singular.
- **Person Accountable** = the user(s) actually **performing** the task. One or more.

Both fields are visible in the task drawer. Only the Person Accountable can change status; only Co-ordinators and Admins can change the Person Responsible / Accountable.

## Access matrix (server-enforced)

See [`lib/access.ts`](./lib/access.ts) and [`lib/server-access.ts`](./lib/server-access.ts) — the same rules apply both client-side (for UI gating) and server-side (the API routes). Sample:

- **Developer**: only sees projects with a task assigned to them
- **Business Developer**: only sees projects where they own the `bd` field
- **Co-ordinator + Admin**: all projects, all resources, all leave entries
- **Developer + Business Developer**: own leaves only; team availability is names-only

## What's not finished yet

- Frontend pages still read from `lib/mock.ts` for non-auth data. Wiring them to `/api/*` via TanStack Query is the next phase.
- Real-time updates (Pusher / Supabase Realtime / SSE)
- In-app notifications, email digests
- Functional Excel import / export
- Rate limiting on auth endpoints
- E2E test suite
