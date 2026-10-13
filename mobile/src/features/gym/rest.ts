// P20 · Rest timer (D40). Starts after each ticked set at the exercise's rest time (default 90 s), with
// −15 s / +15 s / Skip. Kept as an end time, so it stays right across re-renders and screen changes.
// At zero the phone vibrates (RN Vibration, no extra dependency) while the app is open. UX T4: a local
// notification is also scheduled for the end time, so a locked or backgrounded phone still gets "Rest over".
// It is only scheduled when notifications are already allowed (never asks), and moves with −15/+15/Skip.
import { Platform, Vibration } from "react-native";
import { create } from "zustand";

import { kv } from "@/core/storage/kv";
import { Notifications, REST_NOTIFICATION_PREFIX } from "@/features/nudges/notifications";
import { clampRest, DEFAULT_REST_S, REST_STEP_S } from "@shared/domain/gym";

type RestState = {
  /** ms timestamp the rest ends at, or null when no timer is running. */
  endsAt: number | null;
  totalS: number;
  /** What the rest is for, e.g. "Barbell Bench Press". */
  label: string | null;
};

export const useRestTimer = create<RestState>(() => ({ endsAt: null, totalS: 0, label: null }));

let doneTimer: ReturnType<typeof setTimeout> | undefined;

const REST_CHANNEL = "rest-timer";
let channelReady = false;

/** Replaces the pending "Rest over" alert with one at `endsAt` (or just cancels it). Best effort: never throws. */
async function scheduleAlert(endsAt: number | null, label: string | null) {
  const N = Notifications;
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(REST_NOTIFICATION_PREFIX);
    if (endsAt === null || endsAt - Date.now() < 1000) return;
    if (!(await N.getPermissionsAsync()).granted) return;
    if (Platform.OS === "android" && !channelReady) {
      await N.setNotificationChannelAsync(REST_CHANNEL, {
        name: "Rest timer",
        description: "Tells you when your rest between sets is over.",
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 150, 300],
      });
      channelReady = true;
    }
    // A later change may have moved or ended the rest while we were awaiting.
    if (useRestTimer.getState().endsAt !== endsAt) return;
    await N.scheduleNotificationAsync({
      identifier: REST_NOTIFICATION_PREFIX,
      content: { title: "Rest over", body: label ? `Next set of ${label}` : "Time for your next set" },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: REST_CHANNEL },
    });
  } catch {
    // No alert this time; the in-app vibration still works.
  }
}

function schedule(endsAt: number | null) {
  clearTimeout(doneTimer);
  void scheduleAlert(endsAt, useRestTimer.getState().label);
  if (endsAt === null) return;
  doneTimer = setTimeout(
    () => {
      Vibration.vibrate([0, 300, 150, 300]);
      useRestTimer.setState({ endsAt: null, label: null });
    },
    Math.max(0, endsAt - Date.now()),
  );
}

export const restTimer = {
  start(seconds: number, label: string | null) {
    const endsAt = Date.now() + seconds * 1000;
    useRestTimer.setState({ endsAt, totalS: seconds, label });
    schedule(endsAt);
  },
  /** −15 s / +15 s. Going to zero or below ends the rest. */
  adjust(deltaS: number) {
    const { endsAt, totalS } = useRestTimer.getState();
    if (endsAt === null) return;
    const next = endsAt + deltaS * 1000;
    if (next <= Date.now()) return restTimer.skip();
    useRestTimer.setState({ endsAt: next, totalS: Math.max(REST_STEP_S, totalS + deltaS) });
    schedule(next);
  },
  skip() {
    useRestTimer.setState({ endsAt: null, label: null });
    schedule(null);
  },
};

// ── Per-exercise rest time (kept on this phone) ────────────────────────────────────────────────

const restKey = (userId: string, exerciseId: string) => `zorka.rest.${userId}.${exerciseId}`;

export function restFor(userId: string, exerciseId: string | null): number {
  if (!exerciseId) return DEFAULT_REST_S;
  const saved = Number(kv.get(restKey(userId, exerciseId)));
  return saved ? clampRest(saved) : DEFAULT_REST_S;
}

export function setRestFor(userId: string, exerciseId: string, seconds: number) {
  const s = clampRest(seconds);
  if (s === DEFAULT_REST_S) kv.remove(restKey(userId, exerciseId));
  else kv.set(restKey(userId, exerciseId), String(s));
}
