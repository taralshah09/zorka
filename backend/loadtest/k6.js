// k6 load / stress test for the API. Not part of the app build; run with the k6 CLI (https://k6.io).
//
//   k6 run -e PROFILE=smoke loadtest/k6.js                          # local, default BASE_URL
//   k6 run -e PROFILE=render -e BASE_URL=https://<host>/v1 loadtest/k6.js
//
// Profiles: smoke · load · stress · spike · soak (local machine), constrained (Docker capped to Render free size),
// render (the hosted free instance: light, read-only). AI / search endpoints are left out on purpose: they call paid
// third-party APIs and would measure those providers, not this backend.
//
// Env: BASE_URL (default http://localhost:4000/v1) · PROFILE (default smoke) · WRITES=0|1 (default 1, forced 0 on
// render) · FULL_PULL_RATE (default 0.05: share of app opens that pull /changes from the beginning). Writes are sync_probe ops through POST /users/:id/sync, which exercise the sync path without touching
// real user data. Point DATABASE_URL at a Neon branch, never the main database, for anything but `render`.
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "http://localhost:4000/v1").replace(/\/$/, "");
const PROFILE = __ENV.PROFILE || "smoke";
const WRITES = PROFILE !== "render" && __ENV.WRITES !== "0";
const FULL_PULL_RATE = Number(__ENV.FULL_PULL_RATE ?? 0.05);

const PROFILES = {
  smoke: [{ duration: "30s", target: 2 }],
  load: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  stress: [
    { duration: "2m", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "2m", target: 400 },
    { duration: "2m", target: 800 },
    { duration: "2m", target: 0 },
  ],
  spike: [
    { duration: "10s", target: 500 },
    { duration: "1m", target: 500 },
    { duration: "10s", target: 0 },
  ],
  soak: [
    { duration: "5m", target: 40 },
    { duration: "2h", target: 40 },
    { duration: "5m", target: 0 },
  ],
  // Docker run capped at --cpus=0.1 --memory=512m: step up slowly to find where the free-size box breaks.
  constrained: [
    { duration: "1m", target: 5 },
    { duration: "2m", target: 10 },
    { duration: "2m", target: 20 },
    { duration: "2m", target: 40 },
    { duration: "1m", target: 0 },
  ],
  // The real Render free instance + main database: gentle, short, read-only.
  render: [
    { duration: "30s", target: 5 },
    { duration: "3m", target: 10 },
    { duration: "30s", target: 0 },
  ],
};

if (!PROFILES[PROFILE]) throw new Error(`Unknown PROFILE "${PROFILE}". Use one of: ${Object.keys(PROFILES).join(", ")}`);

export const options = {
  stages: PROFILES[PROFILE],
  // One entry per endpoint in the summary instead of one per user id.
  tags: { profile: PROFILE },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300", "p(99)<800"],
    "http_req_duration{name:profile}": ["p(95)<250"],
    "http_req_duration{name:meals}": ["p(95)<250"],
    "http_req_duration{name:changes}": ["p(95)<400"],
    "http_req_duration{name:changesFull}": ["p(95)<1500"],
    "http_req_duration{name:workouts}": ["p(95)<300"],
    "http_req_duration{name:routines}": ["p(95)<300"],
    "http_req_duration{name:foodSearch}": ["p(95)<300"],
    "http_req_duration{name:sync}": ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

const FOOD_TERMS = ["rice", "egg", "dal", "chicken", "paneer", "oats", "roti", "banana", "milk", "curd"];

const ok = (r) => r.status >= 200 && r.status < 300;
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

// k6 has no Node crypto; a Math.random v4 is enough for test ids.
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function setup() {
  // Wakes a sleeping Render instance before the clock starts (free tier cold start is 30-50 s).
  const health = http.get(`${BASE}/health`, { timeout: "90s", tags: { name: "warmup" } });
  if (health.status !== 200) throw new Error(`Health check failed (${health.status}). Is the API up at ${BASE}?`);

  const res = http.get(`${BASE}/users`, { tags: { name: "warmup" } });
  const users = (res.json("users") || []).map((u) => u.id).filter(Boolean);
  if (!users.length) throw new Error("No users found. Seed the database first: npm run db:seed:demo");
  console.log(`profile=${PROFILE} base=${BASE} users=${users.length} writes=${WRITES}`);
  return { users };
}

export default function ({ users }) {
  const id = pick(users);
  const today = new Date().toISOString().slice(0, 10);

  // A phone pulls changes since its last cursor (an hour to a day ago); only a fresh install pulls everything.
  const fullPull = Math.random() < FULL_PULL_RATE;
  const since = new Date(Date.now() - (1 + Math.random() * 23) * 3600e3).toISOString();
  const changesUrl = fullPull ? `${BASE}/users/${id}/changes` : `${BASE}/users/${id}/changes?since=${since}`;

  // App open: the phone fetches these together.
  group("app open", () => {
    const res = http.batch([
      ["GET", `${BASE}/users/${id}/profile`, null, { tags: { name: "profile" } }],
      ["GET", `${BASE}/users/${id}/meals?date=${today}`, null, { tags: { name: "meals" } }],
      ["GET", changesUrl, null, { tags: { name: fullPull ? "changesFull" : "changes" } }],
    ]);
    check(res[0], { "profile 2xx": ok });
    check(res[1], { "meals 2xx": ok });
    check(res[2], { "changes 2xx": ok });
  });
  sleep(1);

  group("browse", () => {
    check(http.get(`${BASE}/foods?q=${pick(FOOD_TERMS)}&limit=20`, { tags: { name: "foodSearch" } }), {
      "foodSearch 2xx": ok,
    });
    check(http.get(`${BASE}/users/${id}/workouts?limit=20`, { tags: { name: "workouts" } }), { "workouts 2xx": ok });
    check(http.get(`${BASE}/users/${id}/routines`, { tags: { name: "routines" } }), { "routines 2xx": ok });
  });

  // Roughly one sync push per three iterations, like a phone flushing its outbox.
  if (WRITES && Math.random() < 0.33) {
    group("sync push", () => {
      const now = new Date().toISOString();
      const ops = Array.from({ length: 5 }, () => ({
        opId: uuid(),
        entity: "sync_probe",
        action: "upsert",
        id: uuid(),
        clientUpdatedAt: now,
        data: { note: "k6 load test" },
      }));
      const res = http.post(`${BASE}/users/${id}/sync`, JSON.stringify({ ops }), {
        headers: { "Content-Type": "application/json" },
        tags: { name: "sync" },
      });
      check(res, {
        "sync 2xx": ok,
        "sync all applied": (r) => ok(r) && (r.json("results") || []).every((x) => x.status === "applied"),
      });
    });
  }

  sleep(Math.random() * 2 + 1); // think time between screens
}
