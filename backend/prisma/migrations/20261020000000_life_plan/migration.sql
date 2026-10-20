-- CreateEnum
CREATE TYPE "LifeMealSource" AS ENUM ('home_self', 'home_family', 'mess', 'canteen', 'eat_out', 'mixed');

-- CreateEnum
CREATE TYPE "BudgetBand" AS ENUM ('comfortable', 'careful', 'tight');

-- CreateEnum
CREATE TYPE "WorkPattern" AS ENUM ('office', 'shifts', 'student', 'wfh', 'irregular');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "BriefSource" AS ENUM ('brief', 'calendar', 'inferred');

-- CreateEnum
CREATE TYPE "FactKind" AS ENUM ('constraint', 'pattern', 'preference', 'event');

-- CreateEnum
CREATE TYPE "FactSource" AS ENUM ('onboarding', 'brief', 'chat', 'inferred', 'user');

-- CreateEnum
CREATE TYPE "FactStatus" AS ENUM ('suggested', 'active', 'dismissed');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "brief_prompt_minute" INTEGER,
ADD COLUMN     "budget" "BudgetBand",
ADD COLUMN     "has_fridge" BOOLEAN,
ADD COLUMN     "has_kitchen" BOOLEAN,
ADD COLUMN     "meal_source" "LifeMealSource",
ADD COLUMN     "sessions_per_week" INTEGER,
ADD COLUMN     "work_pattern" "WorkPattern";

-- CreateTable
CREATE TABLE "day_briefs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "local_date" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "status" "BriefStatus" NOT NULL,
    "source" "BriefSource" NOT NULL,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "day_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "local_date" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "inputs_hash" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "day_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_facts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "FactKind" NOT NULL,
    "value" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "source" "FactSource" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "status" "FactStatus" NOT NULL,
    "valid_from" TEXT,
    "valid_until" TEXT,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memory_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_briefs_user_id_updated_at_idx" ON "day_briefs"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "day_briefs_user_id_local_date_idx" ON "day_briefs"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "day_plans_user_id_updated_at_idx" ON "day_plans"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "day_plans_user_id_local_date_idx" ON "day_plans"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "memory_facts_user_id_updated_at_idx" ON "memory_facts"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "memory_facts_user_id_key_idx" ON "memory_facts"("user_id", "key");

-- AddForeignKey
ALTER TABLE "day_briefs" ADD CONSTRAINT "day_briefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
