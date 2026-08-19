-- The scope agreed with the client, as distinct from what they have
-- released to us to work on.
--
-- One nullable column. Existing projects read back as NULL, which the
-- app treats as "not tracked" and hides — a zero would be
-- indistinguishable from a contract of nothing.


-- AlterTable
ALTER TABLE "DomainProject" ADD COLUMN     "contractTags" INTEGER;

