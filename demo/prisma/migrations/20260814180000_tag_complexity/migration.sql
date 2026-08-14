-- Tag assignments record whether the batch is Simple or Complex.
--
-- One new column with a default, so every existing row reads as "Simple"
-- without being rewritten — the same meaning as leaving the dropdown
-- untouched. Nothing is read, altered or deleted (CLAUDE.md rule 9).

-- AlterTable
ALTER TABLE "DomainTagAssignment" ADD COLUMN     "complexity" TEXT NOT NULL DEFAULT 'Simple';
