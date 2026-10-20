import { kv } from "@/core/storage/kv";
import type { ReminderEvent } from "@shared/domain/reminderEvidence";
const key = (userId: string) => `zorka.reminderEvents.${userId}`;
export function reminderEvents(userId: string): ReminderEvent[] {
  try { return JSON.parse(kv.get(key(userId)) ?? "[]"); } catch { return []; }
}
export function recordReminder(userId: string, entry: ReminderEvent) {
  try {
    const events = reminderEvents(userId);
    if (events.some((e) => e.id === entry.id && e.event === entry.event)) return;
    kv.set(key(userId), JSON.stringify([...events, entry].slice(-500)));
  } catch { /* Observation must not prevent a chosen action from succeeding. */ }
}
export function resetReminderEvidence(userId: string, kind: string) {
  kv.set(key(userId), JSON.stringify(reminderEvents(userId).filter((e) => e.kind !== kind)));
}
export function completeUsefulAction(userId: string, action: "meal" | "workout") {
  const opened = reminderEvents(userId).filter((e) => e.event === "opened" &&
    (action === "workout" ? e.kind === "workout" : ["morning", "protein", "slipping"].includes(e.kind)) &&
    Date.now() - Date.parse(e.at) < 2 * 3600000).at(-1);
  if (opened) recordReminder(userId, { ...opened, event: "completed", at: new Date().toISOString() });
}
