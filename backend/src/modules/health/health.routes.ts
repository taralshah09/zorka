// GET /v1/health — API liveness plus a Prisma → Neon connectivity check.
import { Router } from "express";

export type DbPing = () => Promise<void>;

export function healthRoutes(pingDb: DbPing): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const started = performance.now();
    let db: { status: "ok" | "down"; latencyMs?: number } = { status: "down" };
    try {
      await pingDb();
      db = { status: "ok", latencyMs: Math.round(performance.now() - started) };
    } catch {
      // Details stay in the server log only; never leak connection info to clients.
      db = { status: "down" };
    }
    const ok = db.status === "ok";
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", db, time: new Date().toISOString() });
  });

  return router;
}
