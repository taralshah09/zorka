// AB3 · "Remind me to pack snacks at 9pm" (`remind_me`): one local notification (P36's local-only notifications, no
// push). The nudge planner leaves these alone when it re-plans (REMINDER_NOTIFICATION_PREFIX).
import { randomUUID } from "expo-crypto";

import { Notifications, REMINDER_NOTIFICATION_PREFIX } from "@/features/nudges/notifications";
import { ensureChannel, NUDGE_CHANNEL } from "@/features/nudges/settings";

/** The moment `minute` of `date` (local). */
export function reminderTime(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, Math.floor(minute / 60), minute % 60);
}

/** Schedules the reminder; resolves to its id, or a reason it couldn't be set. */
export async function scheduleReminder(what: string, date: string, minute: number): Promise<{ id: string } | { error: string }> {
  const N = Notifications;
  if (!N) return { error: "Reminders aren't available in this build." };
  const at = reminderTime(date, minute);
  if (at.getTime() <= Date.now()) return { error: "That time has already passed." };
  const permission = await N.getPermissionsAsync();
  if (!permission.granted) {
    const asked = await N.requestPermissionsAsync();
    if (!asked.granted) return { error: "Notifications are off for Zorka. Turn them on in Settings to get reminders." };
  }
  await ensureChannel();
  const id = `${REMINDER_NOTIFICATION_PREFIX}.${randomUUID()}`;
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title: "Zorka", body: `Reminder: ${what}` },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at, channelId: NUDGE_CHANNEL },
  });
  return { id };
}

export async function cancelReminder(id: string) {
  await Notifications?.cancelScheduledNotificationAsync(id).catch(() => {});
}
