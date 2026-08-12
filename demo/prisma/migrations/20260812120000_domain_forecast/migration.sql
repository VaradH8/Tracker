-- Forecast feature for the Domain module: divisions, resource
-- allocations with timelines, counted tag assignments, and the daily
-- completion submissions a Lead approves.
--
-- Purely additive and forward-only: new tables plus three nullable/
-- defaulted columns on DomainProject. No existing row is read, rewritten
-- or deleted, so a redeploy preserves all current data (CLAUDE.md rule 9).

-- AlterTable
ALTER TABLE "DomainProject" ADD COLUMN     "handoverDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "totalTags" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DomainDivision" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainProjectDivision" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "totalTags" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainProjectDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainAllocation" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainTagAssignment" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "divisionId" INTEGER,
    "assigneeId" TEXT NOT NULL,
    "assignedCount" INTEGER NOT NULL,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainTagSubmission" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approvedCount" INTEGER,
    "note" TEXT,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainTagSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainDivision_name_key" ON "DomainDivision"("name");

-- CreateIndex
CREATE INDEX "DomainProjectDivision_divisionId_idx" ON "DomainProjectDivision"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainProjectDivision_projectId_divisionId_key" ON "DomainProjectDivision"("projectId", "divisionId");

-- CreateIndex
CREATE INDEX "DomainAllocation_userId_idx" ON "DomainAllocation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainAllocation_projectId_userId_key" ON "DomainAllocation"("projectId", "userId");

-- CreateIndex
CREATE INDEX "DomainTagAssignment_projectId_idx" ON "DomainTagAssignment"("projectId");

-- CreateIndex
CREATE INDEX "DomainTagAssignment_assigneeId_idx" ON "DomainTagAssignment"("assigneeId");

-- CreateIndex
CREATE INDEX "DomainTagAssignment_divisionId_idx" ON "DomainTagAssignment"("divisionId");

-- CreateIndex
CREATE INDEX "DomainTagSubmission_assignmentId_date_idx" ON "DomainTagSubmission"("assignmentId", "date");

-- CreateIndex
CREATE INDEX "DomainTagSubmission_status_idx" ON "DomainTagSubmission"("status");

-- CreateIndex
CREATE INDEX "DomainTagSubmission_submittedById_idx" ON "DomainTagSubmission"("submittedById");

-- AddForeignKey
ALTER TABLE "DomainProjectDivision" ADD CONSTRAINT "DomainProjectDivision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DomainProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProjectDivision" ADD CONSTRAINT "DomainProjectDivision_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "DomainDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainAllocation" ADD CONSTRAINT "DomainAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DomainProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainAllocation" ADD CONSTRAINT "DomainAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainAllocation" ADD CONSTRAINT "DomainAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagAssignment" ADD CONSTRAINT "DomainTagAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DomainProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagAssignment" ADD CONSTRAINT "DomainTagAssignment_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "DomainDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagAssignment" ADD CONSTRAINT "DomainTagAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagAssignment" ADD CONSTRAINT "DomainTagAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagSubmission" ADD CONSTRAINT "DomainTagSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DomainTagAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagSubmission" ADD CONSTRAINT "DomainTagSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTagSubmission" ADD CONSTRAINT "DomainTagSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

