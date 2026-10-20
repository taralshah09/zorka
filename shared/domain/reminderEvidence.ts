export type ReminderEventKind = "scheduled" | "received" | "opened" | "snoozed" | "completed";
export type ReminderEvent = { id: string; kind: string; event: ReminderEventKind; at: string };
/** A scheduled time passing is not delivery. Only observed receipts may enter this optional experiment. */
export function pausedReminderKinds(events: readonly ReminderEvent[], now: number): string[] {
  const responded = new Set(events.filter((e) => e.event === "opened" || e.event === "completed" || e.event === "snoozed").map((e) => e.id));
  const receipts = new Map<string, ReminderEvent>();
  for (const event of events) if (event.event === "received" && !responded.has(event.id) && now - Date.parse(event.at) >= 48 * 3600000) receipts.set(event.id, event);
  const counts = new Map<string, number>();
  for (const receipt of receipts.values()) counts.set(receipt.kind, (counts.get(receipt.kind) ?? 0) + 1);
  return [...counts].filter(([, count]) => count >= 3).map(([kind]) => kind);
}
