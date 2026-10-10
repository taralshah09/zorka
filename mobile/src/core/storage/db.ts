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
