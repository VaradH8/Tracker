---
name: verify
description: Run the Tracker demo app locally (no Docker/Postgres needed) and drive it with Playwright to verify UI changes.
---

# Verifying the Tracker demo app locally

The app is Next.js + Prisma + custom cookie sessions. Production is
Postgres, but there is no local Postgres — use the SQLite fallback.

## Launch (from `demo/`)

1. **Temporarily** flip `prisma/schema.prisma` datasource `provider`
   from `"postgresql"` to `"sqlite"`. **Revert it (and re-run
   `npx prisma generate`) when done — never commit the flip.**
2. ```
   DATABASE_URL="file:./dev.db" npx prisma db push --skip-generate
   DATABASE_URL="file:./dev.db" npx prisma generate
   DATABASE_URL="file:./dev.db" npm run seed   # only populates an EMPTY db
   DATABASE_URL="file:./dev.db" AUTH_SECRET=<any 32+ chars> AUTH_TRUST_HOST=true npx next dev -p 3111
   ```
   `dev.db` lands in `prisma/dev.db` (gitignored). Seed users all have
   password `tracker2026`; `varad@example.com` is the Admin.

## Auth gotcha

The sign-in query uses `mode: "insensitive"` (Postgres-only), so **the
login form 500s on SQLite**. Bypass it by minting a session row and
setting the `tracker_session` cookie to its id:

```js
// node, from demo/, DATABASE_URL="file:./dev.db"
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const u = await p.user.findUnique({ where: { email: "varad@example.com" } });
const s = await p.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 864e5) } });
console.log(s.id); // -> cookie value
```

Playwright: `ctx.addCookies([{ name: "tracker_session", value: sid, url: "http://localhost:3111" }])`,
then navigate anywhere; the client hydrates itself from `/api/me`.

## Driving

- Global Playwright 1.61.1 is installed; no bundled browsers — launch
  with `channel: "chrome"` (system Chrome).
- Admin lands on `/dashboard`; Lead/Coordinator/Developer on `/my-day`.
- Login form field is `input[placeholder*="manasi@example.com"]`
  (type=text, not email) — only usable on Postgres.
- Project board: `/projects/<id>`; "New task" button opens a modal
  (title input placeholder `What needs to be done?`, submit button
  `Create task`; second `input[type="date"]` is the target date).
- After creating a task the list refetches and re-renders — wait
  ~1.5s before element screenshots or handles go stale.
- Board week filter: the `<select>` whose options include
  `value="all"`; option values are ISO week numbers as strings.