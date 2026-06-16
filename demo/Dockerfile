# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js app + Prisma client.
# Final image runs `next start` against the Postgres URL from env.

ARG NODE_VERSION=20-alpine

# --- deps: install full dependencies (cached) ---
# `--ignore-scripts` skips the `postinstall: prisma generate` hook, which
# would otherwise fail here because the prisma/ schema isn't in this stage.
# We re-generate the Prisma client in the build stage below, where the
# schema is available.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --ignore-scripts

# --- build: generate Prisma client + Next build ---
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma needs to know the engine target at generate time; the connection
# string isn't needed for `prisma generate`, but we set a placeholder so
# any module-side validation passes during build.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# --- runner: minimal image with only the built app + production deps ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/next.config.* ./

RUN chown -R app:app /app
USER app

EXPOSE 3000

# On boot:
#   1. Apply any new migrations from prisma/migrations/. Idempotent: the
#      _prisma_migrations table in the DB tracks what's already been
#      applied. NEVER applies a destructive change without a migration
#      file committed for it, so an accidental schema diff can no longer
#      drop a column in production.
#   2. Re-run post-push.sql for any extras Prisma can't express (e.g.
#      the partial unique index on TimeEntry). Idempotent — safe to
#      re-run.
#   3. Optionally run the seed (set RUN_SEED=1 once on first boot).
#   4. Start Next.
#
# First-time migration adoption on an existing prod DB: see
# specs/MIGRATIONS.md (commit message of the migrate-deploy switch).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db execute --file prisma/post-push.sql --schema prisma/schema.prisma && ([ \"$RUN_SEED\" = \"1\" ] && npx prisma db seed || true) && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000"]
