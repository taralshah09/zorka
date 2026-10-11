// Food catalog on the phone (P12/P13). The server's catalog (curated + the user's own foods) is cached in
// SQLite so search works offline (S18 "offline: local cache only"). User-created foods are written here
// first and synced as entity "custom_food" (D23).
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { api, describeError } from "@/core/api/client";
import type { DietPref, Food, FoodCategory } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { getDb } from "@/core/storage/db";
import { kv } from "@/core/storage/kv";
import { notifyLocalWrite, onAcknowledged } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { useActiveUser } from "@/features/users/activeUser";
import { dietAllows, type FoodNutrition, type FoodUnit } from "@shared/domain/food";
import { rankFoods } from "@shared/domain/foodMatch";

/** Bumped whenever the local catalog changes, so hooks re-read it. */
export const useFoodsVersion = create<{ v: number }>(() => ({ v: 0 }));

/** State of the last catalog download, so S18 can show loading vs a real error. */
export const useCatalogStatus = create<{ loading: boolean; error: { title: string; body: string } | null }>(() => ({
  loading: false,
  error: null,
}));

let cache: { userId: string; foods: Food[]; byId: Map<string, Food> } | null = null;

function invalidate() {
  cache = null;
  useFoodsVersion.setState((s) => ({ v: s.v + 1 }));
}

onAcknowledged("custom_food", (row) => {
  getDb().runSync(`UPDATE foods SET synced = 1 WHERE id = ?`, row.record_id);
});

function load(userId: string) {
  if (cache?.userId === userId) return cache;
  const rows = getDb().getAllSync<{ data: string }>(
    `SELECT data FROM foods WHERE deleted = 0 AND (owner_user_id IS NULL OR owner_user_id = ?) ORDER BY name`,
    userId,
  );
  const foods = rows.map((r) => JSON.parse(r.data) as Food);
  cache = { userId, foods, byId: new Map(foods.map((f) => [f.id, f])) };
  return cache;
}

export const localFoods = (userId: string): Food[] => load(userId).foods;
export const getFood = (userId: string, id: string | null | undefined): Food | null =>
  id ? (load(userId).byId.get(id) ?? null) : null;

/** Local, ranked, offline-capable search (shared matcher, same as the server's). */
export function searchFoods(userId: string, q: string, limit = 30): Food[] {
  return q.trim() ? rankFoods(q, localFoods(userId), 0.35, limit) : [];
}

export const nutritionOf = (f: Food): FoodNutrition => ({
  per100g: f.per100g,
  defaultUnit: f.defaultUnit,
  units: f.units,
  liquid: f.liquid,
});

const syncedAtKey = (userId: string) => `kimbo.catalogSyncedAt.${userId}`;
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;

/** Pulls the catalog from the server. Keeps user-created foods that haven't synced yet. */
export async function refreshCatalog(userId: string, force = false): Promise<void> {
  const last = Number(kv.get(syncedAtKey(userId)) ?? 0);
  const haveCurated = !!getDb().getFirstSync(`SELECT 1 FROM foods WHERE owner_user_id IS NULL LIMIT 1`);
  if (!force && haveCurated && Date.now() - last < REFRESH_EVERY_MS) return;

  useCatalogStatus.setState({ loading: true, error: null });
  let foods: Food[];
  try {
    ({ foods } = await api<{ foods: Food[] }>(`/users/${userId}/foods/catalog`, { timeoutMs: 20_000 }));
  } catch (err) {
    useCatalogStatus.setState({ loading: false, error: describeError(err) });
    throw err;
  }
  useCatalogStatus.setState({ loading: false, error: null });
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM foods WHERE owner_user_id IS NULL`);
    db.runSync(`DELETE FROM foods WHERE owner_user_id = ? AND synced = 1`, userId);
    for (const f of foods) {
      db.runSync(
        `INSERT OR IGNORE INTO foods (id, owner_user_id, name, data, synced) VALUES (?, ?, ?, ?, 1)`,
        f.id,
        f.custom ? userId : null,
        f.name,
        JSON.stringify(f),
      );
    }
  });
  kv.set(syncedAtKey(userId), String(Date.now()));
  invalidate();
}

/** Keeps the active user's catalog fresh: on start, on user switch and when the phone comes online. */
export function useCatalogSync() {
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  useEffect(() => {
    if (userId && online) refreshCatalog(userId).catch(() => {});
  }, [userId, online]);
}

/** Re-reads whenever the catalog changes. */
export function useFoods(userId: string | null): Food[] {
  const v = useFoodsVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? localFoods(userId) : [];
  }, [userId, v]);
}

/** Foods from the user's recent meals, newest first (S18 "Recent"). */
export function recentFoods(userId: string, limit = 20): Food[] {
  const rows = getDb().getAllSync<{ food_id: string }>(
    `SELECT i.food_id AS food_id, MAX(m.logged_at) AS last
       FROM meal_items i JOIN meal_logs m ON m.id = i.meal_id
      WHERE m.user_id = ? AND m.deleted = 0 AND i.food_id IS NOT NULL
      GROUP BY i.food_id ORDER BY last DESC LIMIT ?`,
    userId,
    limit,
  );
  return rows.map((r) => getFood(userId, r.food_id)).filter((f): f is Food => !!f);
}

export const myFoods = (userId: string): Food[] => localFoods(userId).filter((f) => f.custom);

/** Everyday foods shown on S18 before the user has any recents. Names match the curated catalog (D29). */
const POPULAR = [
  "Roti (wheat chapati)",
  "Dal tadka",
  "Steamed rice",
  "Poha",
  "Idli",
  "Boiled egg",
  "Paneer bhurji",
  "Dahi (curd)",
  "Masala chai",
  "Chaas (buttermilk)",
  "Banana",
];

/** Popular foods that fit the user's diet (all of them when the diet isn't set). */
export function popularFoods(userId: string, diet: DietPref | null): Food[] {
  const byName = new Map(localFoods(userId).map((f) => [f.name, f]));
  return POPULAR.map((n) => byName.get(n)).filter((f): f is Food => !!f && (!diet || dietAllows(diet, f.diet)));
}

// ── P13 · Create a food (S20) ────────────────────────────────────────────────────────────────────

export type NewFood = {
  name: string;
  diet: DietPref;
  category: FoodCategory;
  homeCooked: boolean;
  liquid: boolean;
  serving: { unit: FoodUnit; grams: number };
  /** Macros for ONE serving. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Saves a user-created food locally (searchable at once, even offline) and queues it for sync. */
export function createFood(userId: string, input: NewFood): Food {
  const id = randomUUID();
  const now = new Date().toISOString();
  const per100 = 100 / input.serving.grams;
  const base: FoodUnit = input.liquid ? "ml" : "g";
  const food: Food = {
    id,
    name: input.name.trim(),
    aliases: [],
    cuisine: "other",
    category: input.category,
    diet: input.diet,
    homeCooked: input.homeCooked,
    liquid: input.liquid,
    per100g: {
      kcal: Math.round(input.kcal * per100),
      proteinG: round1(input.proteinG * per100),
      carbsG: round1(input.carbsG * per100),
      fatG: round1(input.fatG * per100),
    },
    defaultUnit: input.serving.unit,
    units:
      input.serving.unit === base
        ? [{ unit: base, grams: 1, label: null }]
        : [
            { unit: input.serving.unit, grams: input.serving.grams, label: null },
            { unit: base, grams: 1, label: null },
          ],
    source: "user",
    custom: true,
    updatedAt: now,
  };
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO foods (id, owner_user_id, name, data, synced) VALUES (?, ?, ?, ?, 0)`,
      id,
      userId,
      food.name,
      JSON.stringify(food),
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "custom_food",
      action: "upsert",
      record_id: id,
      payload: JSON.stringify({
        name: food.name,
        diet: input.diet,
        category: input.category,
        homeCooked: input.homeCooked,
        liquid: input.liquid,
        serving: input.serving,
        kcal: input.kcal,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
      }),
      client_updated_at: now,
    });
  });
  invalidate();
  notifyLocalWrite();
  return food;
}
