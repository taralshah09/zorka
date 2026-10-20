// PA0 acceptance checks against production modules, with native boundaries mocked.
// Node 22+; npm run test:pa. PA1 gaps run as TODO failures; --strict makes them blocking.
// Module reload simulates lost JS memory, not Android process death or native file durability.
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
let sql, modules, saved, files, preferences;

function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const localRequire = (name) => {
    if (name === "expo-sqlite/kv-store") return { __esModule: true, default: {
      getItemSync: (key) => preferences.get(key) ?? null,
      setItemSync: (key, value) => preferences.set(key, value),
      removeItemSync: (key) => preferences.delete(key),
    } };
    if (name === "expo-crypto") return { randomUUID };
    if (name === "react") return { useMemo: (fn) => fn() };
    if (name === "@/features/activity/store") return { routePoints: () => [] };
    if (name === "zustand") return require("zustand/vanilla");
    if (name === "expo-file-system")
      return {
        Paths: { document: "file:///documents" },
        Directory: class {
          constructor(parent, child) {
            this.uri = `${parent}/${child}`;
          }
          get exists() {
            return true;
          }
        },
        File: class {
          constructor(parent, child) {
            this.uri = child ? `${parent.uri}/${child}` : parent;
          }
          get exists() {
            return files.has(this.uri);
          }
          copySync(destination) {
            files.set(destination.uri, files.get(this.uri));
          }
          delete() {
            files.delete(this.uri);
          }
        },
      };
    if (name === "expo-sqlite")
      return {
        openDatabaseSync: () => ({
          execSync: (query) => sql.exec(query),
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
    if (name === "@/features/food/catalog") return { nutritionOf: (food) => food };
    // Observe saveDraft's outgoing records. This boundary does not verify meal persistence or outbox writes.
    if (name === "@/features/meals/store" || (name === "./store" && file.endsWith(`${path.sep}meals${path.sep}usual.ts`))) return { saveMeal: (meal) => saved.set(meal.id, meal), mealKey: (meal) => JSON.stringify(meal.items) };
    if (name.startsWith("@/")) return load(path.join(root, "src", `${name.slice(2)}.ts`));
    if (name.startsWith("@shared/")) return load(path.join(root, "../shared", `${name.slice(8)}.ts`));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  };
  // The production hook is read as a selector without mounting React. Keep the real vanilla store behavior.
  const requireWithStore = (name) =>
    name === "zustand"
      ? {
          create: (init) => {
            const store = localRequire(name).createStore(init);
            return Object.assign((selector) => selector(store.getState()), store);
          },
        }
      : localRequire(name);
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(
    requireWithStore,
    module,
    module.exports,
  );
  return module.exports;
}
const feature = (name) => load(path.join(root, "src/features", `${name}.ts`));
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  modules = new Map();
  saved = new Map();
  files = new Map();
  preferences = new Map([["zorka.activeUserId", "a"]]);
});
afterEach(() => sql.close());

const food = {
  id: "dal",
  name: "Dal",
  defaultUnit: "katori",
  liquid: false,
  homeCooked: false,
  diet: "veg",
  category: "dal",
  per100g: { kcal: 100, proteinG: 6, carbsG: 12, fatG: 3 },
  units: [{ unit: "katori", grams: 150 }],
};
const parsed = (source = "text", uncertain = false) => ({
  source,
  transcript: "1 katori dal",
  followUp: null,
  timings: { totalMs: 1 },
  items: [{ query: "dal", food, quantity: 1, unit: "katori", uncertain, reasons: uncertain ? ["vague_quantity"] : [] }],
});

test("typed capture survives a JS reload and remains isolated by profile", () => {
  let queue = feature("log/voiceQueue");
  const note = queue.queueText("a", "2 roti and dal", "dinner");
  queue.queueText("b", "1 dosa", "breakfast");
  modules = new Map();
  queue = feature("log/voiceQueue");
  assert.deepEqual(queue.useVoiceQueue("a"), [note]);
  assert.equal(queue.useVoiceQueue("b")[0].text, "1 dosa");
  assert.deepEqual(queue.useVoiceQueue(null), []);
});

test("voice keeps a copy; parsed photos can retain their source file", () => {
  const queue = feature("log/voiceQueue");
  files.set("file:///cache/voice.m4a", "audio");
  const voice = queue.queueVoice("a", "file:///cache/voice.m4a", "audio/mp4", 1000, "lunch");
  files.delete("file:///cache/voice.m4a");
  assert.equal(files.get(voice.uri), "audio");
  files.set("file:///documents/photo.jpg", "image");
  const photo = queue.queuePhoto("a", "file:///documents/photo.jpg", "dinner");
  queue.removeVoice(photo, true);
  assert.equal(files.get(photo.uri), "image");
  queue.removeVoice(voice);
  assert.equal(files.has(voice.uri), false);
  assert.deepEqual(queue.useVoiceQueue("a"), []);
});

test("each pending capture routes to its capture method", () => {
  const queue = feature("log/voiceQueue");
  for (const kind of ["voice", "photo", "text"]) {
    assert.deepEqual(queue.queuedHref({ id: "pending", kind }), {
      pathname: `/log/${kind === "text" ? "type" : kind}`,
      params: { queued: "pending" },
    });
  }
});

test("portion correction settles vague quantity but retains web uncertainty", () => {
  const { draftActions, useDraft, needsCheck } = feature("log/draft");
  draftActions.startFromParse(parsed("voice", true), {});
  draftActions.setQuantity(useDraft.getState().draft.items[0].key, 2);
  assert.equal(needsCheck(useDraft.getState().draft, false), false);
  const result = parsed("voice", true);
  result.items[0].food = null;
  draftActions.startFromParse(result, {});
  const key = useDraft.getState().draft.items[0].key;
  draftActions.applyEstimate(key, food, false);
  draftActions.setQuantity(key, 2);
  assert.equal(needsCheck(useDraft.getState().draft, false), true);
});

test("automatic estimates do not dirty a draft; explicit edits do", () => {
  const { draftActions, useDraft, isDraftDirty } = feature("log/draft");
  const result = parsed("voice", true);
  result.items[0].food = null;
  draftActions.startFromParse(result, {});
  const key = useDraft.getState().draft.items[0].key;
  draftActions.applyEstimate(key, food, false);
  assert.equal(isDraftDirty(), false);
  draftActions.setQuantity(key, 2);
  assert.equal(isDraftDirty(), true);
});

test("edited saved meals preserve their original date and identity", () => {
  const { draftActions, saveDraft } = feature("log/draft");
  const meal = {
    id: "existing",
    mealType: "dinner",
    source: "text",
    loggedAt: "2026-10-12T14:30:00.000Z",
    photoUri: null,
    items: [],
  };
  draftActions.startFromMeal(meal, () => null);
  assert.equal(saveDraft("a", false), meal.id);
  assert.equal(saved.get(meal.id).loggedAt, meal.loggedAt);
});

const knownGap = {};
test("PA0-R01: unsaved confirm edits recover after JS memory loss", knownGap, () => {
  let draft = feature("log/draft");
  draft.draftActions.startFromParse(parsed(), {});
  draft.draftActions.setQuantity(draft.useDraft.getState().draft.items[0].key, 2);
  const expected = draft.useDraft.getState().draft;
  modules = new Map();
  draft = feature("log/draft");
  assert.deepEqual(draft.useDraft.getState().draft, expected);
});

test("PA0-R02: deferred dinner keeps its capture timestamp", knownGap, () => {
  const queue = feature("log/voiceQueue");
  const note = queue.queueText("a", "1 katori dal", "dinner");
  sql.prepare("UPDATE voice_queue SET created_at = ? WHERE id = ?").run("2026-10-12T14:30:00.000Z", note.id);
  const deferred = queue.useVoiceQueue("a")[0];
  const { draftActions, useDraft } = feature("log/draft");
  // Current screen contract passes the meal type, but not the queued timestamp.
  draftActions.startFromParse(parsed(), { mealType: deferred.mealType, loggedAt: deferred.createdAt, captureId: deferred.id, userId: "a" });
  assert.equal(useDraft.getState().draft.loggedAt, deferred.createdAt);
});

test("PA0-R03: retrying the same unsaved draft uses one saved record", knownGap, () => {
  const { draftActions, saveDraft } = feature("log/draft");
  draftActions.startFromParse(parsed(), {});
  const first = saveDraft("a", false);
  const second = saveDraft("a", false);
  assert.equal(second, first);
  assert.equal(saved.size, 1);
});

test("draft ownership survives profile switches and rejects a stale parse", () => {
  const active = feature("users/activeUser").useActiveUser;
  const { draftActions, useDraft, saveDraft } = feature("log/draft");
  draftActions.startFromParse(parsed(), { userId: "a" });
  const first = useDraft.getState().draft;
  active.getState().setUser("b");
  assert.equal(useDraft.getState().draft, null);
  draftActions.startFromParse(parsed(), { userId: "a" });
  assert.equal(useDraft.getState().draft, null);
  active.getState().setUser("a");
  assert.deepEqual(useDraft.getState().draft, first);
  assert.throws(() => saveDraft("b", false), /another profile/);
});

test("changing a snapshot portion scales nutrition without changing the saved shortcut", () => {
  const { draftActions, useDraft, draftTotals } = feature("log/draft");
  const item = { id: "item", foodId: null, name: "Dal", quantity: 1, unit: "katori", grams: 150,
    kcal: 150, proteinG: 9, carbsG: 18, fatG: 4.5, diet: "veg", category: "dal" };
  draftActions.startFromMeal({ id: "old", mealType: "lunch", source: "repeat", loggedAt: new Date().toISOString(), items: [item] }, () => null);
  draftActions.makeNew();
  draftActions.setQuantity("item", 2);
  assert.equal(draftTotals(useDraft.getState().draft, false).kcal, 300);
  assert.equal(item.quantity, 1);
  assert.equal(item.kcal, 150);
});

test("meal context beats unrelated pinned breakfasts", () => {
  // Only ranking uses this module; production meal writes remain at the mocked boundary.
  const usual = feature("meals/usual");
  const list = [1, 2, 3].map((n) => ({ id: `${n}`, mealType: "breakfast", pinned: true, savedAt: "2026-10-13" }));
  const lunch = { id: "lunch", mealType: "lunch", savedAt: "2026-10-12" };
  assert.deepEqual(usual.rankedUsuals([...list, lunch], "lunch"), [lunch]);
});

test("brief priority resumes work and permits an independent finished visit", () => {
  const { briefPriority } = load(path.join(root, "../shared/domain/brief.ts"));
  const base = { activeSession: false, chosenDraft: false, prepared: true, optional: true, finished: true };
  assert.equal(briefPriority(base), "finished");
  assert.equal(briefPriority({ ...base, activeSession: true }), "resume");
  assert.equal(briefPriority({ ...base, chosenDraft: true }), "continue");
  assert.equal(briefPriority({ ...base, finished: false }), "prepared");
});

test("five breakfast-only days do not qualify as complete intake; pending capture vetoes confirmation", () => {
  feature("log/voiceQueue").queueText("a", "dinner pending", "dinner");
  const { completeIntake } = feature("progress/queries");
  for (let day = 1; day <= 5; day++) {
    const date = `2026-10-0${day}`;
    sql.prepare("INSERT INTO meal_logs (id,user_id,meal_type,logged_at,local_date,source,client_updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(`meal${day}`, "a", "breakfast", `${date}T08:00:00`, date, "search", `${date}T08:00:00`);
    sql.prepare("INSERT INTO meal_items (id,meal_id,position,name,quantity,unit,grams,kcal,protein_g,carbs_g,fat_g) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(`item${day}`, `meal${day}`, 0, "Dal", 1, "katori", 150, 150, 9, 18, 4.5);
  }
  assert.equal(completeIntake("a", "2026-10-01", "2026-10-05").length, 0);
  feature("meals/coverage").setCoverage("a", "2026-10-01", "complete");
  assert.equal(completeIntake("a", "2026-10-01", "2026-10-05").length, 1);
  sql.prepare("UPDATE voice_queue SET created_at = ?").run("2026-10-01T08:00:00");
  assert.equal(completeIntake("a", "2026-10-01", "2026-10-05").length, 0);
});
