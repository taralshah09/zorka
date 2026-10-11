-- CreateTable
CREATE TABLE "phases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "Goal" NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "target_weight_kg" DOUBLE PRECISION,
    "kcal" INTEGER,
    "protein_g" INTEGER,
    "closed_date" TEXT,
    "summary" JSONB,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phases_user_id_updated_at_idx" ON "phases"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
