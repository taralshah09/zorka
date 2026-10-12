-- DOWN migration for 20261012000000_water.
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261012000000_water.down.sql

BEGIN;

-- DropTable
DROP TABLE "water_logs";

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "water_goal_glasses";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261012000000_water';

COMMIT;
