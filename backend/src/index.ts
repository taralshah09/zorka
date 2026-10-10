import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { disconnectPrisma, getPrisma } from "./lib/prisma.js";
import { prismaSyncRepository } from "./modules/sync/sync.repository.js";
import { syncService } from "./modules/sync/sync.service.js";
import { prismaUsersRepository } from "./modules/users/users.repository.js";
import { usersService } from "./modules/users/users.service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = getPrisma(env.DATABASE_URL);

const app = createApp({
  logger,
  pingDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  users: usersService(prismaUsersRepository(prisma)),
  sync: syncService(prismaSyncRepository(prisma)),
});

const server = app.listen(env.PORT, () => {
  logger.info(`kimbo-api listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    disconnectPrisma().finally(() => process.exit(0));
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
