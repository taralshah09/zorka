-- CreateTable
CREATE TABLE "weight_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "local_date" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "logged_at" TIMESTAMPTZ(3) NOT NULL,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weight_logs_user_id_updated_at_idx" ON "weight_logs"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "weight_logs_user_id_local_date_idx" ON "weight_logs"("user_id", "local_date");

-- AddForeignKey
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
