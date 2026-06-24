-- Org-wide settings (single-row table). Additive and forward-only.

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smtpFrom" TEXT,
    "workingHoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "workingDays" TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    "leaveTypes" TEXT NOT NULL DEFAULT 'Sick Leave,Casual Leave,Paid Leave,Unpaid Leave',
    "annualLeaveQuota" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);