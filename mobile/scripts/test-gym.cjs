// One workout per day (Train) against production modules with real SQLite: whatever is logged on a day goes into that
// day's workout (by hand, a routine, the assistant's log_workout, for today or yesterday), it's queued for the server
// as it changes with ticked sets only (one pending op per workout), an empty day isn't history, workouts older
// versions left open are closed or adopted, and the assistant's create_routine saves a routine that Undo removes.
// Node 22+; npm run test:gym. Native and React boundaries are mocked, as in test-life.cjs.
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
let sql, modules, preferences, exercises;

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
    if (name === "expo-router") return { router: { push: () => {}, navigate: () => {} } };
    if (name === "react-native") return { AppState: { currentState: "background" }, Linking: { openURL: async () => {} } };
    if (name.endsWith("modules/zorka-overlay")) return { ZorkaOverlay: { openUrl: () => {}, render: () => {} } };
    if (name === "@/core/sync/engine") return { notifyLocalWrite: () => {}, onAcknowledged: () => {}, useSyncStatus: (sel) => sel({ lastSyncedAt: 0 }) };
    if (name === "@/core/sync/pull") return { onPulled: () => {} };
    if (name === "@/core/api/client") return { api: async () => ({}), ApiError: class extends Error {}, describeError: () => ({ title: "", body: "" }) };
    if (name === "@/features/nudges/events") return { completeUsefulAction: () => {} };
    if (name === "expo-file-system") return { File: class {}, Directory: class {}, Paths: {} };
    if (name === "@/features/log/parse") return { VOICE_MIME: "audio/mp4" };
    if (name === "@/features/activity/recorder") return { stopRecorder: async () => {} };
    if (name === "@/features/activity/store") return { activeActivity: () => null, dayCredit: () => ({ kcal: 0 }), routePoints: () => [] };
    if (name === "@/features/activity/health") return { cachedSteps: () => null };
    if (name === "@/features/food/catalog") return { nutritionOf: (f) => f, recentFoods: () => [], localFoods: () => [], getFood: () => null, useFoodsVersion: (sel) => sel({ v: 0 }) };
    if (name === "./reminders") return { scheduleReminder: async () => ({ id: "r" }), cancelReminder: async () => {}, upcomingReminders: () => [] };
    if (name === "@/features/gym/catalog") return { getExercise: (_u, id) => exercises.find((e) => e.id === id) ?? null };
    if (name.startsWith("@/")) return load(path.join(root, "src", `${name.slice(2)}.ts`));
    if (name.startsWith("@shared/")) return load(path.join(root, "../shared", `${name.slice(8)}.ts`));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name.endsWith(".js") ? name.slice(0, -3) + ".ts" : `${name}.ts`));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(req, module, module.exports);
  return module.exports;
}
const feature = (name) => load(path.join(root, "src/features", `${name}.ts`));
const outbox = () => sql.prepare("SELECT * FROM outbox WHERE entity = 'workout' ORDER BY created_at").all();

const ex = (id, name, type = "weight_reps", category = "chest") => ({ id, slug: id, name, aliases: [], category, type, referenceUrl: null, custom: false });

beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  modules = new Map();
  preferences = new Map();
  exercises = [ex("bench", "Barbell Bench Press"), ex("row", "Barbell Row", "weight_reps", "back"), ex("plank", "Plank", "time", "abs")];
  load(path.join(root, "src/core/storage/db.ts")).getDb();
});
afterEach(() => sql.close());

const today = () => new Date().toISOString().slice(0, 10);
const parsed = (exercise, weightKg, reps, count = 1) => ({
  query: exercise.name.toLowerCase(),
  exercise,
  matchScore: 1,
  values: { weightKg, reps, durationS: null, distanceM: null },
  count,
  confidence: 0.95,
  uncertain: false,
  reasons: [],
});

test("sets logged at different times of a day all go into that day's one workout", () => {
  const store = feature("gym/store");
  const voice = feature("gym/voice");
  const morning = store.startWorkout("a", { at: new Date() });
  voice.applyVoiceSets("a", morning.id, [parsed(exercises[0], 60, 8, 2)], (id) => exercises.find((e) => e.id === id));
  const evening = store.startWorkout("a");
  assert.equal(evening.id, morning.id, "no second workout the same day");
  voice.applyVoiceSets("a", evening.id, [parsed(exercises[1], 50, 10)], (id) => exercises.find((e) => e.id === id));
  const day = store.activeWorkout("a");
  assert.equal(day.status, "done");
  assert.deepEqual(day.exercises.map((e) => e.name), ["Barbell Bench Press", "Barbell Row"]);
  assert.equal(store.workoutStats(day).sets, 3);
  assert.equal(store.recentWorkouts("a").length, 1);
});

test("the day is queued as it changes: one pending op, ticked complete sets only, empty exercises left out", () => {
  const store = feature("gym/store");
  const w = store.startWorkout("a");
  const [benchId, rowId] = store.addExercises(w, [{ exercise: exercises[0], targetSets: 3 }, { exercise: exercises[1] }]);
  assert.equal(outbox().length, 0, "nothing ticked yet, nothing sent");
  let bench = store.getWorkout(w.id).exercises.find((e) => e.id === benchId);
  store.completeSet("a", bench, bench.sets[0].id, { weightKg: 60, reps: 8, durationS: null, distanceM: null });
  bench = store.getWorkout(w.id).exercises.find((e) => e.id === benchId);
  store.completeSet("a", bench, bench.sets[1].id, { weightKg: 62.5, reps: 6, durationS: null, distanceM: null });
  const ops = outbox();
  assert.equal(ops.length, 1, "the newer copy replaced the pending one");
  const payload = JSON.parse(ops[0].payload);
  assert.deepEqual(payload.exercises.map((e) => [e.name, e.sets.length]), [["Barbell Bench Press", 2]]);
  assert.ok(payload.endedAt >= payload.startedAt);
  assert.equal(payload.exercises.find((e) => e.id === rowId), undefined);
  assert.equal(store.getWorkout(w.id).synced, false);
});

test("a log for yesterday goes into yesterday's workout, not today's", async () => {
  const { addDays } = load(path.join(root, "../shared/domain/progress.ts"));
  const { localDate } = load(path.join(root, "../shared/domain/food.ts"));
  const now = localDate(new Date());
  const { runItem } = feature("assistant/executors");
  const item = (date) => ({
    action: { kind: "log_workout", span: "bench 60 kg 8 reps", date, confidence: "high" },
    tier: "do",
    resolved: { kind: "workout", sets: [parsed(exercises[0], 60, 8)], usual: false },
    ask: null,
    line: "",
    state: "pending",
    receipt: "",
    undo: null,
  });
  const ctx = { userId: "a", today: now, heard: "", source: "voice", previous: null };
  const y = await runItem(item(addDays(now, -1)), ctx);
  const t = await runItem(item(undefined), ctx);
  const t2 = await runItem(item(undefined), ctx);
  assert.equal(y.state, "done");
  assert.match(y.receipt, /yesterday's workout/);
  assert.match(t.receipt, /today's workout/);
  const store = feature("gym/store");
  assert.equal(store.workoutOn("a", addDays(now, -1)).id, y.undo.workoutId);
  assert.equal(t.undo.workoutId, t2.undo.workoutId, "same day, same workout");
  assert.equal(store.workoutStats(store.workoutOn("a", now)).sets, 2);

  // Undo takes back exactly that turn's sets; the day's last undo takes the workout with it.
  await feature("assistant/executors").undoToken("a", t2.undo);
  assert.equal(store.workoutStats(store.workoutOn("a", now)).sets, 1);
  await feature("assistant/executors").undoToken("a", t.undo);
  assert.equal(store.workoutOn("a", now), null);
});

test("a routine adds its exercises to today's workout; ones already there aren't doubled", () => {
  const store = feature("gym/store");
  const routines = feature("gym/routines");
  const w = store.startWorkout("a");
  store.addExercises(w, [{ exercise: exercises[0] }]);
  const r = routines.saveRoutine("a", {
    name: "Push day",
    exercises: [
      { id: randomUUID(), exerciseId: "bench", name: "Barbell Bench Press", type: "weight_reps", category: "chest", targetSets: 3, targetReps: 10 },
      { id: randomUUID(), exerciseId: "plank", name: "Plank", type: "time", category: "abs", targetSets: 2, targetReps: null },
    ],
  });
  const day = routines.startRoutine("a", r, (id) => exercises.find((e) => e.id === id) ?? null);
  assert.equal(day.id, w.id);
  assert.deepEqual(store.getWorkout(w.id).exercises.map((e) => e.name), ["Barbell Bench Press", "Plank"]);
  assert.equal(store.getWorkout(w.id).routineId, r.id);
});

test("a day with nothing ticked isn't history or a session this week", () => {
  const store = feature("gym/store");
  const w = store.startWorkout("a");
  store.addExercises(w, [{ exercise: exercises[0] }]);
  assert.equal(store.recentWorkouts("a").length, 0);
  assert.equal(store.workoutsBetween("a", "2000-01-01", "2999-12-31").length, 0);
});

test("a workout an older version left open: yesterday's is finished, today's becomes today's", () => {
  const { addDays } = load(path.join(root, "../shared/domain/progress.ts"));
  const { localDate } = load(path.join(root, "../shared/domain/food.ts"));
  const now = localDate(new Date());
  const store = feature("gym/store");
  const insert = (id, date) =>
    sql
      .prepare(`INSERT INTO workouts (id, user_id, name, status, started_at, local_date, client_updated_at) VALUES (?, 'a', 'Evening workout', 'active', ?, ?, ?)`)
      .run(id, `${date}T12:00:00.000Z`, date, `${date}T12:00:00.000Z`);
  insert("old", addDays(now, -1));
  insert("open", now);
  for (const id of ["old", "open"]) {
    const w = store.getWorkout(id);
    store.addExercises(w, [{ exercise: exercises[0] }]);
    const we = store.getWorkout(id).exercises[0];
    sql.prepare(`UPDATE workout_sets SET weight_kg = 60, reps = 8, done = 1, completed_at = ? WHERE id = ?`).run(new Date().toISOString(), we.sets[0].id);
  }
  const day = store.activeWorkout("a");
  assert.equal(day.id, "open");
  assert.equal(day.status, "done");
  assert.equal(store.getWorkout("old").status, "done");
  assert.ok(outbox().some((o) => o.record_id === "old") && outbox().some((o) => o.record_id === "open"));
});

test("create_routine saves the routine from this phone's exercises; Undo deletes it", async () => {
  const { runItem, undoToken } = feature("assistant/executors");
  const routines = feature("gym/routines");
  const item = {
    action: { kind: "create_routine", name: "Push day", span: "bench 3x8, plank" },
    tier: "approve",
    resolved: {
      kind: "routine",
      name: "Push day",
      exercises: [
        { exercise: exercises[0], targetSets: 3, targetReps: 8 },
        { exercise: exercises[2], targetSets: 2, targetReps: 10 },
      ],
      unmatched: [],
    },
    ask: null,
    line: "",
    state: "pending",
    receipt: "",
    undo: null,
  };
  const ran = await runItem(item, { userId: "a", today: today(), heard: "", source: "voice", previous: null });
  assert.equal(ran.state, "done");
  const saved = routines.listRoutines("a");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "Push day");
  assert.deepEqual(saved[0].exercises.map((e) => [e.name, e.targetSets, e.targetReps]), [["Barbell Bench Press", 3, 8], ["Plank", 2, null]]);
  assert.ok(sql.prepare("SELECT 1 FROM outbox WHERE entity = 'routine'").get(), "synced like the editor's");
  await undoToken("a", ran.undo);
  assert.equal(routines.listRoutines("a").length, 0);
});

test("strength comparison: now vs the session nearest 3, 6 and 12 months ago", () => {
  const { compareMonthsAgo, monthsBefore, withinMonths } = load(path.join(root, "../shared/domain/gym.ts"));
  assert.equal(monthsBefore("2026-05-31", 3), "2026-02-28");
  assert.equal(monthsBefore("2026-10-20", 12), "2025-10-20");
  const points = [
    { date: "2025-10-25", value: 40 },
    { date: "2026-04-10", value: 50 },
    { date: "2026-07-15", value: 55 },
    { date: "2026-10-18", value: 60 },
  ];
  const at = (m) => compareMonthsAgo(points, "2026-10-20", m);
  assert.deepEqual(at(3), { months: 3, then: { date: "2026-07-15", value: 55 }, now: { date: "2026-10-18", value: 60 }, change: 5 });
  assert.equal(at(6).then.date, "2026-04-10");
  assert.equal(at(12).change, 20);
  assert.equal(compareMonthsAgo([{ date: "2026-10-18", value: 60 }], "2026-10-20", 3).change, null, "no session then");
  assert.deepEqual(withinMonths(points, "2026-10-20", 6).map((p) => p.date), ["2026-07-15", "2026-10-18"]);
});

test("records: each exercise's best set, bests and latest record day, most recently trained first", () => {
  const store = feature("gym/store");
  const w = store.startWorkout("a");
  const [benchId] = store.addExercises(w, [{ exercise: exercises[0], targetSets: 2 }]);
  let bench = store.getWorkout(w.id).exercises.find((e) => e.id === benchId);
  store.completeSet("a", bench, bench.sets[0].id, { weightKg: 60, reps: 8, durationS: null, distanceM: null });
  bench = store.getWorkout(w.id).exercises.find((e) => e.id === benchId);
  store.completeSet("a", bench, bench.sets[1].id, { weightKg: 70, reps: 5, durationS: null, distanceM: null });
  const [r] = store.exerciseRecords("a", new Map(exercises.map((e) => [e.id, e.type])));
  assert.equal(r.exerciseId, "bench");
  assert.equal(r.best.weightKg, 70);
  assert.ok(r.bests.e1rm > 70);
  assert.equal(r.lastPr.set.weightKg, 70, "the latest record-setting set");
  assert.equal(r.lastPr.date, store.getWorkout(w.id).localDate);
});
