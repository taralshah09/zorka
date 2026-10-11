-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "pr_kinds" TEXT[] DEFAULT ARRAY[]::TEXT[];
