-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('accepted', 'kept', 'skipped');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "checkin_detailed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "checkins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phase_id" UUID,
    "checkin_date" TEXT NOT NULL,
    "status" "CheckinStatus" NOT NULL,
    "logged_days" INTEGER NOT NULL,
    "previous_kcal" INTEGER NOT NULL,
    "new_kcal" INTEGER,
    "protein_g" INTEGER,
    "carbs_g" INTEGER,
    "fat_g" INTEGER,
    "avg_intake_kcal" DOUBLE PRECISION,
    "estimated_burn_kcal" DOUBLE PRECISION,
    "trend_start_kg" DOUBLE PRECISION,
    "trend_end_kg" DOUBLE PRECISION,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkins_user_id_updated_at_idx" ON "checkins"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "checkins_user_id_checkin_date_idx" ON "checkins"("user_id", "checkin_date");

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
