-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "water_goal_glasses" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "water_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "local_date" TEXT NOT NULL,
    "glasses" INTEGER NOT NULL,
    "logged_at" TIMESTAMPTZ(3) NOT NULL,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "water_logs_user_id_updated_at_idx" ON "water_logs"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "water_logs_user_id_local_date_idx" ON "water_logs"("user_id", "local_date");

-- AddForeignKey
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
