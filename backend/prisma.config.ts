import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate, db pull, studio) talks to Neon over the DIRECT (unpooled)
// connection. The app's runtime connection uses the pooled DATABASE_URL through the
// pg driver adapter (src/lib/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
