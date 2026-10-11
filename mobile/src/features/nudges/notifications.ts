// The local-notification half of expo-notifications (P36, D61), loaded piece by piece.
//
// Importing the package root also loads its push-token code, which needs the native "ExpoPushTokenManager". Expo Go
// (SDK 53+) doesn't ship that module, so the root import throws at load time and takes the root layout down. Nudges are
// local only (no push), so only the modules for scheduling, permissions, channels and taps are loaded here, straight
// from the package's build files. They don't touch push tokens, so this works in Expo Go and in a dev build. `null` when
// one of their native modules is missing (web, or a build without expo-notifications at all).
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type Full = typeof import("expo-notifications");
export type LocalNotifications = Pick<
  Full,
  | "setNotificationHandler"
  | "setNotificationChannelAsync"
  | "AndroidImportance"
  | "getPermissionsAsync"
  | "requestPermissionsAsync"
  | "scheduleNotificationAsync"
  | "cancelAllScheduledNotificationsAsync"
  | "SchedulableTriggerInputTypes"
  | "getLastNotificationResponse"
  | "clearLastNotificationResponse"
  | "addNotificationResponseReceivedListener"
>;

const NATIVE = [
  "ExpoNotificationScheduler",
  "ExpoNotificationPermissionsModule",
  "ExpoNotificationsHandlerModule",
  "ExpoNotificationsEmitter",
  "ExpoNotificationChannelManager",
];

/* eslint-disable @typescript-eslint/no-require-imports */
function load(): LocalNotifications | null {
  if (Platform.OS === "web") return null;
  if (NATIVE.some((name) => !requireOptionalNativeModule(name))) return null;
  try {
    const schedule = require("expo-notifications/build/scheduleNotificationAsync");
    const cancelAll = require("expo-notifications/build/cancelAllScheduledNotificationsAsync");
    const channel = require("expo-notifications/build/setNotificationChannelAsync");
    const channelTypes = require("expo-notifications/build/NotificationChannelManager.types");
    const permissions = require("expo-notifications/build/NotificationPermissions");
    const handler = require("expo-notifications/build/NotificationsHandler");
    const emitter = require("expo-notifications/build/NotificationsEmitter");
    const types = require("expo-notifications/build/Notifications.types");
    return {
      scheduleNotificationAsync: schedule.scheduleNotificationAsync,
      cancelAllScheduledNotificationsAsync: cancelAll.cancelAllScheduledNotificationsAsync,
      setNotificationChannelAsync: channel.setNotificationChannelAsync,
      AndroidImportance: channelTypes.AndroidImportance,
      getPermissionsAsync: permissions.getPermissionsAsync,
      requestPermissionsAsync: permissions.requestPermissionsAsync,
      setNotificationHandler: handler.setNotificationHandler,
      getLastNotificationResponse: emitter.getLastNotificationResponse,
      clearLastNotificationResponse: emitter.clearLastNotificationResponse,
      addNotificationResponseReceivedListener: emitter.addNotificationResponseReceivedListener,
      SchedulableTriggerInputTypes: types.SchedulableTriggerInputTypes,
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** null on web, or in a build without expo-notifications' native modules. */
export const Notifications = load();
