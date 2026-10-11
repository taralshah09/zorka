-- DOWN migration for 20261011001200_p28_checkins (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Roll back P29 first if it was applied.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011001200_p28_checkins.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "checkins" DROP CONSTRAINT "checkins_user_id_fkey";

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "checkin_detailed";

-- DropTable
DROP TABLE "checkins";

-- DropEnum
DROP TYPE "CheckinStatus";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011001200_p28_checkins';

COMMIT;
