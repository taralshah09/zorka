// On-device database (expo-sqlite). Local-first entities are written here first, together with an
// outbox row, in one transaction; the sync engine pushes the outbox when the phone is online.
// Schema changes are versioned with PRAGMA user_version — add a new step, never edit an old one.
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

const MIGRATIONS: ((db: SQLiteDatabase) => void)[] = [
  // v1 · P07 — outbox + the dev-only sync probe entity.
  (db) =>
    db.execSync(`
      CREATE TABLE outbox (
        op_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        action TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT,
        client_updated_at TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX outbox_queue ON outbox (status, user_id, created_at);
      CREATE TABLE sync_probes (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        note TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX sync_probes_user ON sync_probes (user_id, client_updated_at);
    `),

  // v2 · P12 — food catalog cache (search works offline) + local-first meal logs.
  //   foods.owner_user_id: NULL for the curated catalog, the user's id for their own foods (P13).
  //   foods.synced = 0 for a user-created food that hasn't reached the server yet.
  //   meal_items.diet / category are display snapshots (diet marker, icon tile).
  (db) =>
    db.execSync(`
      CREATE TABLE foods (
        id TEXT PRIMARY KEY NOT NULL,
        owner_user_id TEXT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX foods_owner ON foods (owner_user_id);
      CREATE TABLE meal_logs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        logged_at TEXT NOT NULL,
        local_date TEXT NOT NULL,
        source TEXT NOT NULL,
        oil_level TEXT,
        photo_uri TEXT,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX meal_logs_day ON meal_logs (user_id, local_date);
      CREATE TABLE meal_items (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        food_id TEXT,
        name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        grams REAL NOT NULL,
        kcal REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g REAL NOT NULL,
        fat_g REAL NOT NULL,
        diet TEXT,
        category TEXT
      );
      CREATE INDEX meal_items_meal ON meal_items (meal_id, position);
      CREATE INDEX meal_items_food ON meal_items (food_id);
    `),

  // v3 · P16 — voice notes recorded offline, read once the phone is back online.
  (db) =>
    db.execSync(`
      CREATE TABLE voice_queue (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        uri TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        meal_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX voice_queue_user ON voice_queue (user_id, created_at);
    `),

  // v4 · P19 — exercise list cache (the picker works offline) + local-first workouts.
  //   exercises: same shape as foods (curated rows have owner_user_id NULL; synced = 0 for a user-created
  //   exercise not yet on the server).
  //   workouts.status: 'active' while logging (never synced), 'done' once finished (synced as "workout").
  //   workout_exercises.category is a display snapshot (icon tile, S22 summaries).
  (db) =>
    db.execSync(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY NOT NULL,
        owner_user_id TEXT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX exercises_owner ON exercises (owner_user_id);
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        local_date TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX workouts_user ON workouts (user_id, status, started_at);
      CREATE TABLE workout_exercises (
        id TEXT PRIMARY KEY NOT NULL,
        workout_id TEXT NOT NULL,
        exercise_id TEXT,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT
      );
      CREATE INDEX workout_exercises_workout ON workout_exercises (workout_id, position);
      CREATE INDEX workout_exercises_exercise ON workout_exercises (exercise_id);
      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY NOT NULL,
        workout_exercise_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        weight_kg REAL,
        reps INTEGER,
        duration_s INTEGER,
        distance_m REAL,
        done INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT
      );
      CREATE INDEX workout_sets_exercise ON workout_sets (workout_exercise_id, position);
    `),

  // v5 · P20 — the records each ticked set broke (JSON array of PR kinds, D39).
  (db) => db.execSync(`ALTER TABLE workout_sets ADD COLUMN pr_kinds TEXT NOT NULL DEFAULT '[]';`),

  // v6 · P21 — routines, and the routine a workout was started from. target_reps on workout_exercises is
  // local only: the reps placeholder when there's no previous session.
  (db) =>
    db.execSync(`
      CREATE TABLE routines (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        exercises TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX routines_user ON routines (user_id);
      ALTER TABLE workouts ADD COLUMN routine_id TEXT;
      ALTER TABLE workout_exercises ADD COLUMN target_reps INTEGER;
    `),
  // v7 · P23–P26: device-only health cache and durable GPS sessions/points.
  (db) =>
    db.execSync(`
    CREATE TABLE activities (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL,
      status TEXT NOT NULL, local_date TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX activities_day ON activities(user_id, local_date, status);
    CREATE UNIQUE INDEX one_recording ON activities((1)) WHERE status IN ('recording', 'paused');
    CREATE TABLE route_points (activity_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
      data TEXT NOT NULL, PRIMARY KEY(activity_id, timestamp));
    CREATE TABLE health_steps (user_id TEXT NOT NULL, local_date TEXT NOT NULL,
      steps INTEGER NOT NULL, hourly TEXT NOT NULL, read_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, local_date));
  `),

  // v8 — finished GPS activities sync to the server as "activity". Existing rows start unsynced and are
  // queued by the first full pull (features/activity/store.ts).
  (db) =>
    db.execSync(`
      ALTER TABLE activities ADD COLUMN client_updated_at TEXT;
      ALTER TABLE activities ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
    `),

  // v9 · P27–P29 — weigh-ins ("weight_log"), answered weekly check-ins ("checkin", the target history) and
  // phases ("phase"). All local-first and synced. phases.summary is the frozen closing summary (JSON).
  (db) =>
    db.execSync(`
      CREATE TABLE weight_logs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        kg REAL NOT NULL,
        logged_at TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX weight_logs_day ON weight_logs (user_id, local_date);
      CREATE TABLE checkins (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        checkin_date TEXT NOT NULL,
        data TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX checkins_user ON checkins (user_id, checkin_date);
      CREATE TABLE phases (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        closed_date TEXT,
        data TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX phases_user ON phases (user_id, start_date);
    `),

  // v10 · P31–P36 — phone-only (D58): tomorrow's eased targets, coach chat history, and nearby options per area (P34,
  // 12 h). None of these sync.
  (db) =>
    db.execSync(`
      CREATE TABLE target_eases (
        user_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        kcal INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, local_date)
      );
      CREATE TABLE coach_messages (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        coach TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX coach_messages_user ON coach_messages (user_id, created_at);
      CREATE TABLE nearby_cache (
        area_key TEXT NOT NULL,
        diet TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (area_key, diet)
      );
    `),
];

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync("kimbo.db");
  db.execSync("PRAGMA journal_mode = WAL;");
  const { user_version: current } = db.getFirstSync<{ user_version: number }>("PRAGMA user_version") ?? {
    user_version: 0,
  };
  for (let v = current; v < MIGRATIONS.length; v++) {
    const step = MIGRATIONS[v]!;
    db.withTransactionSync(() => {
      step(db!);
      db!.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}
