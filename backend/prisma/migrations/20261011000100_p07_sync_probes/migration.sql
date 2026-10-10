-- CreateTable
CREATE TABLE "sync_probes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "client_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_probes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_probes_user_id_idx" ON "sync_probes"("user_id");

-- AddForeignKey
ALTER TABLE "sync_probes" ADD CONSTRAINT "sync_probes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
