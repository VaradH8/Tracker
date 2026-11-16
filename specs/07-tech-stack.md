# 07 — Tech stack

Versions are the ones locked in `demo/package-lock.json`.

## Runtime

| Layer | Choice | Version | Notes |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | 15.5.15 | Pages and API route handlers in one app; `middleware.ts` guards `/api/*` writes |
| UI | React | 19.2.5 | Client components with per-module stores in `lib/*-store.tsx` |
| Styling | Tailwind CSS | 3.4.19 | Tokens in `tailwind.config.ts`; shared classes in `app/globals.css` |
| Icons | lucide-react | 0.453.0 | |
| Data fetching | `fetch` + @tanstack/react-query | 5.100.9 | Most stores use plain `fetch` with `no-store` |
| ORM | Prisma | 6.19.3 | `prisma migrate deploy` on boot |
| Database | PostgreSQL | 16 (alpine image) | |
| Auth | Custom cookie + DB sessions | — | `lib/auth.ts` (Tracker), `lib/domain-auth.ts` (Engineering); tokens hashed (`lib/session-token.ts`); bcryptjs 3.0.3 |
| Validation | zod | 4.4.3 | Used on newer routes; older routes validate by hand |
| Email | nodemailer | 7.0.13 | SMTP from env; every message also lands in `EmailLog` |
| Spreadsheets | SheetJS (`xlsx`) | 0.20.3 | **From cdn.sheetjs.com**, not npm — the npm 0.18.5 has unpatched prototype-pollution and ReDoS CVEs |
| Word export | jszip + `templates/*.docx` | 3.10.2 | Performance review download |
| Node | node:20-alpine | 20 | Container runs as a non-root user |

## Tooling

| Tool | Version | Use |
| --- | --- | --- |
| TypeScript | 5.9.3 | `npx tsc --noEmit` in CI |
| Vitest | 4.1.9 | Unit and route-permission tests (`npm test`) |
| axe-core + jsdom + @testing-library/react | 4.14.0 / 31.0.1 / 16.3.3 | Accessibility check, `__tests__/a11y.test.tsx` |
| tsx | — | Maintenance scripts in `demo/scripts/` |

## Infrastructure

| Piece | Choice |
| --- | --- |
| Image registry | GitHub Container Registry, `ghcr.io/varadh8/tracker-app` (`:latest` and `:<git-sha>`) |
| CI | GitHub Actions, `.github/workflows/build-app.yml` |
| Orchestration | Docker Swarm, deployed from Portainer with `compose.yml` |
| Ingress / TLS | Traefik (shared, external), Let's Encrypt |
| Backups | `prodrigestivill/postgres-backup-local:16` nightly; optional `rclone` off-host sync |

## Repository structure

```
.
├── demo/                    the application
│   ├── app/                 pages (Tracker at the root, Engineering under engineering/)
│   │   └── api/             route handlers (Engineering under api/domain/)
│   ├── components/          shared UI (AppShell, DomainShell, TaskDrawer, Skeleton, …)
│   ├── lib/                 auth, access rules, stores, import, performance, mailer
│   ├── prisma/              schema, migrations, seed, post-push.sql
│   ├── scripts/             one-off maintenance (run with npx tsx)
│   ├── templates/           Word templates and fonts for review downloads
│   ├── __tests__/           Vitest tests
│   └── middleware.ts        Origin check for /api writes
├── compose.yml              production stack
├── .github/workflows/       CI
├── docs/  specs/            product and engineering documentation
├── tools/xlsx-build/        Excel template builder
├── historical-import/       notes for one-off imports
└── assets/                  original workbook, visual reference, guides
```

The earlier `backend/` (FastAPI), `frontend/` (Vite) and `caddy/` scaffolds from the first brief were never used in production and have been removed.
