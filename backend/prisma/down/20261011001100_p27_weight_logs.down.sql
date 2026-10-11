-- DOWN migration for 20261011001100_p27_weight_logs (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Roll back P29 and P28 first if they were applied.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011001100_p27_weight_logs.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "weight_logs" DROP CONSTRAINT "weight_logs_user_id_fkey";

-- DropTable
DROP TABLE "weight_logs";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011001100_p27_weight_logs';

COMMIT;
