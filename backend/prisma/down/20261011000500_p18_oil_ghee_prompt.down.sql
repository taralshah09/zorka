-- DOWN migration for 20261011000500_p18_oil_ghee_prompt (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000500_p18_oil_ghee_prompt.down.sql

BEGIN;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "oil_ghee_prompt";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000500_p18_oil_ghee_prompt';

COMMIT;
