-- DOWN migration for 20261011000200_p11_foods (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000200_p11_foods.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "food_units" DROP CONSTRAINT "food_units_food_id_fkey";

-- DropTable
DROP TABLE "foods";

-- DropTable
DROP TABLE "food_units";

-- DropEnum
DROP TYPE "Cuisine";

-- DropEnum
DROP TYPE "FoodCategory";

-- DropEnum
DROP TYPE "FoodUnitKind";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000200_p11_foods';

COMMIT;
