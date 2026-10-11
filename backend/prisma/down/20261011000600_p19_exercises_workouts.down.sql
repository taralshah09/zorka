-- DOWN migration for 20261011000600_p19_exercises_workouts (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000600_p19_exercises_workouts.down.sql
-- Roll back later phases first (P21, then P20): their tables and columns depend on these.

BEGIN;

-- DropForeignKey
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workout_exercises" DROP CONSTRAINT "workout_exercises_workout_id_fkey";

-- DropForeignKey
ALTER TABLE "workout_exercises" DROP CONSTRAINT "workout_exercises_exercise_id_fkey";

-- DropForeignKey
ALTER TABLE "workout_sets" DROP CONSTRAINT "workout_sets_workout_exercise_id_fkey";

-- DropTable
DROP TABLE "exercises";

-- DropTable
DROP TABLE "workouts";

-- DropTable
DROP TABLE "workout_exercises";

-- DropTable
DROP TABLE "workout_sets";

-- DropEnum
DROP TYPE "ExerciseCategory";

-- DropEnum
DROP TYPE "ExerciseType";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000600_p19_exercises_workouts';

COMMIT;
