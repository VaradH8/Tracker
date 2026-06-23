-- Domain module: self-contained tables, fully additive. Touches none of
-- the existing tracker tables, so this is a safe forward-only migration.

-- CreateTable
CREATE TABLE "DomainUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Actionee',
    "dailyCapacity" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainProject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainTask" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'To Do',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainWorkLog" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainUser_email_key" ON "DomainUser"("email");

-- CreateIndex
CREATE INDEX "DomainSession_userId_idx" ON "DomainSession"("userId");

-- CreateIndex
CREATE INDEX "DomainProject_ownerId_idx" ON "DomainProject"("ownerId");

-- CreateIndex
CREATE INDEX "DomainTask_projectId_idx" ON "DomainTask"("projectId");

-- CreateIndex
CREATE INDEX "DomainTask_assigneeId_idx" ON "DomainTask"("assigneeId");

-- CreateIndex
CREATE INDEX "DomainWorkLog_userId_date_idx" ON "DomainWorkLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "DomainSession" ADD CONSTRAINT "DomainSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProject" ADD CONSTRAINT "DomainProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DomainProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTask" ADD CONSTRAINT "DomainTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainWorkLog" ADD CONSTRAINT "DomainWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainWorkLog" ADD CONSTRAINT "DomainWorkLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DomainTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;