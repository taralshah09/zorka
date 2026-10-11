-- DOWN migration for 20261011000400_p13_custom_foods (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000400_p13_custom_foods.down.sql

BEGIN;

-- User-created foods would otherwise leak into the shared catalog.
DELETE FROM "foods" WHERE "owner_user_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "foods" DROP CONSTRAINT "foods_owner_user_id_fkey";

-- DropIndex
DROP INDEX "foods_owner_user_id_idx";

-- AlterTable
ALTER TABLE "foods" DROP COLUMN "client_updated_at",
DROP COLUMN "deleted_at",
DROP COLUMN "owner_user_id";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000400_p13_custom_foods';

COMMIT;
