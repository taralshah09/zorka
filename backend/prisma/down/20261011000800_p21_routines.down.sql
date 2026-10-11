-- DOWN migration for 20261011000800_p21_routines (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000800_p21_routines.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_routine_id_fkey";

-- DropForeignKey
ALTER TABLE "routines" DROP CONSTRAINT "routines_user_id_fkey";

-- DropForeignKey
ALTER TABLE "routine_exercises" DROP CONSTRAINT "routine_exercises_routine_id_fkey";

-- DropForeignKey
ALTER TABLE "routine_exercises" DROP CONSTRAINT "routine_exercises_exercise_id_fkey";

-- AlterTable
ALTER TABLE "workouts" DROP COLUMN "routine_id";

-- DropTable
DROP TABLE "routines";

-- DropTable
DROP TABLE "routine_exercises";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000800_p21_routines';

COMMIT;
