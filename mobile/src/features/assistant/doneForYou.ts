// AB7 · The words of Today's "done for you" line (docs/ASSISTANT_BAR_PLAN.md): what Zorka did today, from the thread's
// receipts, in one sentence ("Since morning: logged breakfast, made today lighter (unwell), walk started").
import { ACTIVITY_LABEL } from "@shared/domain/activity";
import type { DayType } from "@shared/domain/dayType";
import type { StoredItem, StoredTurn } from "./types";

const DAY_PHRASE: Record<DayType, string> = {
  normal: "a usual day",
  busy: "a busy day",
  away: "an away day",
  travel: "a travel day",
  late_work: "a late-work day",
  feast: "a feast day",
  exam: "an exam day",
  sick: "lighter (unwell)",
  rest: "a rest day",
};

const MAX_PHRASES = 4;

function phrase(i: StoredItem, today: string): string | null {
  const a = i.action;
  switch (a.kind) {
    case "log_meal":
      return `logged ${i.resolved?.kind === "meal" ? i.resolved.mealType : "a meal"}`;
    case "log_water":
      return `${a.glasses} glass${a.glasses === 1 ? "" : "es"} of water`;
    case "log_workout":
      return "logged a workout";
    case "log_weight":
      return "weighed in";
    case "set_day":
      return a.date === today ? `made today ${DAY_PHRASE[a.dayType]}` : `planned ${a.date} as ${DAY_PHRASE[a.dayType]}`;
    case "set_target":
      return a.date === today ? `set today's ${a.metric === "kcal" ? "calories" : a.metric}` : `set ${a.date}'s ${a.metric === "kcal" ? "calories" : a.metric}`;
    case "start_activity":
      return `${ACTIVITY_LABEL[a.activity].toLowerCase()} started`;
    case "plan_meal":
      return `planned ${a.mealType}`;
    case "remind_me":
      return "set a reminder";
    case "delete_entry":
      return a.target === "meal" ? `deleted ${a.mealType ?? "a meal"}` : a.target === "water" ? "removed some water" : `deleted a ${a.target === "weight" ? "weigh-in" : "workout"}`;
    case "edit_meal":
    case "set_amount":
      return `changed ${a.mealType ?? "a meal"}`;
    default:
      return null;
  }
}

/** The line, or null when Zorka hasn't done anything today. Undone and skipped actions don't count. */
export function doneForYouLine(turns: readonly StoredTurn[], today: string): string | null {
  const phrases: string[] = [];
  for (const t of turns)
    for (const i of t.items) {
      if (i.state !== "done") continue;
      const p = phrase(i, today);
      if (p && phrases[phrases.length - 1] !== p) phrases.push(p);
    }
  if (!phrases.length) return null;
  const shown = phrases.slice(0, MAX_PHRASES);
  const more = phrases.length - shown.length;
  return `Since morning: ${shown.join(", ")}${more ? `, and ${more} more` : ""}.`;
}
