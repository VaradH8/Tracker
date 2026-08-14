-- Tasks gain a division, and stop requiring a project.
--
--   * divisionId — optional, so a task can be pinned to one of a
--     project's divisions when that makes sense.
--   * projectId is now nullable — an "ad hoc" task is real work that
--     belongs to no project at all.
--   * status default moves to 'Assigned', matching the assign →
--     submit → approve flow. Existing rows keep whatever they hold;
--     the app folds the old values into Assigned on read.
--
-- All three are widening changes: a new nullable column, a dropped NOT
-- NULL, and a new default. No row is read, rewritten or deleted, so a
-- redeploy preserves everything (CLAUDE.md rule 9).

-- AlterTable
ALTER TABLE "DomainTask" ADD COLUMN     "divisionId" INTEGER,
ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'Assigned';

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "DomainDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
