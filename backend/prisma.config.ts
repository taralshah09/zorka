import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate, db pull, studio) talks to Neon over the DIRECT (unpooled)
// connection. The app's runtime connection (pooled DATABASE_URL + driver adapter)
// is set up in P04.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
