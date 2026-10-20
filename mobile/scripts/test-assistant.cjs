// Assistant Bar on the phone (docs/ASSISTANT_BAR_PLAN.md AB3–AB7) against production modules with real SQLite: the
// phone's own check of a server turn (D96), the executors writing through the real meal, water, weight, brief and
// memory stores, Undo (from the sheet and the thread), Approve and Ask rows, `correct` and `undo`, the AB6 chips and
// alias learning (D97), planned meals, and Today's "done for you" line.
// Node 22+; npm run test:assistant. Native and React boundaries are mocked, as in test-pa.cjs and test-life.cjs.
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
let sql, modules, preferences, pushed, reminders, gym;

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
    if (name === "expo-router") return { router: { push: (href) => pushed.push(href), navigate: (href) => pushed.push(href) } };
    if (name === "react-native") return { AppState: { currentState: "background" } };
    // The bubble's native module: no app UI in these tests, so routes go out as deep links (navigate.ts).
    if (name.endsWith("modules/zorka-overlay")) return { ZorkaOverlay: { openUrl: (url) => pushed.push(url), render: () => {} } };
    if (name === "@/core/sync/engine") return { notifyLocalWrite: () => {}, onAcknowledged: () => {}, useSyncStatus: (sel) => sel({ lastSyncedAt: 0 }) };
    if (name === "@/core/sync/pull") return { onPulled: () => {}, hasPulledOnce: () => true, usePullStatus: (sel) => sel({}) };
    if (name === "@/core/network/network") return { useNetwork: Object.assign((sel) => sel({ online: true }), { getState: () => ({ online: true }), setState: () => {} }) };
    if (name === "@/features/food/catalog")
      return { nutritionOf: (f) => ({ per100g: f.per100g, defaultUnit: f.defaultUnit, units: f.units, liquid: f.liquid }), recentFoods: () => [] };
    if (name === "@/features/activity/health") return { cachedSteps: () => ({ steps: 4200 }) };
    if (name === "@/features/activity/recorder") return { stopRecorder: async () => {} };
    if (name === "@/features/activity/store") return { activeActivity: () => null, dayCredit: () => ({ kcal: 0 }), routePoints: () => [] };
    if (name === "@/features/gym/catalog") return { getExercise: () => null };
    if (name === "@/features/gym/voice") return { applyVoiceSets: (...args) => gym.apply(...args) };
    if (name === "@/features/gym/store")
      return {
        activeWorkout: () => null,
        startWorkout: () => ({ id: "w1", name: "Logged with Zorka", exercises: [], status: "active" }),
        finishWorkout: (id) => (gym.workouts.set(id, { id, status: "done", exercises: [] }), { id }),
        getWorkout: (id) => gym.workouts.get(id) ?? null,
        deleteWorkout: (w) => gym.deleted.push(w.id),
        removeExercise: () => {},
        removeSet: () => {},
        workoutsBetween: () => [],
        recentWorkouts: () => [],
      };
    if (name === "./reminders")
      return {
        scheduleReminder: async (what, date, minute) => (reminders.push({ what, date, minute }), { id: `zorka.remind.${reminders.length}` }),
        cancelReminder: async (id) => reminders.push({ cancelled: id }),
      };
    if (name.startsWith("@/")) return load(path.join(root, "src", `${name.slice(2)}.ts`));
    if (name.startsWith("@shared/")) return load(path.join(root, "../shared", `${name.slice(8)}.ts`));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name.endsWith(".js") ? name.slice(0, -3) + ".ts" : `${name}.ts`));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(req, module, module.exports);
  return module.exports;
}
const feature = (name) => load(path.join(root, "src/features", `${name}.ts`));

beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  modules = new Map();
  preferences = new Map([["zorka.activeUserId", "a"]]);
  pushed = [];
  reminders = [];
  gym = { deleted: [], workouts: new Map(), apply: () => ({ added: [{ exerciseName: "Barbell Bench Press" }], unmatched: [] }) };
  load(path.join(root, "src/core/storage/db.ts")).getDb();
});
afterEach(() => sql.close());

const TODAY = new Date().toISOString().slice(0, 10);
const CTX = { today: TODAY, lastWeightKg: 72, activityRunning: false, previousActions: 0 };
const food = (id, name, kcal = 120) => ({
  id,
  name,
  aliases: [],
  cuisine: "indian",
  category: "home_meal",
  diet: "veg",
  homeCooked: false,
  liquid: false,
  per100g: { kcal, proteinG: 6, carbsG: 15, fatG: 3 },
  defaultUnit: "katori",
  units: [{ unit: "katori", grams: 150, label: null }],
  source: "test",
  custom: false,
  updatedAt: "2026-10-01T00:00:00.000Z",
});
const DAL = food("dal-tadka", "Dal tadka", 110);
const DAL_FRY = food("dal-fry", "Dal fry", 125);
const parsedItem = (query, f, quantity = 1, alternatives = []) => ({
  query,
  food: f,
  matchScore: f ? 1 : null,
  runnerUp: null,
  alternatives,
  quantity,
  unit: "katori",
  grams: 150 * quantity,
  macros: f ? { kcal: (f.per100g.kcal * 150 * quantity) / 100, proteinG: 9 * quantity, carbsG: 20, fatG: 4 } : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  confidence: 0.9,
  uncertain: !f,
  reasons: f ? [] : ["no_match"],
});
const mealItem = (span, items, tier = "do", over = {}) => ({
  action: { kind: "log_meal", span, mealType: "lunch", confidence: tier === "do" ? "high" : "low", ...over },
  tier,
  resolved: { kind: "meal", items, mealType: "lunch" },
  ask: null,
  line: `line for ${span}`,
});
const result = (items, heard = "had dal") => ({
  heard: { text: heard, source: "text", confidence: "high" },
  kind: "actions",
  items,
  dropped: [],
  reply: "ok",
  replyKind: "template",
  timings: { sttMs: null, routerMs: 0, resolveMs: 0, phraseMs: 0, totalMs: 0 },
  ai: null,
});

/** Saves a server turn the way runTurn does, then runs its sure actions. */
async function saveTurn(r, ctx = CTX) {
  const { checkPhoneTurn } = feature("assistant/executors");
  const { addMessage } = feature("coach/chat");
  const thread = feature("assistant/thread");
  const items = checkPhoneTurn(r, ctx, new Map());
  const turn = { v: 1, date: TODAY, at: new Date().toISOString(), heard: r.heard, kind: r.kind, items, reply: r.reply, replyKind: r.replyKind };
  addMessage("a", "user", r.heard.text, "calm_mentor");
  const id = addMessage("a", "coach", r.reply, "calm_mentor", { turn });
  await thread.runSure(id);
  return { id, turn: () => thread.getTurn(id).turn };
}
const meals = () => feature("meals/store").mealsForDay("a", TODAY);

test("the phone refuses what its own check rejects and only ever raises a tier (D96)", () => {
  const { checkPhoneTurn } = feature("assistant/executors");
  const tampered = result([
    { action: { kind: "set_day", dayType: "sick", date: TODAY }, tier: "do", resolved: null, ask: null, line: "" },
    { action: { kind: "log_water", glasses: 50 }, tier: "do", resolved: null, ask: null, line: "" },
    { action: { kind: "open", screen: "/(tabs)/settings?wipe=1" }, tier: "do", resolved: null, ask: null, line: "" },
    { action: { kind: "log_weight", kg: 72.4, confidence: "high", date: "2020-01-01" }, tier: "do", resolved: null, ask: null, line: "" },
    { action: { kind: "log_water", glasses: 2 }, tier: "do", resolved: null, ask: null, line: "" },
  ]);
  const items = checkPhoneTurn(tampered, CTX, new Map());
  assert.deepEqual(
    items.map((i) => [i.action.kind, i.tier, i.state]),
    [
      ["set_day", "approve", "pending"],
      ["log_water", "do", "refused"],
      ["open", "do", "refused"],
      ["log_weight", "do", "refused"],
      ["log_water", "do", "pending"],
    ],
  );
});

test("a portion far from the user's usual is approved first (AB6 pattern fit)", () => {
  const { checkPhoneTurn } = feature("assistant/executors");
  const usual = new Map([["dal-tadka", { quantity: 1, unit: "katori" }]]);
  const items = checkPhoneTurn(result([mealItem("4 katori dal", [parsedItem("dal", DAL, 4)])]), CTX, usual);
  assert.equal(items[0].tier, "approve");
});

test("sure actions run at once: the meal and the water are saved, with a receipt and Undo", async () => {
  const t = await saveTurn(
    result([mealItem("dal", [parsedItem("dal", DAL)]), { action: { kind: "log_water", glasses: 2 }, tier: "do", resolved: null, ask: null, line: "" }]),
  );
  const [meal, water] = t.turn().items;
  assert.equal(meal.state, "done");
  assert.equal(meal.receipt, "Logged dal tadka, 1 katori for lunch (165 kcal).");
  assert.deepEqual(meal.undo, { kind: "meal", mealId: meal.mealId });
  assert.equal(meals()[0].items[0].name, "Dal tadka");
  assert.equal(meals()[0].source, "text");
  assert.equal(feature("water/store").glassesOn("a", TODAY), 2);
  assert.equal(water.receipt, "Logged 2 glasses of water.");

  const thread = feature("assistant/thread");
  await thread.undo(t.id, 0);
  await thread.undo(t.id, 1);
  assert.deepEqual(meals(), []);
  assert.equal(feature("water/store").glassesOn("a", TODAY), 0);
  assert.deepEqual(t.turn().items.map((i) => i.state), ["undone", "undone"]);
});

test("an approval waits for OK; Not now leaves nothing behind", async () => {
  const thread = feature("assistant/thread");
  const t = await saveTurn(result([mealItem("dahl", [parsedItem("dahl", DAL)], "approve"), mealItem("poha", [parsedItem("poha", DAL_FRY)], "approve")]));
  assert.deepEqual(t.turn().items.map((i) => i.state), ["pending", "pending"]);
  assert.deepEqual(meals(), []);
  await thread.approve(t.id, 0);
  await thread.dismiss(t.id, 1);
  assert.deepEqual(t.turn().items.map((i) => i.state), ["done", "dismissed"]);
  assert.equal(meals().length, 1);
});

test("an Ask row runs once the user picks the missing detail", async () => {
  const thread = feature("assistant/thread");
  const ask = { ...mealItem("rice", [parsedItem("rice", DAL)]), tier: "ask", ask: { question: "Which meal was that?", options: [{ label: "Snack", patch: { mealType: "snack" } }] } };
  ask.action = { kind: "log_meal", span: "rice", confidence: "high" };
  const t = await saveTurn(result([ask]));
  assert.equal(t.turn().items[0].state, "asking");
  await thread.answerAsk(t.id, 0, { mealType: "snack" }, CTX);
  assert.equal(t.turn().items[0].state, "done");
  assert.equal(meals()[0].mealType, "snack");
});

test("set_day re-plans the day through its brief, asks for an AI re-plan, and Undo puts the day back", async () => {
  const thread = feature("assistant/thread");
  const briefs = feature("life/briefs");
  const facts = { blocks: [], whereabouts: "home", mealAccess: {}, flags: ["sick"] };
  const t = await saveTurn(
    result([{ action: { kind: "set_day", dayType: "sick", date: TODAY, note: "feeling sick" }, tier: "approve", resolved: { kind: "day", facts, dayType: "sick", question: null }, ask: null, line: "" }]),
  );
  assert.equal(briefs.briefFor("a", TODAY), null);
  await thread.approve(t.id, 0);
  assert.deepEqual(briefs.briefFor("a", TODAY).facts.flags, ["sick"]);
  assert.equal(briefs.briefFor("a", TODAY).rawText, "feeling sick");
  assert.equal(feature("assistant/replan").takeReplanRequest("a"), true);
  await thread.undo(t.id, 0);
  assert.equal(briefs.briefFor("a", TODAY), null);
});

test("set_day keeps a brief the user already gave and only changes the day type", async () => {
  const thread = feature("assistant/thread");
  const briefs = feature("life/briefs");
  briefs.saveBrief("a", TODAY, "office 9 to 6", { blocks: [{ from: 540, to: 1080, kind: "work" }], whereabouts: "home", mealAccess: {}, flags: [] }, "confirmed");
  const t = await saveTurn(result([{ action: { kind: "set_day", dayType: "sick", date: TODAY }, tier: "approve", resolved: null, ask: null, line: "" }], "I'm sick"));
  await thread.approve(t.id, 0);
  const now = briefs.briefFor("a", TODAY);
  assert.deepEqual(now.facts.flags, ["sick"]);
  assert.equal(now.facts.blocks.length, 1);
  await thread.undo(t.id, 0);
  assert.equal(briefs.briefFor("a", TODAY).rawText, "office 9 to 6");
});

test("a chip swaps the food on the saved meal and remembers the word (D97)", async () => {
  const thread = feature("assistant/thread");
  const t = await saveTurn(result([mealItem("dahl", [parsedItem("dahl", DAL_FRY, 1, [DAL])])]));
  await thread.swap(t.id, 0, 0, DAL);
  assert.equal(meals()[0].items[0].name, "Dal tadka");
  assert.match(t.turn().items[0].receipt, /dal tadka/);
  assert.deepEqual(feature("life/memory").aliasesFor("a"), [{ heard: "dahl", means: "Dal tadka" }]);
  await thread.portion(t.id, 0, 0, 2);
  assert.equal(meals()[0].items[0].quantity, 2);
});

test("a spoken correction edits the previous turn's meal; undo takes back the last turn", async () => {
  const thread = feature("assistant/thread");
  const first = await saveTurn(result([mealItem("dahl", [parsedItem("dahl", DAL_FRY)])], "had dahl"));
  const fix = await saveTurn(
    result([{ action: { kind: "correct", index: 0, span: "dal tadka" }, tier: "do", resolved: { kind: "meal", items: [parsedItem("dal tadka", DAL)], mealType: "lunch" }, ask: null, line: "" }], "no, dal tadka"),
    { ...CTX, previousActions: 1 },
  );
  assert.equal(fix.turn().items[0].state, "done");
  assert.equal(meals()[0].items[0].name, "Dal tadka");
  assert.equal(first.turn().items[0].receipt, "Changed to dal tadka, 1 katori.");
  assert.deepEqual(feature("life/memory").aliasesFor("a"), [{ heard: "dahl", means: "Dal tadka" }]);

  // "Undo that" takes back the last turn: the correction, so the meal is Dal fry again.
  const again = await saveTurn(result([{ action: { kind: "undo" }, tier: "do", resolved: null, ask: null, line: "" }], "undo that"), { ...CTX, previousActions: 1 });
  assert.equal(again.turn().items[0].state, "done");
  assert.equal(meals()[0].items[0].name, "Dal fry");
  assert.equal(fix.turn().items[0].state, "undone");
  // Nothing left in that turn to take back.
  const twice = await saveTurn(result([{ action: { kind: "undo" }, tier: "do", resolved: null, ask: null, line: "" }], "undo"), { ...CTX, previousActions: 1 });
  assert.equal(twice.turn().items[0].state, "failed");
  // The first turn's own Undo (thread) still removes the meal.
  await thread.undo(first.id, 0);
  assert.deepEqual(meals(), []);
});

test("plan_meal, reminders and logged sets each run through their own store", async () => {
  const t = await saveTurn(
    result([
      { action: { kind: "plan_meal", span: "dal", mealType: "dinner" }, tier: "do", resolved: { kind: "meal", items: [parsedItem("dal", DAL)], mealType: "dinner" }, ask: null, line: "" },
      { action: { kind: "remind_me", what: "pack snacks", minute: 1260 }, tier: "do", resolved: null, ask: null, line: "" },
      { action: { kind: "log_workout", span: "bench 40 kg", confidence: "high" }, tier: "do", resolved: { kind: "workout", sets: [{ query: "bench", exercise: null, values: {}, count: 1, uncertain: true }], usual: false }, ask: null, line: "" },
    ]),
  );
  assert.deepEqual(t.turn().items.map((i) => i.state), ["done", "done", "done"]);
  assert.equal(feature("assistant/plannedMeals").plannedMeals("a", TODAY)[0].text, "dal tadka, 1 katori");
  assert.deepEqual(reminders[0], { what: "pack snacks", date: TODAY, minute: 1260 });
  const thread = feature("assistant/thread");
  for (const i of [0, 1, 2]) await thread.undo(t.id, i);
  assert.deepEqual(feature("assistant/plannedMeals").plannedMeals("a", TODAY), []);
  assert.equal(reminders[1].cancelled, "zorka.remind.1");
  assert.deepEqual(gym.deleted, ["w1"]);
});

test("open and start go to phone-chosen routes only, as deep links from the bubble", async () => {
  await saveTurn(
    result([
      { action: { kind: "open", screen: "progress" }, tier: "do", resolved: null, ask: null, line: "Opening progress." },
      { action: { kind: "start_activity", activity: "walk" }, tier: "do", resolved: null, ask: null, line: "" },
    ]),
  );
  assert.deepEqual(pushed, ["zorka://progress", "zorka://activity/record?kind=walk&autostart=1"]);
  const { hrefToUrl } = feature("assistant/navigate");
  assert.equal(hrefToUrl("/gap?tab=move"), "zorka://gap?tab=move");
  assert.equal(hrefToUrl({ pathname: "/plan/tomorrow", params: { date: "2026-10-21", text: "wedding & party" } }), "zorka://plan/tomorrow?date=2026-10-21&text=wedding%20%26%20party");
});

test("Today's line says what Zorka did, skipping what was undone", async () => {
  const thread = feature("assistant/thread");
  const t = await saveTurn(
    result([
      mealItem("poha", [parsedItem("poha", DAL)]),
      { action: { kind: "log_water", glasses: 1 }, tier: "do", resolved: null, ask: null, line: "" },
      { action: { kind: "start_activity", activity: "walk" }, tier: "do", resolved: null, ask: null, line: "" },
    ]),
  );
  await thread.undo(t.id, 1);
  const { doneForYouLine } = feature("assistant/doneForYou");
  assert.equal(doneForYouLine(thread.turnsOn("a", TODAY), TODAY), "Since morning: logged lunch, walk started.");
  assert.equal(doneForYouLine([], TODAY), null);
});

test("the router sees the previous turn for correct, undo and follow-ups", async () => {
  await saveTurn(result([mealItem("dahl", [parsedItem("dahl", DAL)])], "had dahl"));
  const prev = feature("assistant/thread").previousForServer("a");
  assert.deepEqual(prev, { actions: [{ kind: "log_meal", span: "dahl" }], clarify: null });
  assert.deepEqual(feature("assistant/thread").threadForServer("a").map((m) => m.role), ["user", "coach"]);
});

test("the bubble's card: buttons per state, sticky while it waits on the user, and the tiger's mood", async () => {
  const thread = feature("assistant/thread");
  const { overlayView, patchFor } = feature("assistant/overlayView");
  const ask = { ...mealItem("rice", [parsedItem("rice", DAL)]), tier: "ask", ask: { question: "Which meal was that?", options: [{ label: "Lunch", patch: { mealType: "lunch" } }, { label: "Snack", patch: { mealType: "snack" } }] } };
  const t = await saveTurn(result([mealItem("dahl", [parsedItem("dahl", DAL)], "approve"), ask]));
  let v = overlayView(t.id, t.turn(), TODAY);
  assert.equal(v.phase, "result");
  assert.equal(v.sticky, true);
  assert.equal(v.mood, "tilt");
  assert.deepEqual(v.rows.map((r) => r.buttons.map((b) => b.id)), [["ok", "change", "not_now"], ["option:0", "option:1"]]);
  assert.deepEqual(patchFor(t.turn().items[1], "option:1"), { mealType: "snack" });
  assert.equal(patchFor(t.turn().items[1], "option:9"), null);
  await thread.approve(t.id, 0);
  await thread.dismiss(t.id, 1);
  v = overlayView(t.id, t.turn(), TODAY);
  assert.equal(v.sticky, false);
  assert.equal(v.mood, "happy");
  assert.deepEqual(v.rows[0].buttons.map((b) => b.id), ["undo"]);
  assert.match(v.rows[1].text, /^Skipped: /);
});

test("a lone answer is the card's reply, with no rows", async () => {
  const { overlayView } = feature("assistant/overlayView");
  const answer = { action: { kind: "ask", topic: "streak" }, tier: "answer", resolved: { kind: "answer", topic: "streak", date: TODAY, known: true, lines: ["You're on a 5-day streak (best 21)."], numbers: [5, 21], card: null }, ask: null, line: "" };
  const t = await saveTurn({ ...result([answer], "what's my streak"), reply: "" });
  const v = overlayView(t.id, t.turn(), TODAY);
  assert.deepEqual(v.rows, []);
  assert.equal(v.reply, "You're on a 5-day streak (best 21).");
});

test("the snapshot builds without React, from the cached profile and SQLite (headless bubble)", () => {
  const { buildSnapshot } = feature("assistant/snapshot");
  assert.equal(buildSnapshot("a"), null);
  preferences.set("zorka.profileCache.a", JSON.stringify({
    userId: "a", displayName: "Riya", goal: "lose_fat", age: 30, sex: "female", heightCm: 160, weightKg: 62, activityLevel: "light",
    diet: "veg", targetWeightKg: 56, pace: "steady", coach: null, oilGheePrompt: false, stepGoal: 8000, waterGoalGlasses: 8,
    checkinDetailed: false, onboardedAt: "2026-10-01T00:00:00.000Z", updatedAt: null,
  }));
  feature("water/store").logGlass("a", TODAY);
  const snap = buildSnapshot("a");
  assert.equal(snap.coach, "calm_mentor");
  assert.equal(snap.today, TODAY);
  assert.equal(snap.facts.day.glasses, 1);
  assert.equal(snap.facts.day.steps, 4200);
  assert.equal(snap.facts.day.eatenKcal, 0);
  assert.ok(snap.facts.day.targetKcal >= 1200);
  assert.equal(snap.context.name, "Riya");
  assert.equal(snap.facts.plan, null);
});
