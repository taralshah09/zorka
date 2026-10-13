// Meal logs on the phone (P12/P13). Local-first (D23): every write goes to SQLite together with an outbox
// op in one transaction, so logging works offline and syncs later as entity "meal_log".
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import type { DietPref, FoodCategory } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import { localDate, sumMacros, type FoodUnit, type Macros, type MealType, type OilLevel } from "@shared/domain/food";

export type MealSource = "search" | "text" | "voice" | "photo" | "repeat";

export type MealItem = {
  id: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unit: FoodUnit;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  diet: DietPref | null;
  category: FoodCategory | null;
};

export type Meal = {
  id: string;
  userId: string;
  mealType: MealType;
  loggedAt: string;
  localDate: string;
  source: MealSource;
  oilLevel: OilLevel | null;
  /** The user's own photo (S14/S21). Stays on the phone; never uploaded with the meal. */
  photoUri: string | null;
  items: MealItem[];
  synced: boolean;
};

/** Bumped on every local meal change so hooks re-read. */
export const useMealsVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useMealsVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("meal_log", (row) => {
  getDb().runSync(
    `UPDATE meal_logs SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type MealRow = {
  id: string;
  user_id: string;
  meal_type: MealType;
  logged_at: string;
  local_date: string;
  source: MealSource;
  oil_level: OilLevel | null;
  photo_uri: string | null;
  synced: number;
};
type ItemRow = {
  id: string;
  meal_id: string;
  food_id: string | null;
  name: string;
  quantity: number;
  unit: FoodUnit;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  diet: DietPref | null;
  category: FoodCategory | null;
};

function hydrate(rows: MealRow[]): Meal[] {
  if (!rows.length) return [];
  const items = getDb().getAllSync<ItemRow>(
    `SELECT * FROM meal_items WHERE meal_id IN (${rows.map(() => "?").join(",")}) ORDER BY position`,
    ...rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    mealType: r.meal_type,
    loggedAt: r.logged_at,
    localDate: r.local_date,
    source: r.source,
    oilLevel: r.oil_level,
    photoUri: r.photo_uri,
    synced: !!r.synced,
    items: items
      .filter((i) => i.meal_id === r.id)
      .map((i) => ({
        id: i.id,
        foodId: i.food_id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        grams: i.grams,
        kcal: i.kcal,
        proteinG: i.protein_g,
        carbsG: i.carbs_g,
        fatG: i.fat_g,
        diet: i.diet,
        category: i.category,
      })),
  }));
}

export function getMeal(id: string): Meal | null {
  const row = getDb().getFirstSync<MealRow>(`SELECT * FROM meal_logs WHERE id = ? AND deleted = 0`, id);
  return row ? hydrate([row])[0]! : null;
}

export function mealsForDay(userId: string, date: string): Meal[] {
  return hydrate(
    getDb().getAllSync<MealRow>(
      `SELECT * FROM meal_logs WHERE user_id = ? AND local_date = ? AND deleted = 0 ORDER BY logged_at`,
      userId,
      date,
    ),
  );
}

/** Meals from `start` to `end` (local dates, inclusive), oldest first. P32 counts "Your usual" from these. */
export function mealsBetween(userId: string, start: string, end: string): Meal[] {
  return hydrate(
    getDb().getAllSync<MealRow>(
      `SELECT * FROM meal_logs WHERE user_id = ? AND local_date BETWEEN ? AND ? AND deleted = 0 ORDER BY logged_at`,
      userId,
      start,
      end,
    ),
  );
}

/** Creates or replaces a meal (with all its items) and queues it for sync. */
export function saveMeal(meal: Omit<Meal, "synced">): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO meal_logs
         (id, user_id, meal_type, logged_at, local_date, source, oil_level, photo_uri, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      meal.id,
      meal.userId,
      meal.mealType,
      meal.loggedAt,
      meal.localDate,
      meal.source,
      meal.oilLevel,
      meal.photoUri,
      now,
    );
    db.runSync(`DELETE FROM meal_items WHERE meal_id = ?`, meal.id);
    meal.items.forEach((i, position) =>
      db.runSync(
        `INSERT INTO meal_items (id, meal_id, position, food_id, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, diet, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        i.id,
        meal.id,
        position,
        i.foodId,
        i.name,
        i.quantity,
        i.unit,
        i.grams,
        i.kcal,
        i.proteinG,
        i.carbsG,
        i.fatG,
        i.diet,
        i.category,
      ),
    );
    enqueue({
      op_id: randomUUID(),
      user_id: meal.userId,
      entity: "meal_log",
      action: "upsert",
      record_id: meal.id,
      payload: JSON.stringify({
        mealType: meal.mealType,
        loggedAt: meal.loggedAt,
        localDate: meal.localDate,
        source: meal.source,
        oilLevel: meal.oilLevel,
        items: meal.items.map(({ diet: _d, category: _c, ...i }) => i),
      }),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

export function deleteMeal(meal: Meal): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE meal_logs SET deleted = 1, synced = 0, client_updated_at = ? WHERE id = ?`, now, meal.id);
    enqueue({
      op_id: randomUUID(),
      user_id: meal.userId,
      entity: "meal_log",
      action: "delete",
      record_id: meal.id,
      payload: null,
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

/** Undo for a just-deleted meal (toast "Undo"): saves it again with a fresh write. */
export const restoreMeal = (meal: Meal) => saveMeal(meal);

// ── P13 · Repeat ─────────────────────────────────────────────────────────────────────────────────

/** A copy of `meal` logged now (new ids), as the given meal type. */
export function repeatMeal(meal: Meal, mealType: MealType = meal.mealType, at = new Date()): Meal {
  const copy: Meal = {
    ...meal,
    id: randomUUID(),
    mealType,
    loggedAt: at.toISOString(),
    localDate: localDate(at),
    source: "repeat",
    photoUri: null,
    synced: false,
    items: meal.items.map((i) => ({ ...i, id: randomUUID() })),
  };
  saveMeal(copy);
  return copy;
}

/**
 * The latest meal of this type in the `lookbackDays` before `today` (S11's repeat row). Looks back a week
 * (UX L1), so missing a day doesn't lose the shortcut.
 */
export function lastMealOfType(userId: string, mealType: MealType, today = new Date(), lookbackDays = 7): Meal | null {
  const from = new Date(today);
  from.setDate(from.getDate() - lookbackDays);
  const row = getDb().getFirstSync<MealRow>(
    `SELECT * FROM meal_logs WHERE user_id = ? AND local_date >= ? AND local_date < ? AND meal_type = ? AND deleted = 0
     ORDER BY logged_at DESC LIMIT 1`,
    userId,
    localDate(from),
    localDate(today),
    mealType,
  );
  return row ? hydrate([row])[0]! : null;
}

/** Same items in the same amounts = the same meal, whatever it was logged as. */
export const mealKey = (meal: Pick<Meal, "items">): string =>
  meal.items
    .map((i) => `${i.foodId ?? i.name}:${i.quantity}:${i.unit}`)
    .sort()
    .join("|");

/** Recent distinct meals (by their item list), newest first. */
export function recentMeals(userId: string, limit = 8): Meal[] {
  const meals = hydrate(
    getDb().getAllSync<MealRow>(
      `SELECT * FROM meal_logs WHERE user_id = ? AND deleted = 0 ORDER BY logged_at DESC LIMIT 60`,
      userId,
    ),
  );
  const seen = new Set<string>();
  const out: Meal[] = [];
  for (const m of meals) {
    const key = mealKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

/** How much of this food the user logged last time (UX L2), or null if never. */
export function lastPortion(userId: string, foodId: string): { quantity: number; unit: FoodUnit } | null {
  return getDb().getFirstSync<{ quantity: number; unit: FoodUnit }>(
    `SELECT i.quantity AS quantity, i.unit AS unit
       FROM meal_items i JOIN meal_logs m ON m.id = i.meal_id
      WHERE m.user_id = ? AND m.deleted = 0 AND i.food_id = ?
      ORDER BY m.logged_at DESC LIMIT 1`,
    userId,
    foodId,
  );
}

/** `lastPortion` for every food the user has logged, in one read (S18 rows). */
export function lastPortions(userId: string): Map<string, { quantity: number; unit: FoodUnit }> {
  // SQLite returns the bare columns from the row that holds MAX(logged_at).
  const rows = getDb().getAllSync<{ food_id: string; quantity: number; unit: FoodUnit }>(
    `SELECT i.food_id AS food_id, i.quantity AS quantity, i.unit AS unit, MAX(m.logged_at) AS last
       FROM meal_items i JOIN meal_logs m ON m.id = i.meal_id
      WHERE m.user_id = ? AND m.deleted = 0 AND i.food_id IS NOT NULL
      GROUP BY i.food_id`,
    userId,
  );
  return new Map(rows.map((r) => [r.food_id, { quantity: r.quantity, unit: r.unit }]));
}

// ── Pull ─────────────────────────────────────────────────────────────────────────────────────────

/** A meal as GET /users/:id/changes sends it (backend MealLogDto). */
type ServerMeal = {
  id: string;
  mealType: MealType;
  loggedAt: string;
  localDate: string;
  source: MealSource;
  oilLevel: OilLevel | null;
  clientUpdatedAt: string;
  items: Omit<MealItem, "diet" | "category">[];
};

onPulled("meal_log", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string; photo_uri: string | null }>(
      `SELECT synced, client_updated_at, photo_uri FROM meal_logs WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local change wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM meal_items WHERE meal_id = ?`, id);
      db.runSync(`DELETE FROM meal_logs WHERE id = ?`, id);
      return;
    }
    const m = data as ServerMeal;
    if (local?.client_updated_at === m.clientUpdatedAt) return;
    db.runSync(
      `INSERT OR REPLACE INTO meal_logs
         (id, user_id, meal_type, logged_at, local_date, source, oil_level, photo_uri, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      m.mealType,
      m.loggedAt,
      m.localDate,
      m.source,
      m.oilLevel,
      local?.photo_uri ?? null,
      m.clientUpdatedAt,
    );
    db.runSync(`DELETE FROM meal_items WHERE meal_id = ?`, id);
    m.items.forEach((i, position) =>
      // diet / category are display snapshots the server doesn't keep; take them from the cached food.
      db.runSync(
        `INSERT INTO meal_items (id, meal_id, position, food_id, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, diet, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           (SELECT json_extract(data, '$.diet') FROM foods WHERE id = ?4),
           (SELECT json_extract(data, '$.category') FROM foods WHERE id = ?4))`,
        i.id,
        id,
        position,
        i.foodId,
        i.name,
        i.quantity,
        i.unit,
        i.grams,
        i.kcal,
        i.proteinG,
        i.carbsG,
        i.fatG,
      ),
    );
  },

  requeueMissing(userId, onServer) {
    const ids = getDb()
      .getAllSync<{ id: string }>(`SELECT id FROM meal_logs WHERE user_id = ? AND synced = 1 AND deleted = 0`, userId)
      .filter((r) => !onServer.has(r.id));
    for (const { id } of ids) {
      const meal = getMeal(id);
      if (meal) saveMeal(meal);
    }
    return ids.length;
  },

  changed: bump,
});

// ── Totals and hooks ─────────────────────────────────────────────────────────────────────────────

export const mealTotals = (meal: Pick<Meal, "items">): Macros => sumMacros(meal.items);

/** Re-reads on local writes and when sync status changes (e.g. synced ticks). */
function useMealsStamp() {
  const v = useMealsVersion((s) => s.v);
  const sync = useSyncStatus((s) => `${s.pending}:${s.lastSyncedAt}`);
  return `${v}:${sync}`;
}

export function useDayMeals(userId: string | null, date: string): Meal[] {
  const stamp = useMealsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? mealsForDay(userId, date) : [];
  }, [userId, date, stamp]);
}

export function useMeal(id: string | undefined): Meal | null {
  const stamp = useMealsStamp();
  return useMemo(() => {
    void stamp;
    return id ? getMeal(id) : null;
  }, [id, stamp]);
}

/** `day` (a local date) is the day being logged to; defaults to today. */
export function useLastMealOfType(userId: string | null, mealType: MealType, day?: string): Meal | null {
  const stamp = useMealsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? lastMealOfType(userId, mealType, day ? new Date(`${day}T12:00:00`) : undefined) : null;
  }, [userId, mealType, day, stamp]);
}

export function useRecentMeals(userId: string | null, limit = 8): Meal[] {
  const stamp = useMealsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? recentMeals(userId, limit) : [];
  }, [userId, limit, stamp]);
}
