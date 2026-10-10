-- DOWN migration for 20261011000000_p05_users_profiles (reviewed; generated with `prisma migrate diff`).
-- DESTRUCTIVE: drops tables and their data. Create a Neon branch as a restore point first.
-- Run against the DIRECT url:  npx prisma db execute --file prisma/down/20261011000000_p05_users_profiles.down.sql

BEGIN;

-- DropForeignKey
ALTER TABLE "public"."profiles" DROP CONSTRAINT "profiles_user_id_fkey";

-- DropTable
DROP TABLE "public"."users";

-- DropTable
DROP TABLE "public"."profiles";

-- DropEnum
DROP TYPE "public"."Goal";

-- DropEnum
DROP TYPE "public"."Sex";

-- DropEnum
DROP TYPE "public"."ActivityLevel";

-- DropEnum
DROP TYPE "public"."Diet";

-- DropEnum
DROP TYPE "public"."Pace";

-- DropEnum
DROP TYPE "public"."Coach";

-- Forget the migration so `prisma migrate deploy` can re-apply it later.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261011000000_p05_users_profiles';

COMMIT;
