-- DOWN migration for 20261011000900_step_goal (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000900_step_goal.down.sql

BEGIN;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "step_goal";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000900_step_goal';

COMMIT;
