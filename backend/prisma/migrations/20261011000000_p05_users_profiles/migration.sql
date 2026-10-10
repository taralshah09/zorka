-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('lose_fat', 'build_muscle', 'maintain', 'get_fitter');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female', 'unspecified');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('sedentary', 'light', 'moderate', 'active', 'very_active');

-- CreateEnum
CREATE TYPE "Diet" AS ENUM ('veg', 'eggetarian', 'jain', 'non_veg');

-- CreateEnum
CREATE TYPE "Pace" AS ENUM ('gentle', 'steady', 'ambitious');

-- CreateEnum
CREATE TYPE "Coach" AS ENUM ('drill_sergeant', 'calm_mentor', 'desi_legend');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "goal" "Goal",
    "age" INTEGER,
    "sex" "Sex",
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "activity_level" "ActivityLevel",
    "diet" "Diet",
    "target_weight_kg" DOUBLE PRECISION,
    "pace" "Pace",
    "coach" "Coach",
    "onboarded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
