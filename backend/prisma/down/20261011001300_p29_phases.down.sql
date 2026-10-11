-- DOWN migration for 20261011001300_p29_phases (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011001300_p29_phases.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "phases" DROP CONSTRAINT "phases_user_id_fkey";

-- DropTable
DROP TABLE "phases";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011001300_p29_phases';

COMMIT;
