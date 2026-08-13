-- Expected tags/day, at two levels:
--   * DomainUser  — a Lead's estimate for a person before they have any
--     approved history to measure.
--   * DomainAllocation — what that person is expected to deliver on THIS
--     project specifically, which beats both the measured average and the
--     profile-level figure.
--
-- Both nullable and additive; nothing is read, rewritten or dropped.

-- AlterTable
ALTER TABLE "DomainUser" ADD COLUMN     "expectedTagsPerDay" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DomainAllocation" ADD COLUMN     "expectedTagsPerDay" DOUBLE PRECISION;

