// Imported at application entry: Android can invoke this task without mounting any screen.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { activeMs, ACTIVITY_LABEL, clockLabel, routeStats, type Activity } from "@shared/domain/activity";
import {
  activeActivity,
  appendFixes,
  finishActivity,
  getActivity,
  routePoints,
  saveActivity,
  setRecording,
} from "./store";

const GPS_TASK = "kimbo.activity.location.v1";
let watcher: Location.LocationSubscription | null = null;
let foregroundId: string | null = null;
let changing = false;
let notificationMinute = -1;
function backgroundOptions(a: Activity): Location.LocationTaskOptions {
  const seconds = activeMs(a) / 1000;
  const kilometres = routeStats(routePoints(a.id)).distanceM / 1000;
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,
    distanceInterval: 0,
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
    pausesUpdatesAutomatically: false,
    activityType: a.kind === "ride" ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `${ACTIVITY_LABEL[a.kind]} recording · Zorka`,
      notificationBody: `${kilometres.toFixed(2)} km · ${clockLabel(seconds)} · Open Zorka to pause or stop`,
      killServiceOnDestroy: false,
    },
  };
}
const fixesFrom = (locations: Location.LocationObject[]) =>
  locations.map((l) => ({
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    accuracy: l.coords.accuracy ?? Infinity,
    timestamp: l.timestamp,
  }));

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
  const a = activeActivity();
  if (!a || a.status !== "recording" || !a.background) return;
  if (error) {
    saveActivity({ ...a, error: "GPS updates stopped. Open the recorder and check location settings." });
    return;
  }
  if (data?.locations) appendFixes(a.id, fixesFrom(data.locations));
  const latest = getActivity(a.id);
  if (latest?.status === "recording" && !changing) {
    const minute = Math.floor(activeMs(latest) / 60000);
    if (minute !== notificationMinute) {
      notificationMinute = minute;
      try {
        await Location.startLocationUpdatesAsync(GPS_TASK, backgroundOptions(latest));
      } catch {
        /* Route persistence must survive a notification refresh failure. */
      }
    }
  }
});

async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (changing) throw new Error("Wait for the recorder to finish changing state.");
  changing = true;
  try {
    return await fn();
  } finally {
    changing = false;
  }
}
async function detach() {
  watcher?.remove();
  watcher = null;
  foregroundId = null;
  if (Platform.OS !== "web" && (await Location.hasStartedLocationUpdatesAsync(GPS_TASK))) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
  }
}
export async function resumeRecorder(id: string) {
  return exclusive(async () => {
    const a = getActivity(id);
    if (!a || a.status === "done") return;
    if (a.status === "recording") return;
    if (!(await Location.getForegroundPermissionsAsync()).granted)
      throw new Error("Location permission is off. Open Settings to enable it.");
    if (!(await Location.hasServicesEnabledAsync())) throw new Error("Turn on your phone's Location setting first.");
    if (a.background && !(await Location.getBackgroundPermissionsAsync()).granted)
      throw new Error("Allow location all the time for locked-screen recording.");
    if (a.background && !(await TaskManager.isAvailableAsync()))
      throw new Error("Background recording needs a development build, not Expo Go.");
    await detach();
    setRecording(id, true);
    try {
      if (a.background) {
        notificationMinute = -1;
        await Location.startLocationUpdatesAsync(GPS_TASK, backgroundOptions(getActivity(id)!));
      } else {
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 0 },
          (l) => appendFixes(id, fixesFrom([l])),
          () => {
            const latest = getActivity(id);
            if (latest) saveActivity({ ...latest, error: "GPS is unavailable. Distance may be incomplete." });
          },
        );
        foregroundId = id;
      }
    } catch (e) {
      setRecording(id, false);
      throw e;
    }
  });
}
export async function pauseRecorder(id: string) {
  return exclusive(async () => {
    if (activeActivity()?.id !== id) return;
    setRecording(id, false);
    await detach();
  });
}
export async function stopRecorder(id: string) {
  return exclusive(async () => {
    if (activeActivity()?.id !== id) return;
    // Mark paused before awaiting native stop so late callbacks cannot append points.
    setRecording(id, false);
    await detach();
    finishActivity(id);
  });
}
export async function reconcileRecorder() {
  const a = activeActivity();
  if (!a || a.status !== "recording" || changing) return;
  const running = a.background ? await Location.hasStartedLocationUpdatesAsync(GPS_TASK) : foregroundId === a.id;
  if (!running) {
    setRecording(a.id, false, a.heartbeatAt);
    const paused = getActivity(a.id)!;
    saveActivity({ ...paused, error: "Recording was interrupted. Your saved route is here; resume when ready." });
  }
}
export function startRecorderLifecycle() {
  void reconcileRecorder().catch(() => {});
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void reconcileRecorder().catch(() => {});
    else if (foregroundId) {
      // Foreground-only permission must never imply locked-screen tracking.
      const id = foregroundId;
      void pauseRecorder(id).catch(() => {});
    }
  });
  const timer = setInterval(() => {
    if (AppState.currentState !== "active") return;
    const a = activeActivity();
    if (a?.status === "recording") saveActivity({ ...a, heartbeatAt: Date.now() });
  }, 5000);
  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
export function liveStats(a: Activity, now: number) {
  const points = routePoints(a.id);
  const stats = routeStats(points);
  const last = points.at(-1);
  const recent = last
    ? points.slice(-8).filter((p) => p.segment === last.segment && last.timestamp - p.timestamp <= 20000)
    : [];
  const previous = recent[0];
  const currentDistance = routeStats(recent).distanceM;
  return {
    ...stats,
    points,
    seconds: activeMs(a, now) / 1000,
    currentSeconds: last && previous ? (last.activeMs - previous.activeMs) / 1000 : 0,
    currentDistance: last && now - last.timestamp <= 10000 ? currentDistance : 0,
    weak: !a.lastFixAt || now - a.lastFixAt > 20000,
  };
}
