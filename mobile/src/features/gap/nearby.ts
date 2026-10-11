// P34 · Nearby Zomato/Blinkit options on the phone (D59). The area is a pincode the user typed, or the locality from a
// coarse location fix (reverse-geocoded on the phone: coordinates never leave it). Results are cached 12 h per area and
// diet in SQLite, then the server is asked. Opening a link remembers it so S42 can ask "Ordered it?" on return.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import { create } from "zustand";

import { api } from "@/core/api/client";
import type { DietPref, NearbyArea, NearbyOption, NearbyResult } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { kv, KV_KEYS } from "@/core/storage/kv";
import { saveMeal } from "@/features/meals/store";
import { localDate, mealTypeForTime } from "@shared/domain/food";

export const NEARBY_CACHE_MS = 12 * 60 * 60 * 1000;
/** "Ordered it?" is asked when the app comes back within this long of opening a link. */
export const ORDER_PROMPT_WINDOW_MS = 2 * 60 * 60 * 1000;

// ── Area ─────────────────────────────────────────────────────────────────────────────────────────

const pinKey = (userId: string) => `${KV_KEYS.pincode}.${userId}`;
export const savedPincode = (userId: string | null) => (userId ? kv.get(pinKey(userId)) : null);
export const isPincode = (s: string) => /^[1-9][0-9]{5}$/.test(s.trim());
export function savePincode(userId: string, pincode: string | null) {
  if (pincode) kv.set(pinKey(userId), pincode.trim());
  else kv.remove(pinKey(userId));
}

const clean = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** Same key as the server (nearby.service.ts areaOf). */
export function areaKey(area: NearbyArea): string {
  if (area.pincode) return `pin:${area.pincode}`;
  return `loc:${[area.locality, area.city]
    .filter((p) => p?.trim())
    .map(clean)
    .join("|")}`;
}

export type LocationAccess = "granted" | "ask" | "denied" | "unknown";

export async function locationAccess(): Promise<LocationAccess> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "ask" : "denied";
  } catch {
    return "unknown";
  }
}

export async function requestLocation(): Promise<LocationAccess> {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "ask" : "denied";
  } catch {
    return "unknown";
  }
}

/** Locality + city from a coarse fix, reverse-geocoded on the phone. null when there's no fix or no place name. */
async function areaFromLocation(): Promise<NearbyArea | null> {
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null)) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const [place] = await Location.reverseGeocodeAsync({
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  });
  if (!place) return null;
  const locality = place.district ?? place.subregion ?? place.name ?? undefined;
  const city = place.city ?? place.subregion ?? undefined;
  if (city || locality) return { locality: locality ?? undefined, city: city ?? undefined };
  return place.postalCode && isPincode(place.postalCode) ? { pincode: place.postalCode } : null;
}

// ── Cache + API ──────────────────────────────────────────────────────────────────────────────────

function cached(key: string, diet: DietPref): NearbyResult | null {
  const row = getDb().getFirstSync<{ fetched_at: number; data: string }>(
    `SELECT fetched_at, data FROM nearby_cache WHERE area_key = ? AND diet = ?`,
    key,
    diet,
  );
  return row && Date.now() - row.fetched_at < NEARBY_CACHE_MS ? (JSON.parse(row.data) as NearbyResult) : null;
}

function remember(key: string, diet: DietPref, result: NearbyResult) {
  const db = getDb();
  db.runSync(`DELETE FROM nearby_cache WHERE fetched_at < ?`, Date.now() - NEARBY_CACHE_MS);
  db.runSync(
    `INSERT OR REPLACE INTO nearby_cache (area_key, diet, fetched_at, data) VALUES (?, ?, ?, ?)`,
    key,
    diet,
    Date.now(),
    JSON.stringify(result),
  );
}

export type NearbyState =
  | { status: "need_area"; access: LocationAccess }
  | { status: "loading" }
  | { status: "ready"; result: NearbyResult; area: NearbyArea }
  | { status: "error"; area: NearbyArea | null };

/**
 * Nearby options for the active profile. Waits for an area: a saved pincode, or location access (never asked from
 * here: S43 asks). Errors leave the rest of S41 untouched (D59 "degrades gracefully").
 */
export function useNearby(userId: string | null, diet: DietPref, enabled = true) {
  const [access, setAccess] = useState<LocationAccess>("unknown");
  const [pinVersion, setPinVersion] = useState(0);
  const pincode = savedPincode(userId);
  const qc = useQueryClient();
  void pinVersion;

  useEffect(() => {
    void locationAccess().then(setAccess);
  }, []);

  const areaQuery = useQuery({
    queryKey: ["nearbyArea", userId, pincode, access],
    enabled: enabled && !!userId && (!!pincode || access === "granted"),
    staleTime: 30 * 60_000,
    retry: 0,
    queryFn: async (): Promise<NearbyArea | null> => (pincode ? { pincode } : areaFromLocation()),
  });
  const area = areaQuery.data ?? null;

  const optionsQuery = useQuery({
    queryKey: ["nearby", userId, diet, area ? areaKey(area) : null],
    enabled: enabled && !!userId && !!area,
    staleTime: NEARBY_CACHE_MS,
    retry: 0,
    queryFn: async () => {
      const key = areaKey(area!);
      const hit = cached(key, diet);
      if (hit) return hit;
      const result = await api<NearbyResult>(`/users/${userId}/nearby`, {
        method: "POST",
        body: { area, diet },
        timeoutMs: 30_000,
      });
      if (!result.partial) remember(key, diet, result);
      return result;
    },
  });

  const refreshAccess = useCallback(async (next?: LocationAccess) => setAccess(next ?? (await locationAccess())), []);
  const setPin = useCallback(
    (pin: string | null) => {
      if (!userId) return;
      savePincode(userId, pin);
      setPinVersion((v) => v + 1);
      void qc.invalidateQueries({ queryKey: ["nearbyArea", userId] });
    },
    [userId, qc],
  );

  let state: NearbyState;
  if (!pincode && access !== "granted") state = { status: "need_area", access };
  else if (areaQuery.isPending) state = { status: "loading" };
  // No fix or no place name for it: offer Retry (and the pincode from S43).
  else if (areaQuery.isError || !area) state = { status: "error", area: null };
  else if (optionsQuery.isPending) state = { status: "loading" };
  else if (optionsQuery.isError || !optionsQuery.data) state = { status: "error", area };
  else state = { status: "ready", result: optionsQuery.data, area };

  return {
    state,
    pincode,
    access,
    refreshAccess,
    setPin,
    retry: () => (areaQuery.isError || !area ? areaQuery.refetch() : optionsQuery.refetch()),
  };
}

// ── Deep link + "Ordered it?" (S42) ──────────────────────────────────────────────────────────────

export type PendingOrder = { userId: string; option: NearbyOption; openedAt: number };

export const usePendingOrder = create<{ pending: PendingOrder | null }>(() => ({
  pending: (() => {
    try {
      const raw = kv.get(KV_KEYS.pendingOrder);
      return raw ? (JSON.parse(raw) as PendingOrder) : null;
    } catch {
      return null;
    }
  })(),
}));

function setPending(p: PendingOrder | null) {
  if (p) kv.set(KV_KEYS.pendingOrder, JSON.stringify(p));
  else kv.remove(KV_KEYS.pendingOrder);
  usePendingOrder.setState({ pending: p });
}

/** Opens Zomato / Blinkit (https links open the app when it's installed) and remembers the option for S42. */
export async function openNearby(userId: string, option: NearbyOption): Promise<boolean> {
  try {
    await Linking.openURL(option.url);
  } catch {
    return false;
  }
  setPending({ userId, option, openedAt: Date.now() });
  return true;
}

/** The order to ask about on return, if it's recent enough; older ones are dropped. */
export function orderToAsk(now = Date.now()): PendingOrder | null {
  const p = usePendingOrder.getState().pending;
  if (!p) return null;
  if (now - p.openedAt > ORDER_PROMPT_WINDOW_MS) {
    setPending(null);
    return null;
  }
  return p;
}

export const dismissOrder = () => setPending(null);

/** "Yes, log it": a meal with the estimated macros (food id null, one serving), logged now. */
export function logOrder(p: PendingOrder): void {
  const at = new Date();
  const o = p.option;
  saveMeal({
    id: randomUUID(),
    userId: p.userId,
    mealType: mealTypeForTime(at),
    loggedAt: at.toISOString(),
    localDate: localDate(at),
    source: "search",
    oilLevel: null,
    photoUri: null,
    items: [
      {
        id: randomUUID(),
        foodId: null,
        name: o.restaurant ? `${o.name} (${o.restaurant})` : o.name,
        quantity: 1,
        unit: "serving",
        grams: 0,
        kcal: o.macros.kcal,
        proteinG: o.macros.proteinG,
        carbsG: o.macros.carbsG,
        fatG: o.macros.fatG,
        diet: o.diet,
        category: o.source === "zomato" ? "restaurant" : null,
      },
    ],
  });
  setPending(null);
}
