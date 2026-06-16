-- Post-push extras Prisma's schema can't express natively.
-- Idempotent: re-runs every container boot, never destructive.

-- One open timer per user, ever. Without this, two concurrent Start
-- requests both see "no open interval" and each insert a fresh open
-- row, leaving the user with two simultaneously-running timers.
-- The partial index makes that second insert fail with P2002, which
-- the timer route handles gracefully.
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_one_open_per_user"
  ON "TimeEntry" ("userId")
  WHERE "endedAt" IS NULL;
