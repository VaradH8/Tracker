-- AlterTable
ALTER TABLE "DomainTask" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "hoursSpent" DOUBLE PRECISION,
ADD COLUMN     "includesWeekends" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DomainTaskReviewer" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'Pending',
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainTaskReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainTaskAttachment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'Brief',
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "storageKey" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainTaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainTaskReviewer_userId_decision_idx" ON "DomainTaskReviewer"("userId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "DomainTaskReviewer_taskId_userId_key" ON "DomainTaskReviewer"("taskId", "userId");

-- CreateIndex
CREATE INDEX "DomainTaskAttachment_taskId_idx" ON "DomainTaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "DomainTask_status_idx" ON "DomainTask"("status");

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTaskReviewer" ADD CONSTRAINT "DomainTaskReviewer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DomainTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTaskReviewer" ADD CONSTRAINT "DomainTaskReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTaskAttachment" ADD CONSTRAINT "DomainTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DomainTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTaskAttachment" ADD CONSTRAINT "DomainTaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

