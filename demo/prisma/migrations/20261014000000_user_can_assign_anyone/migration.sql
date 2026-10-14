-- Per-person "assign tasks to anyone" permission. Additive: a defaulted
-- boolean column, so every existing account keeps today's behaviour.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "canAssignAnyone" BOOLEAN NOT NULL DEFAULT false;
