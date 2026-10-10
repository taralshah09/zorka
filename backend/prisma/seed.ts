// P05 seed: the 3 dummy users (D5). Idempotent — safe to run any number of times.
// Users are upserted by fixed id; profiles are created empty and never overwritten, so a re-run
// keeps whatever onboarding (P09) has saved. Full demo history arrives at P40.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

export const DUMMY_USERS = [
  { id: "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11", displayName: "Riya" },
  { id: "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22", displayName: "Arjun" },
  { id: "9b3e5c70-2d4f-4e9c-9a43-7c9d5ebf2a33", displayName: "Meera" },
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
