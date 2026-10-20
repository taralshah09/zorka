-- DOWN migration for 20261020000000_life_plan.
-- DESTRUCTIVE: drops tables/columns and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261020000000_life_plan.down.sql

BEGIN;

-- DropTable
DROP TABLE "memory_facts";
DROP TABLE "day_plans";
DROP TABLE "day_briefs";

-- AlterTable
ALTER TABLE "profiles"
  DROP COLUMN "brief_prompt_minute",
  DROP COLUMN "budget",
  DROP COLUMN "has_fridge",
  DROP COLUMN "has_kitchen",
  DROP COLUMN "meal_source",
  DROP COLUMN "sessions_per_week",
  DROP COLUMN "work_pattern";

-- DropEnum
DROP TYPE "FactStatus";
DROP TYPE "FactSource";
DROP TYPE "FactKind";
DROP TYPE "BriefSource";
DROP TYPE "BriefStatus";
DROP TYPE "WorkPattern";
DROP TYPE "BudgetBand";
DROP TYPE "LifeMealSource";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261020000000_life_plan';

COMMIT;
