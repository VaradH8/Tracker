# Deploy — EC2 + Portainer + Postgres

This is the runbook for getting the tracker up on an EC2 box managed by
Portainer. The whole stack is two containers: **Postgres** for the data,
**Next.js** for everything else. The app container also owns the schema
(runs `prisma db push` on boot) and an optional seed.

> **First time? Read this top-to-bottom once before clicking around in
> Portainer.**

---

## 0. Prereqs

- An EC2 instance running Docker (any size — `t3.small` is enough for
  the team).
- Portainer Community Edition pointed at that Docker daemon.
- Port 80 (and 443 if you'll add TLS) reachable in the security group.
- Your domain pointed at the EC2 public IP, if you want a real URL.

---

## 1. First deploy

### 1.1 Pull the repo onto the EC2 box

```sh
ssh ubuntu@your-ec2-host
cd /opt
sudo git clone https://github.com/VaradH8/Tracker.git tracker
sudo chown -R ubuntu:ubuntu tracker
cd tracker
```

### 1.2 Create the `.env` file

```sh
cp .env.example .env
```

Now edit `.env` and set:

```
POSTGRES_PASSWORD=<openssl rand -hex 24>     # required, no quotes
RUN_SEED=1                                    # only on the first boot
APP_PORT=3000
```

### 1.3 Deploy the stack from Portainer

In Portainer:

1. **Stacks → Add stack**
2. Name: `tracker`
3. Build method: **Repository**
   - Repository URL: `https://github.com/VaradH8/Tracker.git`
   - Reference: `refs/heads/main`
   - Compose path: `compose.yml`
4. **Environment variables** — copy the contents of your `.env`
   (Portainer can read it directly via "Load variables from .env file"
   if you uploaded it).
5. **Deploy the stack**.

Portainer will:

- Pull the repo
- Build the `app` image (Next.js + Prisma) — first time takes ~3 min
- Start Postgres, wait for `pg_isready`
- Start the app — it runs `prisma db push` against Postgres (creates
  every table), then `prisma db seed` because `RUN_SEED=1` (loads
  Varad/Manasi/Rohit/Sanjana + project data), then `next start`

### 1.4 Confirm

- `docker logs tracker-app-1` should end with `Listening on http://0.0.0.0:3000`.
- Hit `http://<ec2-public-ip>:3000` — you should land on the login page.
- Sign in as `varad@example.com` / `tracker2026`.
- **Important — turn the seed off now.** Edit Portainer's env vars:
  `RUN_SEED=0`. Redeploy the stack. (If you skip this, every restart
  wipes whatever you've added back to the demo data.)

---

## 2. Putting it on a real URL with TLS

The app speaks plain HTTP on port 3000. In front of it you want
Caddy or nginx (Caddy is one-liner with auto-Let's-Encrypt).

Add this to your existing reverse proxy on the box:

```Caddyfile
tracker.yourcompany.com {
  reverse_proxy localhost:3000
}
```

…or, if you'd rather run Caddy inside the same compose stack, add a
second service to `compose.yml`. The repo's `caddy/` directory has a
sample Caddyfile (from the original PRD scaffold) you can adapt.

---

## 3. Updates

On a normal code push:

```sh
cd /opt/tracker
git pull
```

Then in Portainer, **Stack → Editor → Update the stack** (toggle
"Re-pull image and redeploy" so the build is fresh). Postgres data
persists in the `tracker_pgdata` named volume across redeploys.

If the schema changes (new column, new table), `prisma db push` on
boot will sync it automatically without dropping data.

---

## 4. Backups

The named volume `tracker_pgdata` holds everything. The simplest backup
loop:

```sh
docker exec tracker-postgres-1 \
  pg_dump -U tracker tracker | gzip > "/opt/tracker-backups/$(date +%F).sql.gz"
```

Wire that into a cron and ship the dumps to S3 (the original
`.env.example` had stub vars for that — re-add them when you wire up
the backup script).

To restore:

```sh
gunzip -c backup.sql.gz | docker exec -i tracker-postgres-1 \
  psql -U tracker -d tracker
```

---

## 5. Troubleshooting

- **App container restarts forever** — `docker logs tracker-app-1`.
  The most common cause is `DATABASE_URL` not resolving; check Postgres
  is healthy (`docker ps` should show `(healthy)`).
- **"That account is deactivated" on first login** — `RUN_SEED` didn't
  run. Set `RUN_SEED=1` and redeploy once.
- **Forgot a password** — Admin → Users → key icon next to the row.
- **Task-log attachments fail with "couldn't be saved to storage"** —
  the `/uploads` volume isn't writable by the app user. The container
  runs as `app`, and Docker creates a mount point that doesn't exist in
  the image as `root:root`, so the process can't write to it.

  The image now creates and chowns `/uploads` itself, which fixes any
  volume created from this version onward. A volume that already exists
  keeps the ownership it had, so fix it once on the host:

  ```
  docker exec -u 0 tracker-app-1 chown -R app:app /uploads
  ```

  Run it as root (`-u 0`) inside the app container, and chown **by name**.
  Don't guess a numeric uid: the image creates the user with
  `adduser -S`, so on Alpine it gets a system uid (around 100), not 1000.

  Check it worked — this must print OK:

  ```
  docker exec tracker-app-1 sh -c 'touch /uploads/.probe && echo OK && rm /uploads/.probe'
  ```

  The app logs the failing path and the `UPLOAD_DIR` value on every
  refusal, so `docker logs tracker-app-1` will name the directory if the
  cause is something else.
- **Need to wipe and reseed** — `docker volume rm tracker_tracker_pgdata`
  then redeploy with `RUN_SEED=1`. This nukes everything; back up first
  if there's real data.

---

## 6. Going live with real users — checklist

Before you hand the URL to teammates:

- [ ] **Bootstrap the Admin.** On a freshly seeded deploy, hit
      `https://<host>/signup` once and create the founder/admin account.
      The route auto-locks after the first user, so the next person who
      visits gets a "Sign-up is closed, ask your admin" screen. (If you
      somehow lost the admin password, wipe the User table and re-bootstrap.)
- [ ] **Set `RUN_SEED=0`** in Portainer env vars (you should already be
      here after first boot — confirm).
- [ ] **HTTPS.** Run Caddy in front of the app and put a real domain on
      it (Section 2). Browsers refuse to send cookies cross-origin on
      plain HTTP from anywhere except localhost; teammates will get
      "wrong password" on every login if you skip this.
- [ ] **Once HTTPS is live**, set `SESSION_COOKIE_SECURE=1` in the
      Portainer env vars and redeploy. The session cookie is then only
      sent over TLS.
- [ ] **`POSTGRES_PASSWORD`** is a strong random value (24+ chars). The
      DB isn't exposed to the host network in `compose.yml` — Postgres
      only listens inside the Docker network — but the password still
      matters for defence-in-depth.
- [ ] **EC2 security group**: only 80/443 (Caddy) open to the world, not
      3000 directly. Optionally 9443 for Portainer over your VPN/admin
      CIDR. **Never expose 5432 publicly.**
- [ ] **Add users.** Admin → Users → Add user for each teammate. Use the
      copy-to-clipboard button to get the initial password, hand it to
      them via 1Password / Slack DM / in person — not over the same
      email account they'll use to sign in.
- [ ] **Backups.** Wire a daily `pg_dump` to S3 (sample command in
      Section 4). Without this, a corrupted volume = total data loss.

### Known limitations to flag to your team

1. **Email isn't wired yet.** Notifications show up in the in-app bell
   + the Settings → Email log table, but the SMTP fields in
   Settings → General don't actually send anything outbound. Plan to
   add nodemailer + the SMTP creds you put in Settings before users
   rely on email reminders.
2. **Tracker-side file attachments are metadata-only.** Uploading a file
   on a *Tracker* task records its name, size, and uploader, but the
   bytes aren't stored — there's no S3/blob backing yet. Tell that team
   to keep using their existing file share; those attachments are an
   index, not storage.

   Engineering **task-log** attachments are different: they do store the
   bytes, on the `tracker_uploads` volume under `domain/<taskId>/`. That
   volume is included in nothing that backs up Postgres, so add it to the
   backup story before people put anything they can't lose there.
3. **Forgot-password is admin-only.** A user who forgets their password
   has to ask the admin to reset it from Users → key icon. There's no
   self-serve "Forgot password" email flow yet.
4. **No rate limiting on /api/auth/signin.** Fine on a private subnet
   behind your VPN; if the URL is exposed to the open internet, add
   nginx/Caddy rate limiting on `/api/auth/*` or stand up fail2ban.
5. **`prisma db push` is used on boot, not migrations.** Safe for an
   internal tool where the only person changing the schema is you, but
   means schema rollbacks need a manual restore from backup.

---

## 7. What's actually running

- **`postgres`** (image `postgres:16-alpine`) — the data. Inside the
  Docker network only; not exposed to the host.
- **`app`** (built from `demo/Dockerfile`) — the Next.js server + the
  Prisma client. Runs `prisma db push` on boot, then `next start`.
  Exposes `:3000` to the host.
- Volume `tracker_pgdata` — the DB on disk.
- Network `tracker_net` — bridge network just for these two.

Everything you see in the app today (accounts, login, signup, change
password, projects, task drawer, calendar, etc.) is the front-end UI;
the **auth flow is fully backend-backed** (cookies + DB sessions +
bcrypt). The rest of the data (tasks, projects, time logs, audit) is
still loaded from in-memory seed in the browser — that migration is
Phase 1 and lands in a follow-up.
