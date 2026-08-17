-- A task's history: who did what to it, when, and what they said.
--
-- One new table and nothing else. No existing table is read, altered or
-- dropped, so a redeploy preserves everything (CLAUDE.md rule 9). Tasks
-- that predate this simply have no events, and the UI falls back to the
-- state stored on the task itself.
--
-- The actor FK is RESTRICT rather than SET NULL on purpose: history that
-- rewrites itself when someone leaves is not history. Deleting a person
-- who has acted on a task is already refused by the users endpoint, which
-- names the blocker and points at deactivation instead.

-- CreateTable
CREATE TABLE "DomainTaskEvent" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainTaskEvent_taskId_idx" ON "DomainTaskEvent"("taskId");

-- AddForeignKey
ALTER TABLE "DomainTaskEvent" ADD CONSTRAINT "DomainTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DomainTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainTaskEvent" ADD CONSTRAINT "DomainTaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "DomainUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
