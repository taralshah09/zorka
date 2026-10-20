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
let sql, modules, preferences, pushed, reminders, gym, catalogFoods;

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
      return {
        nutritionOf: (f) => ({ per100g: f.per100g, defaultUnit: f.defaultUnit, units: f.units, liquid: f.liquid }),
        recentFoods: () => [],
        // Food ideas (gap/eat.ts) rank these home foods.
        localFoods: () => catalogFoods,
        getFood: (_u, id) => catalogFoods.find((f) => f.id === id) ?? null,
        useFoodsVersion: (sel) => sel({ v: 0 }),
      };
    if (name === "@/features/activity/health") return { cachedSteps: () => ({ steps: 4200 }) };
    if (name === "@/features/activity/recorder") return { stopRecorder: async () => {} };
    if (name === "@/features/activity/store") return { activeActivity: () => null, dayCredit: () => ({ kcal: 0 }), routePoints: () => [] };
    if (name === "@/features/gym/catalog") return { getExercise: () => null };
    if (name === "@/features/gym/voice") return { applyVoiceSets: (...args) => gym.apply(...args) };
    if (name === "@/features/gym/store")
      return {
        // One workout per day: the day's workout, made on first use (the real store is covered by test-gym.cjs).
        startWorkout: () => gym.workouts.get("w1") ?? (gym.workouts.set("w1", { id: "w1", name: "Tuesday workout", exercises: [], status: "done" }), gym.workouts.get("w1")),
        getWorkout: (id) => gym.workouts.get(id) ?? null,
        deleteWorkout: (w) => gym.deleted.push(w.id),
        removeExercise: () => {},
        removeSet: () => {},
        workoutsBetween: () => [],
        recentWorkouts: () => [],
        restoreWorkout: () => {},
      };
    if (name === "./reminders")
      return {
        scheduleReminder: async (what, date, minute) => (reminders.push({ what, date, minute }), { id: `zorka.remind.${reminders.length}` }),
        cancelReminder: async (id) => reminders.push({ cancelled: id }),
        upcomingReminders: () =>
          reminders
            .map((r, i) => ({ ...r, id: `zorka.remind.${i + 1}` }))
            .filter((r) => r.what && !reminders.some((x) => x.cancelled === r.id)),
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
  catalogFoods = [];
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
  const items = checkPhoneTurn(r, ctx, new Map(), "a");
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

test("what to eat: with no saved plan, the food ideas ranking fills each meal still to come", () => {
  const { buildSnapshot } = feature("assistant/snapshot");
  const { answerFacts } = load(path.join(root, "../shared/domain/assistantFacts.ts"));
  preferences.set("zorka.profileCache.a", JSON.stringify({
    userId: "a", displayName: "Riya", goal: "lose_fat", age: 30, sex: "female", heightCm: 160, weightKg: 62, activityLevel: "light",
    diet: "veg", targetWeightKg: 56, pace: "steady", coach: null, oilGheePrompt: false, stepGoal: 8000, waterGoalGlasses: 8,
    checkinDetailed: false, onboardedAt: "2026-10-01T00:00:00.000Z", updatedAt: null,
  }));
  catalogFoods = [
    { ...food("paneer-bhurji", "Paneer bhurji", 260), category: "protein", per100g: { kcal: 260, proteinG: 18, carbsG: 6, fatG: 18 } },
    { ...DAL, category: "home_meal" },
  ];
  const snap = buildSnapshot("a");
  assert.equal(snap.facts.plan, null);
  assert.ok(snap.facts.eatFor, "the next meal is named");
  assert.ok(snap.facts.eat.length > 0, "ideas without a plan");
  assert.ok(Object.values(snap.facts.eatBySlot).every((list) => Array.isArray(list)));
  const dinner = answerFacts("what_to_eat", snap.facts, undefined, "dinner");
  assert.equal(dinner.known, true);
  assert.match(dinner.lines[1], /^Good fits for dinner: /);
});

test("what to eat: at or over the day's calories, it says so instead of offering more food", () => {
  const { answerFacts } = load(path.join(root, "../shared/domain/assistantFacts.ts"));
  const day = { targetKcal: 1600, eatenKcal: 1700, targetProteinG: 90, eatenProteinG: 70, steps: null, stepGoal: 8000, glasses: null, waterGoal: null, workoutToday: false, mealsLogged: 3, coverage: "complete" };
  const out = answerFacts("what_to_eat", { today: TODAY, day, eat: [{ name: "Paneer", kcal: 300, proteinG: 20 }] });
  assert.match(out.lines[0], /you're at your target/);
  assert.match(out.lines[1], /20 g protein is still to go/);
  assert.ok(!out.lines.join(" ").includes("Paneer"));
});

test("meals: 'what did I have for lunch' reads today's and yesterday's logged meals", () => {
  const { buildSnapshot } = feature("assistant/snapshot");
  const { answerFacts } = load(path.join(root, "../shared/domain/assistantFacts.ts"));
  preferences.set("zorka.profileCache.a", JSON.stringify({
    userId: "a", displayName: "Riya", goal: "lose_fat", age: 30, sex: "female", heightCm: 160, weightKg: 62, activityLevel: "light",
    diet: "veg", targetWeightKg: 56, pace: "steady", coach: null, oilGheePrompt: false, stepGoal: 8000, waterGoalGlasses: 8,
    checkinDetailed: false, onboardedAt: "2026-10-01T00:00:00.000Z", updatedAt: null,
  }));
  savedMeal("lunch", [["Roti", 200], ["Dal tadka", 165]]);
  const snap = buildSnapshot("a");
  const lunch = answerFacts("meals", snap.facts, undefined, "lunch");
  assert.equal(lunch.lines[0], "Lunch: roti, dal tadka (365 kcal).");
  const dinner = answerFacts("meals", snap.facts, undefined, "dinner");
  assert.equal(dinner.known, false);
  assert.match(dinner.lines[0], /haven't logged dinner today/);
});

const savedMeal = (mealType, items) => {
  const id = randomUUID();
  feature("meals/store").saveMeal({
    id,
    userId: "a",
    mealType,
    loggedAt: new Date().toISOString(),
    localDate: TODAY,
    source: "text",
    oilLevel: null,
    photoUri: null,
    items: items.map(([name, kcal]) => ({ id: randomUUID(), foodId: null, name, quantity: 1, unit: "katori", grams: 150, kcal, proteinG: 5, carbsG: 20, fatG: 3, diet: "veg", category: null })),
  });
  return id;
};
const item = (action, resolved = null) => ({ action, tier: "approve", resolved, ask: null, line: "server line" });

test("delete_entry names the saved meal, deletes exactly it on OK, and Undo brings it back", async () => {
  const thread = feature("assistant/thread");
  savedMeal("breakfast", [["Poha", 324]]);
  const lunch = savedMeal("lunch", [["Roti", 200], ["Dal tadka", 165]]);
  const t = await saveTurn(result([item({ kind: "delete_entry", target: "meal", mealType: "lunch" })], "delete my lunch"));
  const row = t.turn().items[0];
  assert.equal(row.state, "pending");
  assert.equal(row.targetId, lunch);
  assert.equal(row.receipt, "Delete lunch from today: roti, dal tadka (365 kcal)?");
  await thread.approve(t.id, 0);
  assert.deepEqual(meals().map((m) => m.mealType), ["breakfast"]);
  await thread.undo(t.id, 0);
  assert.deepEqual(meals().map((m) => m.mealType).sort(), ["breakfast", "lunch"]);
});

test("a delete with nothing to delete fails with a plain reason, before any OK", async () => {
  const meal = await saveTurn(result([item({ kind: "delete_entry", target: "meal", mealType: "dinner" })]));
  const water = await saveTurn(result([item({ kind: "delete_entry", target: "water", glasses: 1 })]));
  assert.deepEqual([meal, water].map((t) => [t.turn().items[0].state, t.turn().items[0].receipt]), [
    ["failed", "There's no dinner logged today."],
    ["failed", "There's no water logged today."],
  ]);
  // Two in one turn: the phone keeps the first and refuses the second (one saved record per turn).
  const both = await saveTurn(result([item({ kind: "delete_entry", target: "meal" }), item({ kind: "delete_entry", target: "water" })]));
  assert.deepEqual(both.turn().items.map((i) => i.state), ["failed", "refused"]);
});

test("water: removes the last glasses (no more than were logged), Undo adds them back", async () => {
  const thread = feature("assistant/thread");
  const water = feature("water/store");
  for (let i = 0; i < 3; i++) water.logGlass("a", TODAY);
  const t = await saveTurn(result([item({ kind: "delete_entry", target: "water", glasses: 2 })]));
  assert.equal(t.turn().items[0].receipt, "Remove 2 glasses of water from today (3 logged)?");
  await thread.approve(t.id, 0);
  assert.equal(water.glassesOn("a", TODAY), 1);
  await thread.undo(t.id, 0);
  assert.equal(water.glassesOn("a", TODAY), 3);
});

test("edit_meal removes a food, adds one or replaces the meal, each undoable", async () => {
  const thread = feature("assistant/thread");
  savedMeal("lunch", [["Roti", 200], ["Steamed rice", 130], ["Dal tadka", 165]]);
  const names = () => meals()[0].items.map((i) => i.name);

  const out = await saveTurn(result([item({ kind: "edit_meal", mode: "remove", span: "rice", mealType: "lunch", confidence: "high" })], "take the rice out of lunch"));
  assert.equal(out.turn().items[0].receipt, "Take steamed rice out of lunch (today)?");
  await thread.approve(out.id, 0);
  assert.deepEqual(names(), ["Roti", "Dal tadka"]);

  const add = await saveTurn(
    result([item({ kind: "edit_meal", mode: "add", span: "chai", mealType: "lunch", confidence: "high" }, { kind: "meal", items: [parsedItem("chai", DAL_FRY)], mealType: "lunch" })]),
  );
  await thread.approve(add.id, 0);
  assert.deepEqual(names(), ["Roti", "Dal tadka", "Dal fry"]);

  const replace = await saveTurn(
    result([item({ kind: "edit_meal", mode: "replace", span: "dal", mealType: "lunch", confidence: "high" }, { kind: "meal", items: [parsedItem("dal", DAL)], mealType: "lunch" })]),
  );
  assert.match(replace.turn().items[0].receipt, /^Change lunch \(today\) from roti, dal tadka, dal fry \(\d+ kcal\) to dal tadka, 1 katori \(\d+ kcal\)\?$/);
  await thread.approve(replace.id, 0);
  assert.deepEqual(names(), ["Dal tadka"]);

  await thread.undo(replace.id, 0);
  await thread.undo(add.id, 0);
  await thread.undo(out.id, 0);
  assert.deepEqual(names(), ["Roti", "Steamed rice", "Dal tadka"]);
});

test("removing a food the meal doesn't have fails; removing the last one deletes the meal", async () => {
  const thread = feature("assistant/thread");
  savedMeal("snack", [["Banana", 89]]);
  const none = await saveTurn(result([item({ kind: "edit_meal", mode: "remove", span: "samosa", mealType: "snack", confidence: "high" })]));
  assert.equal(none.turn().items[0].state, "failed");
  assert.match(none.turn().items[0].receipt, /doesn't have samosa/);
  const last = await saveTurn(result([item({ kind: "edit_meal", mode: "remove", span: "banana", mealType: "snack", confidence: "high" })]));
  await thread.approve(last.id, 0);
  assert.deepEqual(meals(), []);
  await thread.undo(last.id, 0);
  assert.equal(meals()[0].items[0].name, "Banana");
});

test("the router is told what's logged today and yesterday", () => {
  savedMeal("lunch", [["Roti", 200], ["Dal tadka", 165]]);
  feature("water/store").logGlass("a", TODAY);
  const { loggedForServer } = feature("assistant/executors");
  assert.deepEqual(loggedForServer("a", TODAY, "2000-01-01"), [
    { date: TODAY, kind: "meal", mealType: "lunch", text: "Roti, Dal tadka" },
    { date: TODAY, kind: "water", text: "1 glasses" },
  ]);
});

test("edit_meal replace with `from` swaps one food and keeps the rest; Undo puts it back", async () => {
  const thread = feature("assistant/thread");
  savedMeal("lunch", [["Roti", 200], ["Rajma", 240], ["Steamed rice", 130]]);
  const names = () => meals()[0].items.map((i) => i.name);
  const swap = await saveTurn(
    result(
      [item({ kind: "edit_meal", mode: "replace", span: "dal", from: "rajma", mealType: "lunch", confidence: "high" }, { kind: "meal", items: [parsedItem("dal", DAL)], mealType: "lunch" })],
      "lunch mein rajma nahi dal tha",
    ),
  );
  assert.match(swap.turn().items[0].receipt, /^Change lunch \(today\) from roti, rajma, steamed rice \(570 kcal\) to roti, 1 katori; dal tadka, 1 katori; steamed rice, 1 katori \(\d+ kcal\)\?$/);
  await thread.approve(swap.id, 0);
  assert.deepEqual(names(), ["Roti", "Dal tadka", "Steamed rice"]);
  await thread.undo(swap.id, 0);
  assert.deepEqual(names(), ["Roti", "Rajma", "Steamed rice"]);

  const missing = await saveTurn(
    result([item({ kind: "edit_meal", mode: "replace", span: "dal", from: "paneer", mealType: "lunch", confidence: "high" }, { kind: "meal", items: [parsedItem("dal", DAL)], mealType: "lunch" })]),
  );
  assert.equal(missing.turn().items[0].state, "failed");
  assert.match(missing.turn().items[0].receipt, /doesn't have paneer/);
});

test("`from` is refused on add and remove by the shared check", () => {
  const { checkAction } = load(path.join(root, "../shared/domain/assistant.ts"));
  assert.deepEqual(checkAction({ kind: "edit_meal", mode: "add", span: "dal", from: "rice" }, CTX), { ok: false, reason: "bad_value" });
  assert.equal(checkAction({ kind: "edit_meal", mode: "replace", span: "dal", from: "rice" }, CTX).ok, true);
});

test("delete_entry cancels a reminder by its words, and Undo sets it again", async () => {
  const thread = feature("assistant/thread");
  reminders.push({ what: "pack snacks", date: TODAY, minute: 1439 }, { what: "call mom", date: TODAY, minute: 1438 });
  const t = await saveTurn(result([item({ kind: "delete_entry", target: "reminder", span: "snacks" })], "cancel the snacks reminder"));
  assert.equal(t.turn().items[0].receipt, 'Cancel "pack snacks" at 11:59pm today?');
  await thread.approve(t.id, 0);
  assert.deepEqual(reminders.at(-1), { cancelled: "zorka.remind.1" });
  await thread.undo(t.id, 0);
  assert.deepEqual(reminders.at(-1), { what: "pack snacks", date: TODAY, minute: 1439 });

  const none = await saveTurn(result([item({ kind: "delete_entry", target: "reminder", span: "gym" })]));
  assert.equal(none.turn().items[0].state, "failed");
});

test("delete_entry drops a planned meal; Undo brings the plan back", async () => {
  const thread = feature("assistant/thread");
  const planned = feature("assistant/plannedMeals");
  planned.planMeal("a", TODAY, { mealType: "dinner", text: "paneer tikka", items: [] });
  const t = await saveTurn(result([item({ kind: "delete_entry", target: "planned_meal", mealType: "dinner" })], "I won't have the paneer for dinner"));
  assert.equal(t.turn().items[0].receipt, "Drop paneer tikka from dinner today?");
  await thread.approve(t.id, 0);
  assert.deepEqual(planned.plannedMeals("a", TODAY), []);
  await thread.undo(t.id, 0);
  assert.equal(planned.plannedMeals("a", TODAY)[0].text, "paneer tikka");
});

test("a reminder or plan can be dropped up to a week ahead, but never a past one", () => {
  const { checkAction } = load(path.join(root, "../shared/domain/assistant.ts"));
  const { addDays } = load(path.join(root, "../shared/domain/progress.ts"));
  assert.equal(checkAction({ kind: "delete_entry", target: "planned_meal", date: addDays(TODAY, 3) }, CTX).ok, true);
  assert.deepEqual(checkAction({ kind: "delete_entry", target: "reminder", date: addDays(TODAY, -1) }, CTX), { ok: false, reason: "date_out_of_range" });
  assert.deepEqual(checkAction({ kind: "delete_entry", target: "meal", date: addDays(TODAY, 1) }, CTX), { ok: false, reason: "date_out_of_range" });
});

test("exercise_ref: only musclewiki.com links survive the phone's check, and the card opens them by index", async () => {
  const { overlayView, linkFor } = feature("assistant/overlayView");
  const resolved = {
    kind: "exercises",
    query: "chest",
    category: "chest",
    matches: [
      { id: "e1", name: "Barbell Bench Press", category: "chest", url: "https://musclewiki.com/exercise/barbell-bench-press" },
      { id: "e2", name: "Cable Fly", category: "chest", url: "https://evil.example.com/phish" },
      { id: "e3", name: "My Fly", category: "chest", url: null },
    ],
  };
  const t = await saveTurn(result([{ action: { kind: "exercise_ref", span: "chest" }, tier: "answer", resolved, ask: null, line: "Chest exercises." }], "exercises for chest"));
  const stored = t.turn().items[0];
  assert.equal(stored.state, "answered");
  assert.equal(stored.resolved.matches[1].url, null);
  const v = overlayView(t.id, t.turn(), TODAY);
  assert.deepEqual(v.rows[0].buttons, [{ id: "link:0", label: "Open on MuscleWiki", primary: true }]);
  assert.equal(linkFor(stored, "link:0"), "https://musclewiki.com/exercise/barbell-bench-press");
  assert.equal(linkFor(stored, "link:1"), null);

  const none = await saveTurn(result([{ action: { kind: "exercise_ref", span: "zercher" }, tier: "answer", resolved: { kind: "exercises", query: "zercher", category: null, matches: [] }, ask: null, line: "" }]));
  const nv = overlayView(none.id, none.turn(), TODAY);
  assert.deepEqual(nv.rows[0].buttons, [{ id: "link:browse", label: "Search MuscleWiki" }]);
  assert.equal(linkFor(none.turn().items[0], "link:browse"), "https://musclewiki.com/exercises");
});

test("offline: food questions are answered from local data, with the meal they name", () => {
  const { localAskTopic, localMealType } = load(path.join(root, "../shared/domain/assistant.ts"));
  assert.equal(localAskTopic("what should I eat next"), "what_to_eat");
  assert.equal(localAskTopic("suggest something for dinner"), "what_to_eat");
  assert.equal(localMealType("suggest something for dinner"), "dinner");
  assert.equal(localAskTopic("what did I have for lunch"), "meals");
  assert.equal(localAskTopic("aaj kya khaya"), "meals");
});

test("the router also sees today's plans and upcoming reminders", () => {
  reminders.push({ what: "pack snacks", date: TODAY, minute: 1439 });
  feature("assistant/plannedMeals").planMeal("a", TODAY, { mealType: "dinner", text: "paneer tikka", items: [] });
  const { loggedForServer } = feature("assistant/executors");
  assert.deepEqual(loggedForServer("a", TODAY, "2000-01-01"), [
    { date: TODAY, kind: "planned_meal", mealType: "dinner", text: "paneer tikka" },
    { date: TODAY, kind: "reminder", text: "11:59pm pack snacks" },
  ]);
});
