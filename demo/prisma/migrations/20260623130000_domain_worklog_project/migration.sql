-- Add an optional project link to domain work logs so people can record
-- which project they worked on. Additive and forward-only.

-- AlterTable
ALTER TABLE "DomainWorkLog" ADD COLUMN "projectId" INTEGER;

-- CreateIndex
CREATE INDEX "DomainWorkLog_projectId_idx" ON "DomainWorkLog"("projectId");

-- AddForeignKey
ALTER TABLE "DomainWorkLog" ADD CONSTRAINT "DomainWorkLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DomainProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;