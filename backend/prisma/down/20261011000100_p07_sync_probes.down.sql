-- DOWN migration for 20261011000100_p07_sync_probes (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000100_p07_sync_probes.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "sync_probes" DROP CONSTRAINT "sync_probes_user_id_fkey";

-- DropTable
DROP TABLE "sync_probes";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000100_p07_sync_probes';

COMMIT;
