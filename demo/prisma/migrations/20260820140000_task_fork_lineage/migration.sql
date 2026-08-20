-- Fork lineage on Task: a developer can take their own copy of a colleague's
-- task and work it independently.
--
-- Two nullable columns and one self-referencing FK. No existing column is
-- altered or dropped and no row is touched, so every task that predates this
-- simply reads forkedFromId = NULL, i.e. "created outright, not a fork".
-- A redeploy preserves everything (CLAUDE.md rule 9).
--
-- The FK is SET NULL rather than CASCADE on purpose: if an original task is
-- ever deleted, the fork is somebody else's real work and must survive. It
-- just loses the pointer back to where it came from.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "forkedFromId" INTEGER;
ALTER TABLE "Task" ADD COLUMN "forkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_forkedFromId_idx" ON "Task"("forkedFromId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
