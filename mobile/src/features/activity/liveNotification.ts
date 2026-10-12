// Live distance and time for a screen-off recording (Android). expo-location's foreground-service notification can only
// be changed while the app is open: from the background Android refuses (ForegroundServiceStartNotAllowedException),
// which left it frozen at "0.00 km · 00:00". So that one stays a static "recording" line and this second, silent,
// sticky notification carries the live numbers. The GPS task refreshes it at most every UPDATE_MS.
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { Notifications } from "@/features/nudges/notifications";

const ID = "kimbo.activity.live";
const CHANNEL = "activity-live";
export const UPDATE_MS = 5000;

let channel: Promise<unknown> | null = null;
let lastAt = 0;
// Bumped by hideLiveStats so an update still in flight doesn't bring the notification back after a stop.
let generation = 0;

/* eslint-disable @typescript-eslint/no-require-imports */
const dismiss: ((id: string) => Promise<void>) | null = (() => {
  if (Platform.OS !== "android" || !requireOptionalNativeModule("ExpoNotificationPresenter")) return null;
  try {
    return require("expo-notifications/build/dismissNotificationAsync").dismissNotificationAsync;
  } catch {
    return null;
  }
})();
/* eslint-enable @typescript-eslint/no-require-imports */

/** Posts or refreshes the live line. `text` is only built when an update is due. */
export async function showLiveStats(text: () => { title: string; body: string }, force = false) {
  if (Platform.OS !== "android" || !Notifications) return;
  const now = Date.now();
  if (!force && now - lastAt < UPDATE_MS) return;
  lastAt = now;
  const gen = generation;
  try {
    channel ??= Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Activity recording",
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    });
    await channel;
    if (gen !== generation) return;
    const { title, body } = text();
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title, body, sticky: true, autoDismiss: false, sound: false },
      trigger: { channelId: CHANNEL },
    });
  } catch {
    channel = null;
    // A missed refresh is fine; the next GPS fix tries again.
  }
}

export async function hideLiveStats() {
  generation++;
  lastAt = 0;
  await dismiss?.(ID).catch(() => {});
}
