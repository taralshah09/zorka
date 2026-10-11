import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, TurboModuleRegistry } from "react-native";
import { getDb } from "@/core/storage/db";
import { activityChanged } from "./store";
import { localDate } from "@shared/domain/food";

export type HealthState = "loading" | "ready" | "permission" | "missing" | "unsupported" | "build" | "error";
type StepDay = { day: string; steps: number; hourly: number[]; readAt: number };
export function cachedSteps(userId: string | null, day: string): StepDay | null {
  if (!userId) return null;
  const r = getDb().getFirstSync<{ steps: number; hourly: string; read_at: number }>(
    "SELECT steps,hourly,read_at FROM health_steps WHERE user_id = ? AND local_date = ?",
    userId,
    day,
  );
  return r ? { day, steps: r.steps, hourly: JSON.parse(r.hourly), readAt: r.read_at } : null;
}
// Dynamic import keeps unsupported platforms and old development builds usable.
export async function healthStatus(): Promise<HealthState> {
  if (Platform.OS !== "android") return "unsupported";
  if (!TurboModuleRegistry.get("HealthConnect")) return "build";
  try {
    const h = await import("react-native-health-connect");
    const status = await h.getSdkStatus();
    if (status === h.SdkAvailabilityStatus.SDK_UNAVAILABLE) return "unsupported";
    if (status !== h.SdkAvailabilityStatus.SDK_AVAILABLE) return "missing";
    if (!(await h.initialize())) return "error";
    return (await h.getGrantedPermissions()).some((p) => p.recordType === "Steps" && p.accessType === "read")
      ? "ready"
      : "permission";
  } catch (e) {
    return e instanceof Error && /linked|TurboModuleRegistry|native module|Expo Go/i.test(e.message)
      ? "build"
      : "error";
  }
}
export async function requestSteps(): Promise<HealthState> {
  const status = await healthStatus();
  if (status !== "permission") return status;
  const h = await import("react-native-health-connect");
  await h.requestPermission([{ accessType: "read", recordType: "Steps" }]);
  return healthStatus();
}
export async function openHealthSettings() {
  const h = await import("react-native-health-connect");
  h.openHealthConnectSettings();
}
export const installHealth = () =>
  Linking.openURL("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata");

export async function readStepsDay(userId: string, date: Date, hourly: boolean) {
  const h = await import("react-native-health-connect");
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const endMs = Math.min(Date.now(), end.getTime());
  const total = await h.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter: {
      operator: "between",
      startTime: start.toISOString(),
      endTime: new Date(endMs).toISOString(),
    },
  });
  // Aggregate, rather than summing raw records: Health Connect deduplicates overlapping sources.
  const bars: number[] = [];
  if (hourly) {
    for (let hour = 0; hour < 24; hour++) {
      const from = new Date(start);
      from.setHours(hour);
      const to = new Date(start);
      to.setHours(hour + 1);
      if (from.getTime() >= endMs) {
        bars.push(0);
        continue;
      }
      const result = await h.aggregateRecord({
        recordType: "Steps",
        timeRangeFilter: {
          operator: "between",
          startTime: from.toISOString(),
          endTime: new Date(Math.min(to.getTime(), endMs)).toISOString(),
        },
      });
      bars.push(result.COUNT_TOTAL ?? 0);
    }
  }
  const previous = cachedSteps(userId, localDate(start));
  getDb().runSync(
    "INSERT OR REPLACE INTO health_steps(user_id,local_date,steps,hourly,read_at) VALUES(?,?,?,?,?)",
    userId,
    localDate(start),
    total.COUNT_TOTAL ?? 0,
    JSON.stringify(hourly ? bars : (previous?.hourly ?? [])),
    Date.now(),
  );
  activityChanged();
}
export function useHealthSteps(userId: string | null, day: string, detail = false) {
  const [state, setState] = useState<HealthState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const status = await healthStatus();
      setState(status);
      if (status === "ready") {
        await readStepsDay(userId, new Date(`${day}T12:00:00`), detail);
        if (detail)
          for (let i = 1; i <= 6; i++) {
            const d = new Date(`${day}T12:00:00`);
            d.setDate(d.getDate() - i);
            await readStepsDay(userId, d, false);
          }
      }
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [userId, day, detail]);
  useEffect(() => {
    const initialRead = setTimeout(() => void refresh(), 0);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 60000);
    return () => {
      sub.remove();
      clearTimeout(initialRead);
      clearInterval(timer);
    };
  }, [refresh]);
  return { state, refreshing, refresh };
}
