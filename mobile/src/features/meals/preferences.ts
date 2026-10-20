import { create } from "zustand";
import { kv } from "@/core/storage/kv";
export type CaptureMethod = "voice" | "photo" | "type" | "search";
export type Preferences = { capture: CaptureMethod | null; routineId: string | null };
const key = (userId: string) => `zorka.preparedPreferences.${userId}`;
export const usePreferencesVersion = create<{ v: number }>(() => ({ v: 0 }));
export function preferencesFor(userId: string | null): Preferences {
  try { return { capture: null, routineId: null, ...JSON.parse(userId ? kv.get(key(userId)) ?? "{}" : "{}") }; }
  catch { return { capture: null, routineId: null }; }
}
export function savePreferences(userId: string, values: Partial<Preferences>) {
  kv.set(key(userId), JSON.stringify({ ...preferencesFor(userId), ...values }));
  usePreferencesVersion.setState((s) => ({ v: s.v + 1 }));
}
