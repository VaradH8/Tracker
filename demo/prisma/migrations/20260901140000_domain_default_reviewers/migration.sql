-- CreateTable
CREATE TABLE "DomainDefaultReviewer" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainDefaultReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainDefaultReviewer_ownerId_idx" ON "DomainDefaultReviewer"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainDefaultReviewer_ownerId_reviewerId_key" ON "DomainDefaultReviewer"("ownerId", "reviewerId");

-- AddForeignKey
ALTER TABLE "DomainDefaultReviewer" ADD CONSTRAINT "DomainDefaultReviewer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainDefaultReviewer" ADD CONSTRAINT "DomainDefaultReviewer_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

