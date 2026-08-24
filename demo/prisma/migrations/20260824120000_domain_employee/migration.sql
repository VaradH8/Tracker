-- Employee records, kept by HR. A person on the payroll is not the same
-- thing as a login: most of these people never sign in, so the record
-- stands on its own and an account can be attached later via userId.
--
-- One new table and nothing else. No existing table is read, altered or
-- dropped, and no row is touched — a redeploy preserves everything
-- (CLAUDE.md rule 9).
--
-- userId is SET NULL rather than CASCADE on purpose: deleting or replacing
-- a login account must never delete the person behind it. HR's record of an
-- employee outlives whatever credentials they were once given.

-- CreateTable
CREATE TABLE "DomainEmployee" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "joinedOn" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainEmployee_code_key" ON "DomainEmployee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEmployee_userId_key" ON "DomainEmployee"("userId");

-- CreateIndex
CREATE INDEX "DomainEmployee_name_idx" ON "DomainEmployee"("name");

-- AddForeignKey
ALTER TABLE "DomainEmployee" ADD CONSTRAINT "DomainEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DomainUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
