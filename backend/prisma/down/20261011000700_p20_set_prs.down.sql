-- DOWN migration for 20261011000700_p20_set_prs (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000700_p20_set_prs.down.sql
-- Roll back P21 first if it was applied.

BEGIN;

-- AlterTable
ALTER TABLE "workout_sets" DROP COLUMN "pr_kinds";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000700_p20_set_prs';

COMMIT;
