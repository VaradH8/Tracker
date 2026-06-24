-- Give domain tasks a schedule: a start date and an estimated number of
-- hours to complete, alongside the existing deadline (targetDate).
-- Additive and forward-only.

-- AlterTable
ALTER TABLE "DomainTask" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "DomainTask" ADD COLUMN "estimatedHours" DOUBLE PRECISION;