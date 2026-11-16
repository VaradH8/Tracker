# 08 — Deployment

Production runs as a Docker Swarm stack on the shared Inventive Swarm, deployed from Portainer with [`compose.yml`](../compose.yml). The step-by-step runbook (first deploy, upgrades, troubleshooting) is [`DEPLOY.md`](../DEPLOY.md); this page is the reference for what runs and how data flows.

## What runs

| Service | Image | Role |
| --- | --- | --- |
| `app` | `ghcr.io/varadh8/tracker-app:${APP_IMAGE_TAG}` | Next.js on port 3000. On boot: `prisma migrate deploy`, `post-push.sql`, optional seed, then `next start`. Health check `GET /api/health`. |
| `postgres` | `postgres:16-alpine` | Data in the `tracker_pgdata` volume. No published port. |
| `pg_backup` | `prodrigestivill/postgres-backup-local:16` | Nightly `pg_dump` to `tracker_backups`: 14 daily, 8 weekly, 6 monthly. |
| `rclone_backup` | `rclone/rclone` | Hourly sync of `tracker_backups` off the host — only when `RCLONE_BACKUP_DEST` is set. |

All stateful services are pinned to the manager node so their volumes stay put.

## How a request reaches the app

```
browser ──HTTPS──▶ Traefik (Let's Encrypt, HTTP→HTTPS) ──HTTP, traefik-public overlay──▶ app:3000 ──SQL, tracker_net overlay──▶ postgres
```

- TLS ends at Traefik. App responses add HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a Content-Security-Policy on pages.
- The internal hops are unencrypted overlay traffic. That's acceptable while every service sits on one node; enable overlay encryption (`driver_opts: encrypted: "true"`) before spreading the stack across nodes.
- The app takes the client IP from the right-most `X-Forwarded-For` hop, i.e. the one Traefik adds. Set `TRUSTED_PROXY_HOPS` if another proxy (a CDN) is put in front.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Database password (`openssl rand -hex 24`) |
| `POSTGRES_DB`, `POSTGRES_USER` | no | Default `tracker` |
| `PUBLIC_HOST` | yes | Hostname Traefik routes to the app |
| `APP_IMAGE_TAG` | recommended | Pin to a git SHA in production; rollback = previous SHA |
| `RUN_SEED` | no | `1` only on the very first boot; the seed refuses to touch a populated database |
| `SETUP_TOKEN` | recommended | If set, the first-admin forms (Tracker sign-up, Engineering bootstrap) demand it |
| `TRUSTED_PROXY_HOPS` | no | Proxies in front of the app; default 1 (Traefik) |
| `SESSION_COOKIE_SECURE` | no | Force (`1`) or disable (`0`) Secure cookies; defaults to on in production |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no | Real email. Blank = emails only land in the Admin email log |
| `UPLOAD_DIR` | no | Attachment directory, `/uploads` in the stack |
| `RCLONE_*`, `RCLONE_BACKUP_DEST` | strongly recommended | Off-host backup target |

## Build and release

1. Push to `main` touching `demo/**` → GitHub Actions runs typecheck, tests, the axe accessibility check and a production build.
2. Only if all pass, the image is built and pushed as `:latest` and `:<sha>`.
3. In Portainer, set `APP_IMAGE_TAG=<sha>` and redeploy the stack. Migrations run on boot.

Rolling back past a migration: migrations are additive, so the previous image still runs against the newer schema. Exception: after `20261116000000_hash_session_ids`, an image older than that migration can't read the hashed session ids, so everyone has to sign in again. No data is lost.

## Data on disk and backups

| Data | Where | Backed up? |
| --- | --- | --- |
| Database | `tracker_pgdata` | Nightly `pg_dump` to `tracker_backups` (same host); off-host only if rclone is configured |
| Attachments | `tracker_uploads` | **No** — add it to the off-host job (open item) |
| JSON export | Admin → Settings → Backup | Manual download; password hashes only when ticked |

Before go-live and quarterly: restore the latest dump into a scratch database and open the app against it.

## First boot checklist

- [ ] `POSTGRES_PASSWORD` is long and random.
- [ ] `SETUP_TOKEN` is set, or both modules' first admins are created right after deploy. To check a running stack: `docker exec -it <app> npx tsx scripts/check-first-admin.ts`
- [ ] `RUN_SEED` is back to `0` after the first boot, and no seeded demo accounts (password `tracker2026`) remain in use.
- [ ] `APP_IMAGE_TAG` is pinned to a SHA.
- [ ] `RCLONE_BACKUP_DEST` is set and a sync has succeeded.
- [ ] SMTP is configured, so reset links leave the email log.
