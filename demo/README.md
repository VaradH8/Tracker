# Project Tracker — Vercel Demo

A standalone Next.js 15 demo of the Project Tracker UI for showing the look and feel to leadership. **No backend, no database, no auth** — every screen is powered by mock data in [`lib/mock.ts`](./lib/mock.ts). The real product is being built in the parent folder per the PRD.

## What's in here

| Route | Screen |
| --- | --- |
| `/` | Redirects to `/login` |
| `/login` | Sign-in screen (any credentials work — submit goes to `/my-day`) |
| `/my-day` | Manager's My Day landing — greeting, stats, "My Day" list, "Team needs attention", recent activity |
| `/team-board` | Kanban (To Do · In Progress · Blocked · Done) — drag cards between columns |
| `/dashboard` | Admin Org Dashboard — cross-team rollup, important tasks, per-team summary |

Visual style matches `docs/04-screens.md`: Google color palette, Space Grotesk for headings, Poppins for body, four-dot logo.

## Run locally

```bash
cd demo
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

### Option A — CLI (fastest)

```bash
cd demo
npx vercel
# follow prompts; accept defaults
npx vercel --prod
```

### Option B — Git import

1. Push the repo to GitHub.
2. In Vercel dashboard → **Add New… → Project** → import the repo.
3. **Important:** in *Configure Project* set **Root Directory** to `demo`.
4. Framework preset auto-detects Next.js — leave the rest as-is.
5. Click **Deploy**.

That's it. Subsequent pushes to the default branch auto-deploy.

## Demo notes for the boss

- **Three roles** (Admin / Manager / User) — the demo is a Manager view; the role-aware nav and per-screen affordances are wired up in production but stubbed here.
- **Drag a card** between Kanban columns on `/team-board` — that's the daily status-update flow.
- **Yellow card background** = Important · **red left border** = Overdue · **status pill** color matches the work state.
- **Login** is cosmetic in this demo. Production uses email + password with server sessions.

## What's missing vs. the production build

This demo is **visuals only**. The full MVP (in `../backend` and `../frontend`) adds:

- Real auth (email + password, server sessions, CSRF)
- Real data (Postgres 16 + SQLAlchemy)
- Permission enforcement on every endpoint (Admin / Manager / User)
- Excel import of `Ongoing_Projects.xlsx` + Excel export
- Notifications, audit log, daily/weekly emails
- Deploys via Docker Compose to AWS EC2 (not Vercel)

See [`../specs/09-build-plan.md`](../specs/09-build-plan.md) for the full phased plan.
