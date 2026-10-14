// Env config, validated once at startup. Secrets come only from the environment (.env is git-ignored).
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Neon POOLED connection string (host contains "-pooler"). Used by the app at runtime. */
  DATABASE_URL: z.string().url(),
  /** Max open DB connections in the pg pool. Each query holds one for a full round trip, so this caps
   *  throughput (k6 load test, Oct 2026: the pg default of 10 capped the API at ~9 req/s). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

  // P14 · AI providers (D30). Comma-separated keys, one per account. Any of them may be empty; the
  // AI features then answer "AI isn't set up" and the app falls back to search.
  GROQ_API_KEYS: z.string().optional(),
  GEMINI_API_KEYS: z.string().optional(),
  OPENROUTER_API_KEYS: z.string().optional(),
  /** Which provider's keys are tried first. */
  AI_PROVIDER_ORDER: z
    .string()
    .default("groq,gemini,openrouter")
    .transform((s) => s.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(["groq", "gemini", "openrouter"])).min(1)),
  // Optional model overrides, <PROVIDER>_<CAPABILITY>_MODEL. Defaults are in modules/ai/ai.config.ts.
  GROQ_TEXT_MODEL: z.string().optional(),
  GROQ_VISION_MODEL: z.string().optional(),
  GROQ_STT_MODEL: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().optional(),
  GEMINI_VISION_MODEL: z.string().optional(),
  GEMINI_STT_MODEL: z.string().optional(),
  OPENROUTER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_VISION_MODEL: z.string().optional(),

  // P34 · Live search for nearby Zomato/Blinkit options (D59). Any of them may be empty; with none set the phone
  // shows "Couldn't load nearby options" and the other options still work.
  TAVILY_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  ANAKIN_API_KEY: z.string().optional(),
  /** Which search service is tried first. */
  SEARCH_PROVIDER_ORDER: z
    .string()
    .default("tavily,firecrawl,anakin")
    .transform((s) => s.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(["tavily", "firecrawl", "anakin"])).min(1)),

  // Rate limits (src/http/rateLimit.ts). Counters are in memory, so they reset when the instance sleeps or redeploys.
  /** Set to false for load tests: one k6 machine is one IP and would hit the per-IP ceiling. */
  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Proxy hops in front of the app, for the client IP (Render: 1). 0 = use the socket address. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_PER_MIN_USER: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_PER_MIN_IP: z.coerce.number().int().positive().default(300),
  /** AI routes: meal parse (text/voice/photo), gym voice parse, coach chat. One shared bucket per user. */
  RATE_LIMIT_AI_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AI_PER_DAY: z.coerce.number().int().positive().default(100),
  /** AI + search routes: food lookup, nearby. One shared bucket per user. */
  RATE_LIMIT_SEARCH_PER_MIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SEARCH_PER_DAY: z.coerce.number().int().positive().default(30),
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
