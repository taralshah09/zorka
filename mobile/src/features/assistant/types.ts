// AB4 · What the phone keeps about an Assistant Bar turn (docs/ASSISTANT_BAR_PLAN.md "Result sheet", "Thread"). Stored
// as JSON on the Zorka reply in the thread (coach_messages.turn), so receipts and their Undo outlive the sheet.
import type { AssistantTurnItem, AssistantTurnResult } from "@/core/api/types";
import type { Brief } from "@/features/life/briefs";
import type { Meal } from "@/features/meals/store";
import type { WeightLog } from "@/features/progress/weights";

/** How to take one action back. Plain data, so Undo still works from the thread after the app restarts. */
export type UndoToken =
  | { kind: "meal"; mealId: string }
  /** `correct` replaced a saved meal's items: put the old ones back. */
  | { kind: "meal_edit"; previous: Meal }
  | { kind: "water"; day: string; glasses: number }
  | { kind: "weight"; weight: WeightLog }
  | { kind: "workout"; workoutId: string }
  /** Sets added to a workout that was already open. */
  | { kind: "sets"; workoutId: string; setIds: string[]; exerciseIds: string[] }
  | { kind: "brief"; date: string; previous: Brief | null }
  | { kind: "planned"; date: string; id: string }
  | { kind: "reminder"; id: string }
  /** delete_entry: put back what was deleted. */
  | { kind: "meal_restore"; meal: Meal }
  | { kind: "water_add"; day: string; glasses: number }
  | { kind: "weight_restore"; weight: WeightLog }
  | { kind: "workout_restore"; workoutId: string };

/**
 * done: it ran (Undo available) · pending: waits for OK · asking: waits for a choice · answered: a question answered ·
 * refused: out of scope, or blocked by the phone's own checks · undone · failed: couldn't run (with a reason) ·
 * dismissed: the user said no.
 */
export type ItemState = "done" | "pending" | "asking" | "answered" | "refused" | "undone" | "failed" | "dismissed";

export type StoredItem = AssistantTurnItem & {
  state: ItemState;
  /** What the receipt row says now ("Logged poha, 1 full plate (324 kcal)"). */
  receipt: string;
  undo: UndoToken | null;
  /** The meal a log_meal saved, for the chips (AB6) and `correct`. */
  mealId?: string;
  /** delete_entry / edit_meal: the saved record the phone found and named before OK, so OK changes exactly that one. */
  targetId?: string;
  note?: string;
};

export type StoredTurn = {
  v: 1;
  /** The local date the turn ran on: Undo from the thread works for the same day only. */
  date: string;
  at: string;
  heard: AssistantTurnResult["heard"];
  kind: AssistantTurnResult["kind"];
  items: StoredItem[];
  reply: string;
  replyKind: AssistantTurnResult["replyKind"] | "offline";
};
