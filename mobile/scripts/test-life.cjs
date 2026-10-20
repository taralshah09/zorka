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
const apiCalls = { online: true, bodies: [], handler: async () => ({}) };

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
    if (name === "@/core/api/client") return { api: (...args) => apiCalls.handler(...args) };
    if (name === "@/core/network/network") return { useNetwork: { getState: () => ({ online: apiCalls.online }) } };
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

test("the tracker follows the day's plan: Kabir's 68 g realistic protein replaces the 135 g base", () => {
  const { withPlan, targetsOn, waterFor } = feature("life/dayTargets");
  const plans = feature("life/plans");
  const base = { kcal: 2750, proteinG: 135, carbsG: 365, fatG: 76, steps: 10000, floorKcal: 1500, tdee: 2500 };
  assert.equal(targetsOn("a", "2026-10-20", base), base); // no plan: the base, unchanged
  const plan = (targets) => ({ date: "2026-10-20", dayType: "normal", assumed: false, targets, protein: { achievableG: 68, stepUp: null }, items: [], why: [], week: { days: [], forgiven: { kcal: 0, proteinG: 0, steps: 0, sessions: 0 }, sessionsTarget: 3, sessionsDone: 0, why: [] } });
  plans.savePlan("a", "2026-10-20", plan({ kcal: 2750, proteinG: 68, steps: 10000, waterGlasses: 8 }), "h");
  const t = targetsOn("a", "2026-10-20", base);
  assert.equal(t.proteinG, 68);
  assert.equal(t.kcal, 2750);
  // Carbs take up the calories protein gave back: (2750 − 68·4 − 76·9) / 4.
  assert.equal(t.carbsG, Math.round((2750 - 68 * 4 - 76 * 9) / 4));
  assert.equal(t.floorKcal, 1500);
  assert.equal(targetsOn("b", "2026-10-20", base), base); // another profile's plan never applies
  // A sick or travel day has no step goal: the tracker keeps a number, and water follows the plan.
  const sick = { plan: plan({ kcal: 2900, proteinG: 120, steps: null, waterGlasses: 10 }) };
  assert.equal(withPlan(base, sick).steps, 10000);
  assert.equal(withPlan(base, sick).kcal, 2900);
  assert.equal(waterFor(sick, 8), 10);
  assert.equal(waterFor(null, 8), 8);
});

test("the plan says what moved and why, in plain words", () => {
  const { adjustLines } = feature("life/copy");
  const { planWeek, defaultCapacity, weekDates } = load(path.join(root, "../shared/domain/week.ts"));
  const base = { baseKcal: 2750, baseProteinG: 135, baseSteps: 10000 };
  const row = (date, over = {}) => ({ date, ...base, dayType: "normal", capacity: defaultCapacity("normal", 135), actual: null, ...over });
  const days = (today, over) => weekDates(today).map((d) => row(d, over[d]));
  // Kabir, Tuesday: today's meals reach 68 g; today takes back a little (an add-on covers it), the rest moves on.
  const tue = planWeek(days("2026-10-20", { "2026-10-20": { achievableProteinG: 68 } }), "2026-10-20", 1500, 0);
  const [today] = adjustLines(tue.days.find((d) => d.date === "2026-10-20"), "2026-10-20");
  assert.match(today, /^Today's meals can realistically give 68 g of protein\. To keep your week's average, aim for (69|7\d|8[01]) g; an add-on covers the rest\.$/);
  // A picked number says so, and where the rest went.
  const picked = planWeek(days("2026-10-20", { "2026-10-21": { chosen: { proteinG: 110 } } }), "2026-10-20", 1500, 0);
  assert.equal(
    adjustLines(picked.days.find((d) => d.date === "2026-10-21"), "2026-10-20")[0],
    "You set tomorrow's protein to 110 g (usually 135 g). The other 25 g moves to today, Thursday, Friday, Saturday and Sunday.",
  );
  assert.match(adjustLines(picked.days.find((d) => d.date === "2026-10-22"), "2026-10-20")[0], /^Since you set tomorrow lower, Thursday's protein is raised to 1\d\d g from 135 g/);
  const [wed] = adjustLines(tue.days.find((d) => d.date === "2026-10-21"), "2026-10-20");
  assert.match(wed, /^Since today can't reach the usual protein, tomorrow's protein is raised to 1\d\d g from 135 g to keep your week's average\.$/);
  // The example: short on Tuesday, today is Sunday.
  const sun = planWeek(days("2026-10-25", { "2026-10-20": { actual: { kcal: 2750, proteinG: 100, steps: 10000, trained: false } } }), "2026-10-25", 1500, 0);
  assert.deepEqual(adjustLines(sun.days.find((d) => d.date === "2026-10-25"), "2026-10-25"), [
    "Since Tuesday came in short on protein, today's protein is raised to 162 g from 135 g to keep your week's average.",
  ]);
  // A missed Wednesday workout, planned today (Thursday).
  const thu = planWeek(
    days("2026-10-22", {
      "2026-10-19": { patternDay: true, actual: { kcal: null, proteinG: null, steps: null, trained: true } },
      "2026-10-21": { patternDay: true, actual: { kcal: null, proteinG: null, steps: null, trained: false } },
      "2026-10-23": { patternDay: true },
    }),
    "2026-10-22",
    1500,
    3,
  );
  assert.deepEqual(adjustLines(thu.days.find((d) => d.date === "2026-10-22"), "2026-10-22"), ["You missed yesterday's workout, so it's planned today."]);
});

test("a future day can be looked at, but logs never land on it", () => {
  const sel = feature("today/selectedDay");
  const now = new Date("2026-10-20T15:00:00");
  sel.selectDay("2026-10-23", now);
  assert.deepEqual(sel.useViewedDay(now), { day: "2026-10-23", isToday: false, isFuture: true });
  assert.equal(sel.selectedDay(now), "2026-10-20");
  assert.deepEqual(sel.useLogDay(now), { day: "2026-10-20", isToday: true });
  assert.equal(sel.logTime(now).getTime(), now.getTime());
  sel.selectDay("2026-10-30", now); // past the week's horizon: back to today
  assert.equal(sel.useViewedDay(now).day, "2026-10-20");
  sel.selectDay("2026-10-18", now); // a past day still works as before
  assert.equal(sel.selectedDay(now), "2026-10-18");
  assert.equal(sel.useViewedDay(now).isFuture, false);
});

test("D85: the phone asks the AI for the week, caches the answer per week, and never throws", async () => {
  const planner = feature("life/aiPlanner");
  const { defaultCapacity, weekDates } = load(path.join(root, "../shared/domain/week.ts"));
  const { NO_FACTS } = load(path.join(root, "../shared/domain/memory.ts"));
  const { PROTEIN_STAPLES } = load(path.join(root, "../shared/domain/eatOptions.ts"));
  const ledger = weekDates("2026-10-20").map((date) => ({ date, baseKcal: 2750, baseProteinG: 135, baseSteps: 10000, dayType: "normal", capacity: defaultCapacity("normal", 135), actual: null }));
  const input = {
    date: "2026-10-20", today: "2026-10-20", now: 0,
    base: { kcal: 2750, proteinG: 135, steps: 10000, floorKcal: 1500, waterGlasses: 8, goal: "build_muscle" },
    standing: { mealSource: "mess", budget: "tight", workPattern: "student", hasKitchen: false, hasFridge: null, sessionsPerWeek: 3 },
    facts: { blocks: [{ from: 840, to: 1380, kind: "study", label: "Session" }], whereabouts: "home", mealAccess: { lunch: "mess", snack: "event_food", dinner: "event_food" }, flags: ["no_gym_access"] },
    patterns: NO_FACTS, ledger, routines: [], candidates: [], diet: "veg", staples: PROTEIN_STAPLES, sessionsTarget: 3,
  };
  const ctx = { profile: { mealSource: "mess", budget: "tight", workPattern: "student" }, briefs: new Map([["2026-10-20", { rawText: "session 2-11 pm" }]]), facts: ["Lunch is at the mess"] };
  apiCalls.handler = async (url, opts) => {
    apiCalls.bodies.push({ url, body: opts.body });
    return { days: [{ date: "2026-10-20", kcal: 2750, proteinG: 68, steps: 7000, train: false, reason: "Long session." }], summary: "A long day.", ai: { slot: "groq#1", model: "m", attempts: 1 } };
  };
  assert.equal(await planner.requestAiWeek("a", input, ctx), true);
  const sent = apiCalls.bodies[0];
  assert.equal(sent.url, "/users/a/plan/week");
  const today = sent.body.days.find((d) => d.date === "2026-10-20");
  assert.equal(today.dayType, "late_work"); // the focus day's type comes from planDay, not the ledger row
  assert.equal(today.achievableProteinG, 68);
  assert.equal(today.brief, "session 2-11 pm");
  assert.equal(today.canTrain, true); // late days can train in general; the guard checks the day's own capacity
  assert.equal(planner.aiWeekFor("a", "2026-10-23").days[0].reason, "Long session."); // same week, any day
  assert.equal(planner.aiWeekFor("a", "2026-10-27"), null); // next week: nothing yet
  // A failing call keeps the last answer; offline doesn't call at all.
  apiCalls.handler = async () => { throw new Error("503"); };
  assert.equal(await planner.requestAiWeek("a", input, ctx), false);
  assert.equal(planner.aiWeekFor("a", "2026-10-20").summary, "A long day.");
  apiCalls.online = false;
  const before = apiCalls.bodies.length;
  assert.equal(await planner.requestAiWeek("a", input, ctx), false);
  assert.equal(apiCalls.bodies.length, before);
  apiCalls.online = true;
  // Once a day.
  assert.equal(planner.dueForDailyReplan("a", "2026-10-20"), true);
  assert.equal(planner.dueForDailyReplan("a", "2026-10-20"), false);
  assert.equal(planner.dueForDailyReplan("a", "2026-10-21"), true);
});
