-- DOWN migration for 20261011001000_activities.
-- DESTRUCTIVE: drops the activities table and its data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011001000_activities.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activities_user_id_fkey";

-- DropTable
DROP TABLE "activities";

-- DropEnum
DROP TYPE "ActivityKind";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011001000_activities';

COMMIT;
