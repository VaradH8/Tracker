-- Track when a task was completed. Additive and forward-only: a nullable
-- column, so existing rows (including already-Done tasks) are untouched
-- and default to NULL. NULL means "no recorded completion date" and the
-- weekly board falls back to the task's target week for those legacy rows.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
