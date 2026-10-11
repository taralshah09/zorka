-- CreateEnum
CREATE TYPE "Cuisine" AS ENUM ('indian', 'indo_chinese', 'italian', 'continental', 'other');

-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('home_meal', 'restaurant', 'bread', 'rice', 'protein', 'dairy', 'drink', 'snack', 'sweet', 'fruit', 'vegetable');

-- CreateEnum
CREATE TYPE "FoodUnitKind" AS ENUM ('g', 'ml', 'piece', 'katori', 'bowl', 'plate_half', 'plate_full', 'glass', 'cup', 'tbsp', 'tsp', 'slice', 'serving');

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cuisine" "Cuisine" NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "diet" "Diet" NOT NULL,
    "home_cooked" BOOLEAN NOT NULL DEFAULT false,
    "liquid" BOOLEAN NOT NULL DEFAULT false,
    "kcal_per_100g" DOUBLE PRECISION NOT NULL,
    "protein_per_100g" DOUBLE PRECISION NOT NULL,
    "carbs_per_100g" DOUBLE PRECISION NOT NULL,
    "fat_per_100g" DOUBLE PRECISION NOT NULL,
    "default_unit" "FoodUnitKind" NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_units" (
    "food_id" UUID NOT NULL,
    "unit" "FoodUnitKind" NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "label" TEXT,

    CONSTRAINT "food_units_pkey" PRIMARY KEY ("food_id","unit")
);

-- CreateIndex
CREATE UNIQUE INDEX "foods_slug_key" ON "foods"("slug");

-- AddForeignKey
ALTER TABLE "food_units" ADD CONSTRAINT "food_units_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
