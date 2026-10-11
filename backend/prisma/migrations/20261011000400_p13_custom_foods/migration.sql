-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "client_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "owner_user_id" UUID;

-- CreateIndex
CREATE INDEX "foods_owner_user_id_idx" ON "foods"("owner_user_id");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
