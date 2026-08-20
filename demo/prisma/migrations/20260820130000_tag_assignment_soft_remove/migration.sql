-- AlterTable
ALTER TABLE "DomainTagAssignment" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT;

-- CreateIndex
CREATE INDEX "DomainTagAssignment_removedAt_idx" ON "DomainTagAssignment"("removedAt");

-- AddForeignKey
ALTER TABLE "DomainTagAssignment" ADD CONSTRAINT "DomainTagAssignment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

