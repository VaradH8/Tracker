-- Resource Engagement & Project Forecast. Additive and forward-only:
-- a nullable column on User (existing people simply have no track yet)
-- and a new table. Nothing existing is altered or dropped.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "track" TEXT;

-- CreateTable
CREATE TABLE "ResourceForecast" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "track" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "effortHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memberIds" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceForecast_projectId_track_key" ON "ResourceForecast"("projectId", "track");

-- AddForeignKey
ALTER TABLE "ResourceForecast" ADD CONSTRAINT "ResourceForecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
