-- Attendance and time off for the Engineering module.
--
-- One new table, nothing existing altered. A supervisor marks someone
-- present/absent/half-day (Approved on arrival); an SME or Actionee
-- requests a leave or half day (Pending until decided).


-- CreateTable
CREATE TABLE "DomainLeave" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "hours" DOUBLE PRECISION,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainLeave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainLeave_status_idx" ON "DomainLeave"("status");

-- CreateIndex
CREATE INDEX "DomainLeave_date_idx" ON "DomainLeave"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DomainLeave_userId_date_key" ON "DomainLeave"("userId", "date");

-- AddForeignKey
ALTER TABLE "DomainLeave" ADD CONSTRAINT "DomainLeave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainLeave" ADD CONSTRAINT "DomainLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainLeave" ADD CONSTRAINT "DomainLeave_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

