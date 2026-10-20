// Life plan stores (LA1–LA5) against production modules with real SQLite: day_brief, day_plan and memory_fact writes,
// their outbox payloads (what the server validates), acks, the pull rules (an unsynced local edit wins), requeue on a
// full pull, one live row per date or key, and the daily memory job (a dismissed fact never comes back).
// Node 22+; npm run test:life. Native and React boundaries are mocked, as in test-pa.cjs.
/* global __dirname */
const { DatabaseSync } = require("node:sqlite");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "..");
let sql, modules, preferences, acks, pullers;

function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const req = (name) => {
    if (name === "expo-sqlite/kv-store")
      return {
        __esModule: true,
        default: {
          getItemSync: (key) => preferences.get(key) ?? null,
          setItemSync: (key, value) => preferences.set(key, value),
          removeItemSync: (key) => preferences.delete(key),
        },
      };
    if (name === "expo-crypto") return { randomUUID };
    if (name === "react") return { useMemo: (fn) => fn() };
    if (name === "zustand") {
      const { createStore } = require("zustand/vanilla");
      return { create: (init) => { const s = createStore(init); return Object.assign((sel) => sel(s.getState()), s); } };
    }
    if (name === "expo-sqlite")
      return {
        openDatabaseSync: () => ({
          execSync: (q) => sql.exec(q),
          runSync: (q, ...a) => sql.prepare(q).run(...a),
          getFirstSync: (q, ...a) => sql.prepare(q).get(...a) ?? null,
          getAllSync: (q, ...a) => sql.prepare(q).all(...a),
          withTransactionSync: (fn) => {
            sql.exec("BEGIN");
            try {
              fn();
              sql.exec("COMMIT");
            } catch (e) {
              sql.exec("ROLLBACK");
              throw e;
            }
          },
        }),
      };
    if (name === "@/core/sync/engine")
      return { notifyLocalWrite: () => {}, onAcknowledged: (entity, fn) => acks.set(entity, fn), useSyncStatus: (sel) => sel({ lastSyncedAt: 0 }) };
    if (name === "@/core/sync/pull") return { onPulled: (entity, p) => pullers.set(entity, p) };
    if (name === "@/features/gym/store") return { workoutsBetween: () => [{ localDate: "2026-10-05", startedAt: "2026-10-05T07:00:00" }] };
    if (name === "@/features/water/store") return { glassesBetween: () => new Map() };
    if (name.startsWith("@/")) return load(path.join(root, "src", `${name.slice(2)}.ts`));
    if (name.startsWith("@shared/")) return load(path.join(root, "../shared", `${name.slice(8)}.ts`));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name.endsWith(".js") ? name.slice(0, -3) + ".ts" : `${name}.ts`));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(req, module, module.exports);
  return module.exports;
}
const feature = (name) => load(path.join(root, "src/features", `${name}.ts`));
const outbox = (entity) => sql.prepare("SELECT * FROM outbox WHERE entity = ? ORDER BY created_at").all(entity);

beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  modules = new Map();
  preferences = new Map();
  acks = new Map();
  pullers = new Map();
  load(path.join(root, "src/core/storage/db.ts")).getDb();
});
afterEach(() => sql.close());

const EXPO = { blocks: [{ from: 780, to: 1140, kind: "event", label: "Expo" }], whereabouts: "away_local", mealAccess: { lunch: "packed" }, flags: [] };

test("a brief is saved once per date, validated, queued with the server's payload, and marked synced on ack", () => {
  const briefs = feature("life/briefs");
  const first = briefs.saveBrief("a", "2026-10-21", "expo 1 to 7", { ...EXPO, blocks: [...EXPO.blocks, { from: "x" }] }, "confirmed");
  const again = briefs.saveBrief("a", "2026-10-21", "expo 1 to 7, dinner at 8", EXPO, "confirmed");
  assert.equal(again.id, first.id);
  assert.equal(sql.prepare("SELECT count(*) n FROM day_briefs").get().n, 1);
  assert.deepEqual(briefs.briefFor("a", "2026-10-21").facts.blocks, EXPO.blocks);
  const ops = outbox("day_brief");
  assert.equal(ops.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(ops[1].payload)).sort(), ["localDate", "parsed", "rawText", "source", "status"]);
  acks.get("day_brief")(ops[1]);
  assert.equal(sql.prepare("SELECT synced FROM day_briefs").get().synced, 1);
  assert.equal(briefs.briefFor("b", "2026-10-21"), null);
  assert.deepEqual([...briefs.briefsBetween("a", "2026-10-19", "2026-10-25").keys()], ["2026-10-21"]);
});

test("pull: the server copy lands; an unsynced local edit wins; a deleted record goes; missing ones are re-queued", () => {
  const briefs = feature("life/briefs");
  const p = pullers.get("day_brief");
  p.apply("a", { id: "srv", deleted: false, data: { localDate: "2026-10-22", rawText: "flight", parsed: EXPO, status: "confirmed", source: "brief", clientUpdatedAt: "2026-10-20T10:00:00.000Z" } });
  assert.equal(briefs.briefFor("a", "2026-10-22").rawText, "flight");
  const local = briefs.saveBrief("a", "2026-10-22", "flight at 6", EXPO, "confirmed");
  p.apply("a", { id: local.id, deleted: false, data: { localDate: "2026-10-22", rawText: "older", parsed: EXPO, status: "confirmed", source: "brief", clientUpdatedAt: "2026-10-20T11:00:00.000Z" } });
  assert.equal(briefs.briefFor("a", "2026-10-22").rawText, "flight at 6");
  sql.prepare("UPDATE day_briefs SET synced = 1").run();
  sql.exec("DELETE FROM outbox");
  assert.equal(p.requeueMissing("a", new Set()), 1);
  assert.equal(outbox("day_brief").length, 1);
  p.apply("a", { id: local.id, deleted: true, data: null });
  assert.equal(sql.prepare("SELECT count(*) n FROM day_briefs WHERE id = ?").get(local.id).n, 1); // still unsynced after requeue
});

test("a plan keeps its acceptance when it's refreshed; one row per date", () => {
  const plans = feature("life/plans");
  const plan = { date: "2026-10-21", dayType: "away", assumed: false, targets: { kcal: 2000, proteinG: 130, steps: 8000, waterGlasses: 8 }, protein: { achievableG: 130, stepUp: null }, items: [], why: [], week: { days: [], forgiven: { kcal: 0, proteinG: 0, steps: 0, sessions: 0 }, sessionsTarget: 3, sessionsDone: 0, why: [] } };
  const a = plans.savePlan("a", "2026-10-21", plan, "h1", true);
  const b = plans.savePlan("a", "2026-10-21", { ...plan, dayType: "busy" }, "h2");
  assert.equal(b.id, a.id);
  assert.equal(b.acceptedAt, a.acceptedAt);
  assert.equal(plans.planFor("a", "2026-10-21").plan.dayType, "busy");
  const payload = JSON.parse(outbox("day_plan").at(-1).payload);
  assert.deepEqual(Object.keys(payload).sort(), ["acceptedAt", "inputsHash", "localDate", "plan"]);
  assert.equal(payload.inputsHash, "h2");
});

test("remember a fact from chat; the memory job learns, and a dismissed fact never comes back", () => {
  const memory = feature("life/memory");
  const fact = memory.rememberFact("a", "Lunch is at the mess on weekdays");
  assert.equal(fact.status, "active");
  assert.equal(fact.key, "note:lunch-is-at-the-mess-on-weekdays");
  assert.deepEqual(Object.keys(JSON.parse(outbox("memory_fact")[0].payload)).sort(), ["confidence", "evidence", "key", "kind", "source", "status", "text", "validFrom", "validUntil", "value"]);

  // Five Monday-to-Friday lunches of the same meal in the window.
  for (const [i, date] of ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"].entries()) {
    sql.prepare("INSERT INTO meal_logs (id,user_id,meal_type,logged_at,local_date,source,client_updated_at) VALUES (?,?,?,?,?,?,?)").run(`m${i}`, "a", "lunch", `${date}T13:30:00`, date, "search", `${date}T13:30:00`);
    sql.prepare("INSERT INTO meal_items (id,meal_id,position,food_id,name,quantity,unit,grams,kcal,protein_g,carbs_g,fat_g) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(`i${i}`, `m${i}`, 0, "dal", "Dal", 1, "katori", 150, 150, 9, 18, 4.5);
  }
  assert.ok(memory.runMemoryJob("a", "2026-10-20", 120) > 0);
  const lunch = memory.factsFor("a").find((f) => f.key === "usual_meal:lunch:weekday");
  assert.equal(lunch.value.text, "dal");
  assert.equal(memory.runMemoryJob("a", "2026-10-20", 120), 0); // once a day
  memory.setFactStatus("a", lunch, "dismissed");
  memory.runMemoryJob("a", "2026-10-20", 120, true);
  assert.equal(memory.factsFor("a").find((f) => f.key === "usual_meal:lunch:weekday").status, "dismissed");
  assert.equal(memory.factsFor("a").filter((f) => f.key === "usual_meal:lunch:weekday").length, 1);
});
