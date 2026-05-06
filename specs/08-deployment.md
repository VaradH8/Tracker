# 08 — Deployment (EC2 + Portainer + Docker)

The whole stack runs as a single Docker Compose project, managed via Portainer's web UI on a single EC2 instance.

## Target architecture

```
Internet
   │
   ▼
[ AWS EC2 — Ubuntu 24.04, t3.medium, security group allows 80/443/22 ]
   │
   ├── Docker Engine 24+
   │
   └── Portainer CE (port 9443, web UI)
        │
        └── Stack: project-tracker
             ├── caddy        (ports 80, 443; auto-TLS)
             ├── frontend     (nginx serving built React; internal :80)
             ├── backend      (FastAPI uvicorn; internal :8000)
             ├── worker       (APScheduler running scheduled jobs)
             ├── postgres     (volume: pgdata)
             └── redis        (volume: redisdata)
```

All inter-container communication is on the Docker bridge network. Only Caddy is exposed to the internet.

## Prerequisites

1. An AWS EC2 instance running Ubuntu 24.04, at least t3.medium (2 vCPU, 4 GB RAM)
2. Elastic IP attached
3. Security group allowing inbound: 22 (SSH from your IP), 80, 443, 9443 (Portainer — restrict to your IP)
4. A domain name pointed at the EC2 elastic IP (e.g., `tracker.yourcompany.com`)
5. An S3 bucket for backups in the same region
6. SMTP credentials (AWS SES or similar)

## One-time host setup (SSH into EC2)

```bash
# Install Docker
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Install Portainer
sudo docker volume create portainer_data
sudo docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Then visit `https://<EC2-public-IP>:9443` and complete the Portainer admin setup.

## compose.yml (root of the repo)

```yaml
name: project-tracker

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend
      - backend
    networks: [tracker_net]

  frontend:
    build: ./frontend
    image: tracker-frontend:latest
    restart: unless-stopped
    networks: [tracker_net]

  backend:
    build: ./backend
    image: tracker-backend:latest
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    command: >
      sh -c "alembic upgrade head &&
             python seed.py &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"
    networks: [tracker_net]

  worker:
    image: tracker-backend:latest
    restart: unless-stopped
    env_file: .env
    depends_on:
      backend:
        condition: service_started
    command: python -m app.jobs.scheduler
    networks: [tracker_net]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tracker
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracker"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [tracker_net]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data
    networks: [tracker_net]

  backup:
    image: tracker-backend:latest
    restart: "no"
    profiles: [backup]            # run on demand or via cron-style external trigger
    env_file: .env
    depends_on: [postgres]
    command: python -m app.jobs.backup
    networks: [tracker_net]

volumes:
  pgdata:
  redisdata:
  caddy_data:
  caddy_config:

networks:
  tracker_net:
    driver: bridge
```

## caddy/Caddyfile

```
tracker.yourcompany.com {
    encode gzip

    # Static frontend (Vite build served by nginx in the frontend container)
    handle /api/* {
        reverse_proxy backend:8000
    }

    handle {
        reverse_proxy frontend:80
    }

    log {
        output file /data/access.log
        format console
    }
}
```

Replace `tracker.yourcompany.com` with your real subdomain. Caddy will automatically obtain and renew TLS certs via Let's Encrypt.

## Frontend Dockerfile (multi-stage)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## Backend Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .
COPY . .
EXPOSE 8000
```

## Deploying via Portainer

1. In Portainer → **Stacks → Add stack**
2. Choose **Repository** as the build method
3. Point to your Git repo URL, branch `main`, compose path `compose.yml`
4. Add environment variables (paste contents of your `.env`)
5. Enable **Auto-update** with a webhook (optional) or a 5-minute poll interval
6. Click **Deploy the stack**

Portainer pulls the repo, builds images, starts containers in dependency order.

## Updates

When you push new code to `main`:
- If auto-update is enabled, Portainer pulls and redeploys within 5 minutes
- Otherwise, in Portainer → Stacks → project-tracker → **Pull and redeploy**

## Backups

Two layers:

1. **Application-level**: nightly `pg_dump` to S3 via the `backup` service. Triggered by APScheduler in the worker container at 2:00 AM IST. 14-day retention, lifecycle to Glacier after 30 days.
2. **EC2-level**: weekly EBS volume snapshot via AWS console or CLI. Provides recovery from full-disk corruption.

## Restore drill (run quarterly)

1. Spin up a staging EC2 instance with the same compose stack
2. Pull latest backup from S3: `aws s3 cp s3://tracker-backups/2026-05-04.sql.gz .`
3. Decrypt and restore: `gunzip < 2026-05-04.sql.gz | docker exec -i postgres psql -U tracker tracker`
4. Verify the app comes up and last few changes are present
5. Document any issues in a runbook

## Monitoring

For MVP, lightweight:
- Container health is visible in Portainer dashboard
- `/api/v1/admin/health` endpoint returns DB / email / disk status; can be polled by an external uptime service (UptimeRobot, BetterUptime free tier)
- Logs: `docker logs <container>` for ad-hoc; or mount a logs volume and tail in Portainer

Post-MVP can add Grafana / Prometheus.

## Security checklist

- [ ] Security group restricts SSH to office IP only
- [ ] Security group restricts Portainer port 9443 to office IP only
- [ ] Caddy serving HTTPS only (it auto-redirects 80 → 443)
- [ ] `SECRET_KEY` is a random 32-byte hex (not the example value)
- [ ] `POSTGRES_PASSWORD` is strong and not committed to git
- [ ] `.env` is in `.gitignore`; only `.env.example` is committed
- [ ] Initial admin password is changed on first login (forced)
- [ ] Backup encryption: `pg_dump | gzip | openssl enc -aes-256-cbc` before S3 upload
- [ ] S3 bucket has public access blocked, lifecycle policies set
- [ ] EC2 IAM role grants only the S3 bucket permissions needed for backups
