-- Task assignment flow: a task is handed out, submitted by the assignee
-- with a note and the day they did the work, then approved or sent back
-- by whoever assigned it.
--
-- Six nullable columns and one nullable foreign key. Nothing is read,
-- rewritten or dropped, so a redeploy preserves existing rows and tasks
-- created before this flow simply have no submission or review recorded
-- (CLAUDE.md rule 9).

-- AlterTable
ALTER TABLE "DomainTask" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedNote" TEXT,
ADD COLUMN     "submittedOn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
