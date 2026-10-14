// Prisma client singleton. Runtime traffic goes through Neon's POOLED url via the pg driver adapter;
// the Prisma CLI (migrate) uses DIRECT_URL from prisma.config.ts.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getPrisma(databaseUrl: string, poolMax = 20): PrismaClient {
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: poolMax }) });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

export type { PrismaClient };
