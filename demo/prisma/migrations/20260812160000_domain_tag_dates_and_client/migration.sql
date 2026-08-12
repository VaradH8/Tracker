-- Second batch of Domain forecast changes:
--   * projects carry a client name (shown to actionees)
--   * tag assignments carry their own start / target dates
--
-- All three columns are nullable and additive. Nothing is read,
-- rewritten or dropped, so a redeploy preserves existing data
-- (CLAUDE.md rule 9).

-- AlterTable
ALTER TABLE "DomainProject" ADD COLUMN     "client" TEXT;

-- AlterTable
ALTER TABLE "DomainTagAssignment" ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "targetDate" TIMESTAMP(3);

