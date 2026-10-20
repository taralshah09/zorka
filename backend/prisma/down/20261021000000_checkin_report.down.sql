-- DOWN migration for 20261021000000_checkin_report.
-- DESTRUCTIVE: drops the stored weekly report cards. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261021000000_checkin_report.down.sql

BEGIN;

-- AlterTable
ALTER TABLE "checkins" DROP COLUMN "report";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261021000000_checkin_report';

COMMIT;
