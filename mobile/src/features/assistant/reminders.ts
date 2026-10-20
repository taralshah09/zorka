// AB3 · "Remind me to pack snacks at 9pm" (`remind_me`): one local notification (P36's local-only notifications, no
// push). The nudge planner leaves these alone when it re-plans (REMINDER_NOTIFICATION_PREFIX). Each one is also kept
// per profile in the key-value store, so "cancel my reminder" can find it and the router can see what's set.
import { randomUUID } from "expo-crypto";

import { kv } from "@/core/storage/kv";
import { Notifications, REMINDER_NOTIFICATION_PREFIX } from "@/features/nudges/notifications";
import { ensureChannel, NUDGE_CHANNEL } from "@/features/nudges/settings";

export type Reminder = { id: string; what: string; date: string; minute: number };

const key = (userId: string) => `zorka.reminders.${userId}`;

/** The moment `minute` of `date` (local). */
export function reminderTime(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, Math.floor(minute / 60), minute % 60);
}

/** This profile's reminders still to fire, soonest first. Ones that already fired drop off here. */
export function upcomingReminders(userId: string, now = Date.now()): Reminder[] {
  let list: Reminder[] = [];
  try {
    const raw = JSON.parse(kv.get(key(userId)) ?? "[]") as Reminder[];
    list = Array.isArray(raw) ? raw : [];
  } catch {
    list = [];
  }
  return list
    .filter((r) => reminderTime(r.date, r.minute).getTime() > now)
    .sort((a, b) => reminderTime(a.date, a.minute).getTime() - reminderTime(b.date, b.minute).getTime());
}

function write(userId: string, list: Reminder[]) {
  if (list.length) kv.set(key(userId), JSON.stringify(list));
  else kv.remove(key(userId));
}

/** Schedules the reminder; resolves to its id, or a reason it couldn't be set. */
export async function scheduleReminder(what: string, date: string, minute: number, userId?: string): Promise<{ id: string } | { error: string }> {
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
  if (userId) write(userId, [...upcomingReminders(userId), { id, what, date, minute }]);
  return { id };
}

export async function cancelReminder(id: string, userId?: string) {
  await Notifications?.cancelScheduledNotificationAsync(id).catch(() => {});
  if (userId) write(userId, upcomingReminders(userId).filter((r) => r.id !== id));
}
