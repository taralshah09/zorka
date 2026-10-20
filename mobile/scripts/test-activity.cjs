// Exercise the real SQLite migrations, store and recorder with native APIs mocked.
// Run: node scripts/test-activity.cjs (Node 22+). This does not replace Android device testing.
/* global __dirname */
const { DatabaseSync } = require("node:sqlite");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const mobileRoot = path.resolve(__dirname, "..");
let sql, modules, store, recorder, appState, native, healthNative, tasks, tick, live;
const originalNow = Date.now;
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const localRequire = (name) => {
    if (name === "expo-crypto") return { randomUUID };
    if (name === "react-native")
      return {
        AppState: appState,
        Platform: { OS: "android" },
        TurboModuleRegistry: { get: () => (healthNative?.linked ? {} : null) },
      };
    if (name === "expo-location") return native;
    // Sync: offline, so finishing an activity only queues its outbox op.
    if (name === "@/core/network/network")
      return { useNetwork: { getState: () => ({ online: false }), subscribe() {} } };
    if (name === "expo-sqlite/kv-store")
      return { __esModule: true, default: { getItemSync: () => null, setItemSync() {}, removeItemSync() {} } };
    if (name === "react-native-health-connect") return healthNative;
    // Live recording notification: records the last posted one; dismissing isn't available here.
    if (name === "expo") return { requireOptionalNativeModule: () => null };
    if (name === "@/features/nudges/notifications")
      return {
        Notifications: {
          AndroidImportance: { LOW: 2 },
          setNotificationChannelAsync: async () => null,
          scheduleNotificationAsync: async (request) => {
            live = request;
          },
        },
      };
    if (name === "expo-task-manager")
      return { defineTask: (name, fn) => tasks.set(name, fn), isAvailableAsync: async () => true };
    if (name === "expo-sqlite")
      return {
        openDatabaseSync: () => ({
          execSync: (sqlText) => sql.exec(sqlText),
          runSync: (query, ...args) => sql.prepare(query).run(...args),
          getFirstSync: (query, ...args) => sql.prepare(query).get(...args) ?? null,
          getAllSync: (query, ...args) => sql.prepare(query).all(...args),
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
    if (name.startsWith("@/")) return load(path.join(mobileRoot, "src", name.slice(2) + ".ts"));
    if (name.startsWith("@shared/")) return load(path.join(mobileRoot, "../shared", name.slice(8) + ".ts"));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  modules = new Map();
  tasks = new Map();
  live = null;
  tick = 1791712800000;
  Date.now = () => tick;
  appState = {
    currentState: "active",
    listeners: [],
    addEventListener: (_, fn) => {
      appState.listeners.push(fn);
      return { remove() {} };
    },
  };
  native = {
    running: false,
    callback: null,
    options: null,
    removed: false,
    failStart: false,
    Accuracy: { BestForNavigation: 6 },
    ActivityType: { Fitness: 1, OtherNavigation: 2 },
    getForegroundPermissionsAsync: async () => ({ granted: true }),
    getBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => native.running,
    startLocationUpdatesAsync: async (_, options) => {
      if (native.failStart) throw new Error("Native start failed");
      native.running = true;
      native.options = options;
    },
    stopLocationUpdatesAsync: async () => {
      native.running = false;
    },
    watchPositionAsync: async (_, fn) => {
      native.callback = fn;
      return {
        remove: () => {
          native.removed = true;
        },
      };
    },
  };
  healthNative = {
    linked: true,
    status: 3,
    granted: [],
    requests: [],
    aggregates: [],
    SdkAvailabilityStatus: { SDK_AVAILABLE: 3, SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2 },
    getSdkStatus: async () => healthNative.status,
    initialize: async () => true,
    getGrantedPermissions: async () => healthNative.granted,
    requestPermission: async (p) => {
      healthNative.requests.push(p);
      healthNative.granted = p;
      return p;
    },
    aggregateRecord: async (request) => {
      healthNative.aggregates.push(request);
      const interval = Date.parse(request.timeRangeFilter.endTime) - Date.parse(request.timeRangeFilter.startTime);
      return { COUNT_TOTAL: interval > 3600000 ? 1234 : 10 };
    },
  };
  store = load(path.join(mobileRoot, "src/features/activity/store.ts"));
  recorder = load(path.join(mobileRoot, "src/features/activity/recorder.ts"));
});
afterEach(() => {
  sql.close();
  Date.now = originalNow;
});
const point = (metres, timestamp = tick) => ({
  latitude: 0,
  longitude: ((metres / 6371000) * 180) / Math.PI,
  accuracy: 5,
  timestamp,
});

test("Expo Go and older builds report missing Health Connect without loading or requesting native access", async () => {
  healthNative.linked = false;
  healthNative.getSdkStatus = () => {
    throw new Error("Native module must not be called");
  };
  const health = load(path.join(mobileRoot, "src/features/activity/health.ts"));
  assert.equal(await health.healthStatus(), "build");
  assert.equal(await health.requestSteps(), "build");
  assert.equal(healthNative.requests.length, 0);
});

test("all migrations apply and only one recording/paused session can exist across profiles", () => {
  store.createActivity("a", "run", 70, false);
  // v10 since P31–P36 (target_eases, coach_messages, nearby_cache), v11 water_logs, v12 coach_messages.actions (UX N1),
  // v13 voice_queue.kind/text (UX F6), v14 day_briefs, day_plans, memory_facts and menus (life plan).
  assert.equal(sql.prepare("PRAGMA user_version").get().user_version, 14);
  assert.throws(() => store.createActivity("b", "walk", 70, false), /Finish/);
  assert.throws(
    () =>
      sql
        .prepare("INSERT INTO activities(id,user_id,status,local_date,data) VALUES(?,?,?,?,?)")
        .run("other", "b", "paused", "2026-10-11", "{}"),
    /UNIQUE/,
  );
});
test("SQLite upgrade preserves an existing meal and workout", () => {
  load(path.join(mobileRoot, "src/core/storage/db.ts")).getDb();
  sql
    .prepare(
      "INSERT INTO meal_logs(id,user_id,meal_type,logged_at,local_date,source,client_updated_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run("meal", "a", "lunch", "now", "2026-10-11", "manual", "now");
  sql
    .prepare(
      "INSERT INTO workouts(id,user_id,name,status,started_at,local_date,client_updated_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run("workout", "a", "Gym", "active", "now", "2026-10-11", "now");
  // Recreate a v6 database to run the actual upgrade rather than merely checking fresh creation.
  sql.exec(
    "DROP TABLE route_points; DROP TABLE health_steps; DROP TABLE activities; " +
      "DROP TABLE weight_logs; DROP TABLE checkins; DROP TABLE phases; " +
      "DROP TABLE target_eases; DROP TABLE coach_messages; DROP TABLE nearby_cache; DROP TABLE water_logs; " +
      "DROP TABLE day_briefs; DROP TABLE day_plans; DROP TABLE memory_facts; DROP TABLE menus; " +
      // voice_queue as v3 made it (v13 adds two columns).
      "DROP TABLE voice_queue; CREATE TABLE voice_queue (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, " +
      "uri TEXT NOT NULL, mime_type TEXT NOT NULL, duration_ms INTEGER NOT NULL, meal_type TEXT NOT NULL, " +
      "created_at TEXT NOT NULL); " +
      "PRAGMA user_version = 6",
  );
  modules.delete(path.join(mobileRoot, "src/core/storage/db.ts"));
  load(path.join(mobileRoot, "src/core/storage/db.ts")).getDb();
  assert.equal(sql.prepare("SELECT count(*) AS n FROM meal_logs").get().n, 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM workouts").get().n, 1);
});
test("pause excludes resting time and late callbacks; resume doesn't bridge moved position", async () => {
  const a = store.createActivity("a", "run", 70, false);
  await recorder.resumeRecorder(a.id);
  store.appendFixes(a.id, [point(0)]);
  tick += 10000;
  store.appendFixes(a.id, [point(30)]);
  await recorder.pauseRecorder(a.id);
  tick += 60000;
  store.appendFixes(a.id, [point(300)]);
  assert.equal(store.routePoints(a.id).length, 2);
  await recorder.resumeRecorder(a.id);
  store.appendFixes(a.id, [point(300)]);
  tick += 10000;
  store.appendFixes(a.id, [point(330)]);
  await recorder.stopRecorder(a.id);
  const done = store.getActivity(a.id);
  assert.equal(done.elapsedMs, 20000);
  assert.equal(done.status, "done");
  const stats = load(path.join(mobileRoot, "../shared/domain/activity.ts")).routeStats(store.routePoints(a.id));
  assert.ok(Math.abs(stats.distanceM - 60) < 0.01);
  assert.equal(native.removed, true);
});
test("completion credit is durable, profile-scoped and idempotent", async () => {
  const a = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(a.id);
  tick += 30 * 60000;
  await recorder.stopRecorder(a.id);
  const done = store.getActivity(a.id);
  const credit = store.dayCredit("a", done.localDate);
  assert.equal(credit.kcal, 291);
  assert.equal(credit.points, 60);
  await recorder.stopRecorder(a.id);
  store.finishActivity(a.id);
  assert.equal(store.dayCredit("a", done.localDate).kcal, 291);
  assert.equal(store.dayCredit("b", done.localDate).kcal, 0);
  assert.equal(native.running, false);
});
test("UX F5: a deleted session leaves lists and credit, queues a delete, and Undo brings it back", async () => {
  const a = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(a.id);
  tick += 30 * 60000;
  await recorder.stopRecorder(a.id);
  const done = store.getActivity(a.id);
  store.deleteActivity(done);
  assert.equal(store.getActivity(a.id), null);
  assert.equal(store.dayCredit("a", done.localDate).kcal, 0);
  assert.equal(store.recentActivities("a", 10).length, 0);
  const ops = sql.prepare("SELECT action FROM outbox WHERE record_id = ? ORDER BY rowid").all(a.id);
  assert.deepEqual(
    ops.map((o) => o.action),
    ["upsert", "delete"],
  );
  store.restoreActivity(done);
  assert.equal(store.getActivity(a.id).status, "done");
  assert.equal(store.dayCredit("a", done.localDate).kcal, 291);
  assert.equal(store.recentActivities("a", 10).length, 1);
  assert.equal(
    sql.prepare("SELECT action FROM outbox WHERE record_id = ? ORDER BY rowid DESC").get(a.id).action,
    "upsert",
  );
});
test("completion across midnight updates the indexed day as well as metadata", async () => {
  tick = new Date("2026-10-11T23:59:00").getTime();
  const a = store.createActivity("a", "walk", 70, false);
  await recorder.resumeRecorder(a.id);
  tick += 120000;
  await recorder.stopRecorder(a.id);
  assert.equal(store.getActivity(a.id).localDate, "2026-10-12");
  assert.equal(store.dayCredit("a", "2026-10-11").kcal, 0);
  assert.ok(store.dayCredit("a", "2026-10-12").kcal > 0);
});
test("a finished session is queued for the server with its route and restored by a pull", async () => {
  const a = store.createActivity("a", "run", 70, false);
  await recorder.resumeRecorder(a.id);
  store.appendFixes(a.id, [point(0)]);
  tick += 10000;
  store.appendFixes(a.id, [point(30)]);
  await recorder.stopRecorder(a.id);
  const ops = sql.prepare("SELECT * FROM outbox WHERE entity = 'activity'").all();
  assert.equal(ops.length, 1);
  const payload = JSON.parse(ops[0].payload);
  assert.equal(payload.kind, "run");
  assert.equal(payload.elapsedMs, 10000);
  assert.deepEqual(
    payload.points.map((p) => p.length),
    [6, 6],
  );

  const pull = load(path.join(mobileRoot, "src/core/sync/pull.ts"));
  const respond = (changes) => async () => ({
    ok: true,
    json: async () => ({ changes, cursor: new Date(tick).toISOString(), more: false }),
  });
  const realFetch = global.fetch;
  process.env.EXPO_PUBLIC_API_URL = "http://zorka.test";
  try {
    // A new phone for profile "b": the server's copy comes back as a finished session with its route.
    const id = randomUUID();
    const remote = { ...payload, id, clientUpdatedAt: ops[0].client_updated_at };
    global.fetch = respond([{ entity: "activity", id, deleted: false, data: remote }]);
    await pull.pullChanges("b");
    const restored = store.getActivity(id);
    assert.equal(restored.status, "done");
    assert.equal(store.routePoints(id).length, 2);
    assert.ok(store.dayCredit("b", restored.localDate).kcal > 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM outbox WHERE user_id = 'b'").get().n, 0);

    // A pull never overwrites a session that hasn't reached the server yet, nor queues it twice.
    global.fetch = respond([{ entity: "activity", id: a.id, deleted: false, data: { ...remote, kind: "walk" } }]);
    await pull.pullChanges("a");
    assert.equal(store.getActivity(a.id).kind, "run");
    assert.equal(sql.prepare("SELECT count(*) AS n FROM outbox WHERE entity = 'activity'").get().n, 1);
  } finally {
    global.fetch = realFetch;
    delete process.env.EXPO_PUBLIC_API_URL;
  }
});
test("background task saves batches without a mounted screen and ignores repeated events", async () => {
  const a = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(a.id);
  const event = tasks.values().next().value;
  const first = tick;
  tick += 9000;
  const locations = [point(0, first), point(10, first + 3000), point(20, first + 6000)].map((p) => ({
    timestamp: p.timestamp,
    coords: p,
  }));
  await event({ data: { locations }, error: null });
  await event({ data: { locations }, error: null });
  assert.equal(store.routePoints(a.id).length, 3);
  // The service notification can't change from the background; the live one carries distance and time.
  assert.equal(native.options.foregroundService.notificationBody, "Open Zorka to pause or stop");
  assert.match(live.content.title, /0\.02 km · 00:09/);
  await recorder.stopRecorder(a.id);
  await event({ data: { locations }, error: null });
  assert.equal(store.routePoints(a.id).length, 3);
});
test("restart without a native service pauses at the last persisted heartbeat", async () => {
  const a = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(a.id);
  tick += 10000;
  store.appendFixes(a.id, [point(0)]);
  native.running = false;
  tick += 3600000;
  await recorder.reconcileRecorder();
  const paused = store.getActivity(a.id);
  assert.equal(paused.status, "paused");
  assert.equal(paused.elapsedMs, 10000);
  assert.match(paused.error, /interrupted/);
});
test("foreground-only recording automatically pauses when leaving the app", async () => {
  const a = store.createActivity("a", "walk", 70, false);
  await recorder.resumeRecorder(a.id);
  const cleanup = recorder.startRecorderLifecycle();
  tick += 10000;
  appState.currentState = "background";
  appState.listeners.forEach((fn) => fn("background"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getActivity(a.id).status, "paused");
  assert.equal(native.removed, true);
  cleanup();
});
test("failed native start leaves a recoverable paused session", async () => {
  const a = store.createActivity("a", "run", 70, true);
  native.failStart = true;
  await assert.rejects(recorder.resumeRecorder(a.id), /Native start failed/);
  assert.equal(store.getActivity(a.id).status, "paused");
  assert.equal(native.running, false);
});
test("poor fixes don't add distance and stale pre-resume fixes are ignored", async () => {
  const a = store.createActivity("a", "run", 70, false);
  await recorder.resumeRecorder(a.id);
  store.appendFixes(a.id, [{ ...point(0), accuracy: 100 }, point(0, tick - 5000)]);
  assert.equal(store.routePoints(a.id).length, 0);
});
test("stale stop/pause events from a finished session cannot detach the next recorder", async () => {
  const old = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(old.id);
  await recorder.stopRecorder(old.id);
  const next = store.createActivity("a", "run", 70, true);
  await recorder.resumeRecorder(next.id);
  await recorder.stopRecorder(old.id);
  await recorder.pauseRecorder(old.id);
  assert.equal(native.running, true);
  assert.equal(store.getActivity(next.id).status, "recording");
});
test("health availability distinguishes install/update, unsupported and denied states without prompting", async () => {
  const health = load(path.join(mobileRoot, "src/features/activity/health.ts"));
  healthNative.status = 1;
  assert.equal(await health.healthStatus(), "unsupported");
  healthNative.status = 2;
  assert.equal(await health.healthStatus(), "missing");
  healthNative.status = 3;
  assert.equal(await health.healthStatus(), "permission");
  assert.equal(healthNative.requests.length, 0);
  assert.equal(await health.requestSteps(), "ready");
  assert.deepEqual(healthNative.requests, [[{ accessType: "read", recordType: "Steps" }]]);
});
test("health totals use aggregation and local-day boundaries, with no invented future-hour data", async () => {
  const health = load(path.join(mobileRoot, "src/features/activity/health.ts"));
  tick = new Date("2026-10-11T12:30:00").getTime();
  await health.readStepsDay("a", new Date(tick), true);
  const cache = health.cachedSteps("a", "2026-10-11");
  assert.equal(cache.steps, 1234);
  assert.equal(cache.hourly.length, 24);
  assert.equal(cache.hourly[12], 10);
  assert.equal(cache.hourly[13], 0);
  assert.equal(health.cachedSteps("b", "2026-10-11"), null);
  assert.equal(healthNative.aggregates.length, 14);
  assert.equal(new Date(healthNative.aggregates[0].timeRangeFilter.startTime).getHours(), 0);
  assert.equal(Date.parse(healthNative.aggregates[0].timeRangeFilter.endTime), tick);
  assert.ok(healthNative.aggregates.every((r) => r.recordType === "Steps"));
});
