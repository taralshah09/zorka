// Env config, validated once at startup. Secrets come only from the environment (.env is git-ignored).
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Neon POOLED connection string (host contains "-pooler"). Used by the app at runtime. */
  DATABASE_URL: z.string().url(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Never print values: only the names of missing/invalid variables.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}. See backend/.env.example.`);
  }
  return parsed.data;
}
