-- Make Task.targetDate optional: a task has no deadline until one is set.
-- Widening only — existing target dates are left exactly as they are.
ALTER TABLE "Task" ALTER COLUMN "targetDate" DROP NOT NULL;
