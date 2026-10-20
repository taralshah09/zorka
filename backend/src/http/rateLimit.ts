// Rate limits for every /v1 route, with tighter per-user limits on the AI and AI + search routes.
// User ids come from the URL and aren't authenticated, so every request also counts against a per-IP ceiling.
// Counters live in a RateLimitStore: in memory today (one Render instance). A Redis store can implement the same
// interface later so counters survive sleep/redeploy and are shared across instances.
// Over the limit → 429 with the usual error envelope (code RATE_LIMITED) and a Retry-After header.
import type { Request, RequestHandler } from "express";

import { AppError } from "./errors.js";

export type RateLimitStore = {
  /** Counts one hit for `key` in the fixed window of `windowMs` that contains `now`. */
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
};

/** Fixed windows aligned to the epoch (so the daily window resets at 00:00 UTC). */
export function memoryRateLimitStore({ maxKeys = 100_000 } = {}): RateLimitStore & { size(): number } {
  const counters = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;

  const sweep = (now: number) => {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, c] of counters) if (c.resetAt <= now) counters.delete(key);
  };

  return {
    async hit(key, windowMs, now) {
      sweep(now);
      const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
      const id = `${key}@${resetAt}`;
      const existing = counters.get(id);
      if (existing) {
        existing.count += 1;
        return { ...existing };
      }
      // Rotating fake user ids could grow the map without bound; drop the oldest counter instead.
      if (counters.size >= maxKeys) counters.delete(counters.keys().next().value!);
      counters.set(id, { count: 1, resetAt });
      return { count: 1, resetAt };
    },
    size: () => counters.size,
  };
}

export type RateLimitConfig = {
  general: { perMinutePerUser: number; perMinutePerIp: number };
  ai: { perMinute: number; perDay: number };
  search: { perMinute: number; perDay: number };
  /** LA7 menu pages. Missing = MENU_RATE_LIMIT. */
  menu?: { perMinute: number; perDay: number };
};

/** LA7: a scan is at most 12 pages, and 6 scans a user a day (docs/LIFE_PLAN.md "Menu scan"). */
export const MENU_RATE_LIMIT = { perMinute: 12, perDay: 6 * 12 };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Routes that call an AI model. */
const AI_PATH = /^\/v1\/(users\/[^/]+\/(meals\/parse-(text|voice|photo)|workouts\/parse-voice|coach\/chat|brief\/parse|plan\/week)|dev\/ai\/chat)$/;
/** LA7: menu page reads (vision), limited per page on their own. */
const MENU_PATH = /^\/v1\/users\/[^/]+\/menu\/read$/;
/** Routes that call the search API (and an AI model). */
const SEARCH_PATH = /^\/v1\/users\/[^/]+\/(foods\/lookup|nearby)$/;
/** Never limited: Render's health check and the app's warm-up ping. */
const EXEMPT_PATH = /^\/(v1\/health)?$/;
const USER_ID = /^\/v1\/users\/([^/]+)(\/|$)/;

type Rule = { name: string; key: string; limit: number; windowMs: number };

function rulesFor(req: Request, config: RateLimitConfig): Rule[] {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const userId = USER_ID.exec(req.path)?.[1];
  // Routes without a user id (/foods, /users, /dev/*) fall back to the IP.
  const who = userId ? `user:${userId}` : `ip:${ip}`;
  const rules: Rule[] = [
    { name: "ip", key: `ip:${ip}`, limit: config.general.perMinutePerIp, windowMs: MINUTE },
  ];
  if (userId) rules.push({ name: "user", key: who, limit: config.general.perMinutePerUser, windowMs: MINUTE });

  const group = SEARCH_PATH.test(req.path) ? "search" : MENU_PATH.test(req.path) ? "menu" : AI_PATH.test(req.path) ? "ai" : null;
  if (group) {
    const { perMinute, perDay } = group === "menu" ? (config.menu ?? MENU_RATE_LIMIT) : config[group];
    // Checked minute first, so requests turned away by the minute limit don't use up the daily quota.
    rules.push({ name: `${group}-minute`, key: `${group}:${who}`, limit: perMinute, windowMs: MINUTE });
    rules.push({ name: `${group}-day`, key: `${group}:${who}`, limit: perDay, windowMs: DAY });
  }
  return rules;
}

function humanWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  return `about ${Math.round(seconds / 3600)} h`;
}

export function rateLimit(config: RateLimitConfig, store: RateLimitStore, now: () => number = Date.now): RequestHandler {
  return async (req, res, next) => {
    if (EXEMPT_PATH.test(req.path)) return next();
    try {
      for (const rule of rulesFor(req, config)) {
        const { count, resetAt } = await store.hit(`${rule.name}|${rule.key}`, rule.windowMs, now());
        if (count > rule.limit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now()) / 1000));
          res.setHeader("Retry-After", String(retryAfterSeconds));
          req.log?.warn({ rule: rule.name, key: rule.key, ip: req.ip }, "Rate limited");
          return next(
            new AppError("RATE_LIMITED", `Too many requests. Try again in ${humanWait(retryAfterSeconds)}.`, {
              retryAfterSeconds,
            }),
          );
        }
      }
    } catch (err) {
      // A store outage (e.g. Redis down later) must not take the API down: let the request through.
      req.log?.error({ err }, "Rate limit store failed; allowing request");
    }
    next();
  };
}
