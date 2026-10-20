// P05 seed: the dummy users (D5): 3 demo personas plus 3 fresh users who have not done setup.
// Idempotent — safe to run any number of times.
// Users are upserted by fixed id; profiles are created empty and never overwritten, so a re-run
// keeps whatever onboarding (P09) has saved. Full demo history arrives at P40.
// P11: the curated food catalog (prisma/data/foods.ts), upserted by slug with stable ids.
// P19: the curated exercise list (prisma/data/exercises.ts), the same way.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { exercisesFromRows } from "../src/modules/exercises/catalog.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import { EXERCISE_SOURCE, EXERCISES } from "./data/exercises.js";
import { FOOD_SOURCE, FOODS } from "./data/foods.js";

export const DUMMY_USERS = [
  { id: "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11", displayName: "Riya" },
  { id: "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22", displayName: "Arjun" },
  { id: "9b3e5c70-2d4f-4e9c-9a43-7c9d5ebf2a33", displayName: "Meera" },
  // Fresh users for testing onboarding (S01 → setup). Their profiles stay empty until they onboard.
  { id: "a4c6e8f0-3b5d-4f1a-8b54-8dae6fc03b44", displayName: "Kabir" },
  { id: "b5d7f901-4c6e-4a2b-9c65-9ebf70d14c55", displayName: "Ananya" },
  { id: "c6e80a12-5d7f-4b3c-8d76-afc081e25d66", displayName: "Rohan" },
] as const;

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    for (const u of DUMMY_USERS) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: { id: u.id, displayName: u.displayName, profile: { create: {} } },
        update: { displayName: u.displayName },
      });
      await prisma.profile.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: {} });
    }
    const count = await prisma.user.count({ where: { id: { in: DUMMY_USERS.map((u) => u.id) } } });
    console.log(`Seed done: ${count} dummy users present.`);

    await seedFoods(prisma);
    await seedExercises(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Creates new curated foods, updates changed ones, and rewrites their units. A handful of queries, not
 *  one per food, so a re-run over Neon stays quick. User-created foods (P13) are never touched. */
async function seedFoods(prisma: PrismaClient) {
  const foods = foodsFromRows(FOODS);
  const existing = new Map(
    (await prisma.food.findMany({ where: { slug: { in: foods.map((f) => f.slug) } } })).map((f) => [f.slug, f]),
  );

  const toCreate = foods.filter((f) => !existing.has(f.slug));
  const toUpdate = foods.filter((f) => {
    const e = existing.get(f.slug);
    if (!e) return false;
    return (
      e.id !== f.id ||
      e.name !== f.name ||
      e.aliases.join("|") !== f.aliases.join("|") ||
      e.cuisine !== f.cuisine ||
      e.category !== f.category ||
      e.diet !== f.diet ||
      e.homeCooked !== f.homeCooked ||
      e.liquid !== f.liquid ||
      e.kcalPer100g !== f.kcalPer100g ||
      e.proteinPer100g !== f.proteinPer100g ||
      e.carbsPer100g !== f.carbsPer100g ||
      e.fatPer100g !== f.fatPer100g ||
      e.defaultUnit !== f.defaultUnit
    );
  });
  const data = ({ units: _units, ...f }: (typeof foods)[number]) => ({ ...f, source: FOOD_SOURCE });

  await prisma.$transaction([
    prisma.food.createMany({ data: toCreate.map(data), skipDuplicates: true }),
    ...toUpdate.map((f) => prisma.food.update({ where: { slug: f.slug }, data: data(f) })),
    prisma.foodUnitOption.deleteMany({ where: { foodId: { in: foods.map((f) => f.id) } } }),
    prisma.foodUnitOption.createMany({ data: foods.flatMap((f) => f.units.map((u) => ({ foodId: f.id, ...u }))) }),
  ]);

  const total = await prisma.food.count({ where: { source: FOOD_SOURCE } });
  console.log(`Foods: ${toCreate.length} created, ${toUpdate.length} updated, ${total} curated foods present.`);
}

/** Creates new curated exercises and updates changed ones. User-created exercises are never touched. */
async function seedExercises(prisma: PrismaClient) {
  const exercises = exercisesFromRows(EXERCISES);
  const existing = new Map(
    (await prisma.exercise.findMany({ where: { slug: { in: exercises.map((e) => e.slug) } } })).map((e) => [e.slug, e]),
  );

  const toCreate = exercises.filter((e) => !existing.has(e.slug));
  const toUpdate = exercises.filter((e) => {
    const x = existing.get(e.slug);
    if (!x) return false;
    return (
      x.id !== e.id ||
      x.name !== e.name ||
      x.aliases.join("|") !== e.aliases.join("|") ||
      x.category !== e.category ||
      x.type !== e.type ||
      x.referenceUrl !== e.referenceUrl ||
      x.deletedAt !== null
    );
  });
  const data = (e: (typeof exercises)[number]) => ({ ...e, source: EXERCISE_SOURCE, deletedAt: null });

  await prisma.$transaction([
    prisma.exercise.createMany({ data: toCreate.map(data), skipDuplicates: true }),
    ...toUpdate.map((e) => prisma.exercise.update({ where: { slug: e.slug }, data: data(e) })),
  ]);

  const total = await prisma.exercise.count({ where: { source: EXERCISE_SOURCE, deletedAt: null } });
  console.log(`Exercises: ${toCreate.length} created, ${toUpdate.length} updated, ${total} curated exercises present.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
