-- DOWN migration for 20261011000300_p12_meal_logs (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000300_p12_meal_logs.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "meal_logs" DROP CONSTRAINT "meal_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "meal_items" DROP CONSTRAINT "meal_items_meal_log_id_fkey";

-- DropForeignKey
ALTER TABLE "meal_items" DROP CONSTRAINT "meal_items_food_id_fkey";

-- DropTable
DROP TABLE "meal_logs";

-- DropTable
DROP TABLE "meal_items";

-- DropEnum
DROP TYPE "MealType";

-- DropEnum
DROP TYPE "MealSource";

-- DropEnum
DROP TYPE "OilLevel";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000300_p12_meal_logs';

COMMIT;
