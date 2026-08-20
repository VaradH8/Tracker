-- CreateTable
CREATE TABLE "DomainDeliveryCorrection" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainDeliveryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainDeliveryCorrection_assignmentId_idx" ON "DomainDeliveryCorrection"("assignmentId");

-- CreateIndex
CREATE INDEX "DomainDeliveryCorrection_createdAt_idx" ON "DomainDeliveryCorrection"("createdAt");

-- AddForeignKey
ALTER TABLE "DomainDeliveryCorrection" ADD CONSTRAINT "DomainDeliveryCorrection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DomainTagAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainDeliveryCorrection" ADD CONSTRAINT "DomainDeliveryCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

