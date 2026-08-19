-- Handover dates derived from working days.
--
-- Additive only: two nullable columns on DomainProject recording how a
-- handover date was calculated, and a table of public holidays. Every
-- existing project keeps its handover date and reads back as NULL for
-- the two new columns, which the app treats as "typed in directly".


-- AlterTable
ALTER TABLE "DomainProject" ADD COLUMN     "totalWorkingDays" INTEGER,
ADD COLUMN     "workingDaysPerWeek" INTEGER;

-- CreateTable
CREATE TABLE "DomainHoliday" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainHoliday_date_key" ON "DomainHoliday"("date");

-- CreateIndex
CREATE INDEX "DomainHoliday_date_idx" ON "DomainHoliday"("date");

