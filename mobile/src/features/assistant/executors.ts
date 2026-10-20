// AB3 · The Assistant Bar's executors (docs/ASSISTANT_BAR_PLAN.md "Action catalogue", D91–D96): one per action, each
// writing through the app's existing stores (local-first, synced as usual) and returning a receipt and how to undo it.
// Before anything runs, the phone checks every action again with the shared rules (checkPhoneTurn): the server can be
// wrong or tampered with and the phone still won't write outside the bounds (D96).
import { randomUUID } from "expo-crypto";
import type { Href } from "expo-router";

import type { AskPatch, AssistantParsedItem, AssistantTurnItem, AssistantTurnResult } from "@/core/api/types";
import type { IconName } from "@/core/icons/Icon";
import { reactMascot } from "@/core/ui/mascot/bus";
import { stopRecorder } from "@/features/activity/recorder";
import { activeActivity } from "@/features/activity/store";
import { getFood, nutritionOf } from "@/features/food/catalog";
import { getExercise } from "@/features/gym/catalog";
import {
  deleteWorkout,
  getWorkout,
  removeExercise,
  removeSet,
  restoreWorkout,
  startWorkout,
  workoutsBetween,
} from "@/features/gym/store";
import { deleteRoutine, getRoutine, saveRoutine, type RoutineExercise } from "@/features/gym/routines";
import { applyVoiceSets } from "@/features/gym/voice";
import { easeFor } from "@/features/gap/eases";
import { briefFor, deleteBrief, saveBrief } from "@/features/life/briefs";
import { rememberAlias } from "@/features/life/memory";
import { standingFrom } from "@/features/life/standing";
import { deleteMeal, getMeal, lastPortions, mealsForDay, mealTotals, saveMeal, type Meal, type MealItem } from "@/features/meals/store";
import { effectiveTargets, listCheckins } from "@/features/progress/checkins";
import { listPhases } from "@/features/progress/phases";
import { deleteWeight, listWeights, logWeight, restoreWeight } from "@/features/progress/weights";
import { targetsFromProfile } from "@/features/targets/targetInput";
import { easedTargets } from "@/features/targets/targets";
import { readCachedProfile } from "@/features/users/api";
import { glassesOn, logGlass, undoGlass } from "@/features/water/store";
import {
  ASSISTANT_SCREENS,
  deviatesFromUsual,
  factsForDayType,
  planTurn,
  ROUTINE_MAX_SETS,
  stricterTier,
  tierFor,
  type AssistantAction,
  type AssistantScreen,
  type TargetMetric,
  type Tier,
  type TurnContext,
} from "@shared/domain/assistant";
import { ACTIVITY_LABEL } from "@shared/domain/activity";
import { classifyDay } from "@shared/domain/dayType";
import { validateDayFacts } from "@shared/domain/life";
import { chosenLimits, defaultCapacity, eventAllowance } from "@shared/domain/week";
import { addDays } from "@shared/domain/progress";
import { localDate, portion, UNIT_LABEL, type FoodUnit, type MealType } from "@shared/domain/food";
import { matchScore, MIN_MATCH_SCORE, normalize } from "@shared/domain/foodMatch";
import { cleanMusclewikiUrl } from "@shared/domain/gym";
import { clockText } from "@shared/domain/memory";
import { SLOT_MINUTE } from "@shared/domain/planDay";
import { goTo } from "./navigate";
import { plannedMeals, planMeal, removePlannedMeal, restorePlannedMeal } from "./plannedMeals";
import { cancelReminder, scheduleReminder, upcomingReminders } from "./reminders";
import { requestReplan } from "./replan";
import type { ItemState, StoredItem, StoredTurn, UndoToken } from "./types";

/** UX N1 · The phone decides every route; an action only names a screen (Guardrails 4). */
export const SCREEN_HREF: Record<AssistantScreen, Href> = {
  gap: "/gap",
  move: "/gap?tab=move",
  quick_log: "/quick-log",
  log_weight: "/log-weight",
  progress: "/(tabs)/progress",
  checkin: "/progress/checkin",
  steps: "/activity/steps",
  record_walk: { pathname: "/activity/record", params: { kind: "walk" } },
  day: "/day",
  share_day: "/share?card=day",
  plan_tomorrow: "/plan/tomorrow",
  menu_scan: "/menu/scan",
};

export const SCREEN_ICON: Record<AssistantScreen, IconName> = {
  gap: "restaurant",
  move: "directions_walk",
  quick_log: "add",
  log_weight: "monitor_weight",
  progress: "show_chart",
  checkin: "calendar_month",
  steps: "footprint",
  record_walk: "directions_walk",
  day: "bar_chart",
  share_day: "ios_share",
  plan_tomorrow: "calendar_month",
  menu_scan: "menu_book",
};

const KIND_ICON: Record<AssistantAction["kind"], IconName> = {
  log_meal: "restaurant",
  log_water: "water_drop",
  log_workout: "fitness_center",
  start_activity: "directions_walk",
  stop_activity: "stop",
  log_weight: "monitor_weight",
  set_day: "calendar_month",
  set_target: "calendar_month",
  plan_meal: "restaurant",
  remind_me: "notifications",
  ask: "auto_awesome",
  exercise_ref: "fitness_center",
  create_routine: "fitness_center",
  correct: "edit",
  undo: "undo",
  delete_entry: "delete",
  edit_meal: "edit",
  set_amount: "edit",
  open: "chevron_right",
  clarify: "info",
  out_of_scope: "close",
};

export const actionIcon = (a: AssistantAction): IconName => (a.kind === "open" ? SCREEN_ICON[a.screen] : KIND_ICON[a.kind]);

export const isScreen = (s: string): s is AssistantScreen => (ASSISTANT_SCREENS as readonly string[]).includes(s);

const MEAL_WORD: Record<MealType, string> = { breakfast: "breakfast", lunch: "lunch", snack: "snack", dinner: "dinner" };
const r = Math.round;

// ── The phone's own check (D96) ──────────────────────────────────────────────────────────────────

/** The usual portion of each food this user logs, for "you always have 2 rotis" (AB6 pattern fit). */
type Usual = ReadonlyMap<string, { quantity: number; unit: string }>;

/**
 * Re-checks the server's turn with the shared rules and this phone's facts, and gives each item its starting state.
 * An action the phone's check rejects is refused here, whatever the server said; a tier only ever moves up.
 */
export function checkPhoneTurn(result: AssistantTurnResult, ctx: TurnContext, usual: Usual, userId?: string): StoredItem[] {
  const planned = planTurn(
    result.items.map((i) => i.action),
    ctx,
  );
  const allowed = planned.items.map((p) => JSON.stringify(p.action));
  return result.items.map((item, i): StoredItem => {
    const at = allowed.indexOf(JSON.stringify(item.action));
    if (at < 0) {
      const reason = planned.dropped.find((d) => d.action === result.items[i]!.action)?.reason;
      return { ...item, state: "refused", receipt: "I can't do that one.", undo: null, note: reason ?? "outside the app's limits" };
    }
    allowed[at] = ""; // each planned action matches one item
    let tier: Tier = stricterTier(item.tier, planned.items[at]!.tier);
    if (item.resolved?.kind === "meal" && item.action.kind === "log_meal") {
      const odd = item.resolved.items.some((p) => {
        const u = p.food ? usual.get(p.food.id) : undefined;
        return !!u && u.unit === p.unit && deviatesFromUsual(p.quantity, u.quantity);
      });
      if (odd) tier = stricterTier(tier, "approve");
    }
    const state: ItemState = tier === "ask" ? "asking" : tier === "answer" ? "answered" : tier === "refuse" ? "refused" : "pending";
    const checked: StoredItem = { ...item, tier, state, receipt: item.line, undo: null };
    // Only musclewiki.com pages are ever opened from a turn (D38), whatever the server sent.
    if (checked.resolved?.kind === "exercises")
      checked.resolved = {
        ...checked.resolved,
        matches: checked.resolved.matches.slice(0, 3).map((m) => ({ ...m, url: m.url ? cleanMusclewikiUrl(m.url) : null })),
      };
    if (userId && (item.action.kind === "delete_entry" || item.action.kind === "edit_meal" || item.action.kind === "set_amount"))
      return withTarget(checked, userId, ctx.today);
    // D99: a number outside what the planner allows for that day is refused now, with the range, not after OK.
    if (userId && item.action.kind === "set_target" && checked.state === "pending") {
      const off = targetOutOfRange(userId, item.action);
      if (off) return { ...checked, state: "refused", receipt: off, note: undefined };
    }
    return checked;
  });
}

// ── Saved records a delete or an edit points at ─────────────────────────────────────────────────

const MEAL_TITLE: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const dayWord = (date: string, today: string) => (date === today ? "today" : "yesterday");
const mealText = (m: Meal) => `${m.items.map((i) => i.name.toLowerCase()).join(", ")} (${r(mealTotals(m).kcal)} kcal)`;

/** The meal a delete or an edit means: that type on that day, else the day's latest. */
function targetMeal(userId: string, date: string, mealType: MealType | undefined): Meal | null {
  const meals = mealsForDay(userId, date).filter((m) => !mealType || m.mealType === mealType);
  return meals[meals.length - 1] ?? null;
}

/** The saved items a "remove the rice" means. */
const matching = (items: readonly MealItem[], words: string) =>
  items.filter((i) => normalize(i.name).includes(normalize(words)) || matchScore(words, { name: i.name, aliases: [] }) >= MIN_MATCH_SCORE);

/**
 * A saved meal's items after an edit_meal replace. With `from`, only the foods it names make way and the new ones take
 * their place, the rest stays ("dal, not rajma"; "2 rotis, not 3" is from "roti"). Without it the new foods are the
 * whole meal ("it was 2 idli"). null: `from` names nothing in the meal.
 */
export function mergedItems(saved: readonly MealItem[], next: readonly MealItem[], from?: string): MealItem[] | null {
  if (!from) return [...next];
  const gone = new Set(matching(saved, from).map((i) => i.id));
  if (!gone.size) return null;
  const at = saved.findIndex((i) => gone.has(i.id));
  const kept = saved.filter((i) => !gone.has(i.id));
  return [...kept.slice(0, at), ...next, ...kept.slice(at)];
}

/** A saved food at a new amount: the food's own portion maths, else (same unit, food not on this phone) scaled. */
function resized(userId: string, saved: MealItem, quantity: number, unit: FoodUnit): MealItem | null {
  const food = getFood(userId, saved.foodId);
  if (food) {
    const { grams, macros } = portion(nutritionOf(food), quantity, unit);
    return { ...saved, quantity, unit, grams, ...macros };
  }
  if (unit !== saved.unit || saved.quantity <= 0) return null;
  const k = quantity / saved.quantity;
  return { ...saved, quantity, grams: saved.grams * k, kcal: saved.kcal * k, proteinG: saved.proteinG * k, carbsG: saved.carbsG * k, fatG: saved.fatG * k };
}

/** A saved meal's items after an edit_meal add or replace, or why it can't be done. */
function editedItems(meal: Meal, a: Extract<AssistantAction, { kind: "edit_meal" }>, item: StoredItem): MealItem[] | string {
  const name = MEAL_TITLE[meal.mealType].toLowerCase();
  const added = item.resolved?.kind === "meal" ? item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x) : [];
  if (!added.length) return `I couldn't find "${a.span}".`;
  if (a.mode === "add") return [...meal.items, ...added];
  return mergedItems(meal.items, added, a.from) ?? `Your ${name} doesn't have ${a.from}.`;
}

/**
 * A saved meal's items after a set_amount: the food it names (else the meal's only food) at the new amount, or why it
 * can't be done. `more` adds to what's there when the unit is the same.
 */
function amountedItems(userId: string, meal: Meal, a: Extract<AssistantAction, { kind: "set_amount" }>): MealItem[] | string {
  const name = MEAL_TITLE[meal.mealType].toLowerCase();
  const pick = a.food ? matching(meal.items, a.food) : meal.items.length === 1 ? meal.items : [];
  if (!pick.length) return a.food ? `Your ${name} doesn't have ${a.food}: ${mealText(meal)}.` : `Which food in ${name}? Say it with the food, like "2 katori poha".`;
  if (pick.length > 1) return `Which one: ${pick.map((i) => i.name.toLowerCase()).join(" or ")}?`;
  const saved = pick[0]!;
  const unit = a.unit ?? saved.unit;
  const quantity = a.more && unit === saved.unit ? saved.quantity + a.quantity : a.quantity;
  const next = resized(userId, saved, quantity, unit);
  if (!next) return `I can't measure ${saved.name.toLowerCase()} in ${UNIT_LABEL[unit].many}. Try ${UNIT_LABEL[saved.unit].many}.`;
  return meal.items.map((i) => (i.id === saved.id ? next : i));
}

const itemsText = (items: readonly MealItem[]) =>
  `${items.map((i) => `${i.name.toLowerCase()}, ${qty(i.quantity)} ${UNIT_LABEL[i.unit][i.quantity === 1 ? "one" : "many"]}`).join("; ")} (${r(items.reduce((s, i) => s + i.kcal, 0))} kcal)`;

/** The planned meal a "drop the dinner plan" means: that type, else the soonest, from `date` on (or that day only). */
function targetPlanned(userId: string, today: string, date: string | undefined, mealType: MealType | undefined) {
  const days = date ? [date] : [today, addDays(today, 1)];
  for (const d of days) {
    const found = plannedMeals(userId, d)
      .filter((p) => !mealType || p.mealType === mealType)
      .sort((a, b) => SLOT_MINUTE[a.mealType] - SLOT_MINUTE[b.mealType])[0];
    if (found) return { date: d, meal: found };
  }
  return null;
}

/** The reminder a "cancel my reminder" means: one whose words match, else the next one (on `date`, when said). */
function targetReminder(userId: string, date: string | undefined, words: string | undefined) {
  const list = upcomingReminders(userId).filter((x) => !date || x.date === date);
  if (!words) return list[0] ?? null;
  const w = normalize(words);
  return list.find((x) => normalize(x.what).includes(w) || matchScore(words, { name: x.what, aliases: [] }) >= MIN_MATCH_SCORE) ?? null;
}

/**
 * Finds the saved record now, names it in the receipt ("Delete lunch: poha (324 kcal)?") and keeps its id, so OK
 * changes exactly what the user saw. Nothing there → the row fails with a plain reason instead of guessing.
 */
function withTarget(item: StoredItem, userId: string, today: string): StoredItem {
  const a = item.action;
  if (item.state === "refused") return item;
  if (a.kind === "delete_entry" && a.target === "reminder") {
    const rem = targetReminder(userId, a.date, a.span);
    if (!rem) return failed(item, a.span ? `I can't find a reminder about "${a.span}".` : "You don't have any reminders set.");
    const day = rem.date === today ? "today" : rem.date === addDays(today, 1) ? "tomorrow" : rem.date;
    return { ...item, targetId: rem.id, receipt: `Cancel "${rem.what}" at ${clockText(rem.minute)} ${day}?` };
  }
  if (a.kind === "delete_entry" && a.target === "planned_meal") {
    const found = targetPlanned(userId, today, a.date, a.mealType);
    if (!found) return failed(item, `There's no ${a.mealType ? `${a.mealType} ` : ""}plan to drop.`);
    const day = found.date === today ? "today" : found.date === addDays(today, 1) ? "tomorrow" : found.date;
    return { ...item, targetId: found.meal.id, receipt: `Drop ${found.meal.text} from ${MEAL_TITLE[found.meal.mealType].toLowerCase()} ${day}?` };
  }
  if (a.kind === "delete_entry") {
    const date = a.date ?? today;
    const when = dayWord(date, today);
    if (a.target === "meal") {
      const meal = targetMeal(userId, date, a.mealType);
      if (!meal) return failed(item, `There's no ${a.mealType ?? "meal"} logged ${when}.`);
      return { ...item, targetId: meal.id, receipt: `Delete ${MEAL_TITLE[meal.mealType].toLowerCase()} from ${when}: ${mealText(meal)}?` };
    }
    if (a.target === "water") {
      const have = glassesOn(userId, date);
      if (!have) return failed(item, `There's no water logged ${when}.`);
      const n = Math.min(a.glasses ?? 1, have);
      return { ...item, receipt: `Remove ${n} glass${n === 1 ? "" : "es"} of water from ${when} (${have} logged)?` };
    }
    if (a.target === "weight") {
      const w = listWeights(userId).filter((x) => x.localDate === date).pop();
      if (!w) return failed(item, `There's no weigh-in ${when}.`);
      return { ...item, targetId: w.id, receipt: `Delete ${when}'s weigh-in (${w.kg} kg)?` };
    }
    const workout = workoutsBetween(userId, date, date).pop();
    if (!workout) return failed(item, `There's no workout logged ${when}.`);
    return { ...item, targetId: workout.id, receipt: `Delete ${workout.name} from ${when}?` };
  }
  if (a.kind === "edit_meal") {
    const date = a.date ?? today;
    const when = dayWord(date, today);
    const meal = targetMeal(userId, date, a.mealType);
    if (!meal) {
      // "Add poha to breakfast" with no breakfast yet: it's logged as that meal instead (no targetId → a new meal).
      const words = a.mode === "add" && item.resolved?.kind === "meal" ? mealWords(item.resolved.items) : "";
      if (!words || item.resolved?.kind !== "meal") return failed(item, `There's no ${a.mealType ?? "meal"} logged ${when} to change.`);
      const mealType = a.mealType ?? item.resolved.mealType;
      return { ...item, receipt: `No ${mealType} logged ${when} yet. Log ${words} as ${mealType}?` };
    }
    const name = MEAL_TITLE[meal.mealType].toLowerCase();
    if (a.mode === "remove") {
      const gone = matching(meal.items, a.span);
      if (!gone.length) return failed(item, `Your ${name} doesn't have ${a.span}: ${mealText(meal)}.`);
      return { ...item, targetId: meal.id, receipt: `Take ${gone.map((i) => i.name.toLowerCase()).join(", ")} out of ${name} (${when})?` };
    }
    const next = editedItems(meal, a, item);
    if (typeof next === "string") return failed(item, next);
    const words = item.resolved?.kind === "meal" ? mealWords(item.resolved.items) : "";
    if (a.mode === "add") return { ...item, targetId: meal.id, receipt: `Add ${words} to ${name} (${when})?` };
    return { ...item, targetId: meal.id, receipt: `Change ${name} (${when}) from ${mealText(meal)} to ${itemsText(next)}?` };
  }
  if (a.kind === "set_amount") {
    const date = a.date ?? today;
    const when = dayWord(date, today);
    const meal = targetMeal(userId, date, a.mealType);
    if (!meal) return failed(item, `There's no ${a.mealType ?? "meal"} logged ${when} to change.`);
    const next = amountedItems(userId, meal, a);
    if (typeof next === "string") return failed(item, next);
    return { ...item, targetId: meal.id, receipt: `Change ${MEAL_TITLE[meal.mealType].toLowerCase()} (${when}) from ${mealText(meal)} to ${itemsText(next)}?` };
  }
  return item;
}

/** What's saved today and yesterday, for the router (turn.logged): which meal "delete my lunch" means. */
export function loggedForServer(userId: string, today: string, yesterday: string) {
  type Logged = { date: string; kind: "meal" | "water" | "weight" | "workout" | "reminder" | "planned_meal"; mealType?: MealType; text: string };
  const out: Logged[] = [];
  for (const date of [today, yesterday]) {
    for (const m of mealsForDay(userId, date)) out.push({ date, kind: "meal", mealType: m.mealType, text: m.items.map((i) => i.name).join(", ").slice(0, 160) });
    const glasses = glassesOn(userId, date);
    if (glasses) out.push({ date, kind: "water", text: `${glasses} glasses` });
    const w = listWeights(userId).filter((x) => x.localDate === date).pop();
    if (w) out.push({ date, kind: "weight", text: `${w.kg} kg` });
    for (const wk of workoutsBetween(userId, date, date)) out.push({ date, kind: "workout", text: wk.name.slice(0, 160) });
  }
  // What's ahead, so "cancel my reminder" and "drop the dinner plan" name the right one.
  const ahead: Logged[] = [];
  for (const date of [today, addDays(today, 1)])
    for (const p of plannedMeals(userId, date)) ahead.push({ date, kind: "planned_meal", mealType: p.mealType, text: p.text.slice(0, 160) });
  for (const x of upcomingReminders(userId).slice(0, 4)) ahead.push({ date: x.date, kind: "reminder", text: `${clockText(x.minute)} ${x.what}`.slice(0, 160) });
  return [...out.slice(-(24 - ahead.length)), ...ahead];
}

export const usualPortions = (userId: string): Usual => lastPortions(userId);

// ── Answers to Ask chips ─────────────────────────────────────────────────────────────────────────

/** Applies the user's pick to an "ask" item (which meal, how much) and re-tiers it. */
export function applyPatch(item: StoredItem, patch: AskPatch, ctx: TurnContext): StoredItem {
  if (item.resolved?.kind !== "meal") return item;
  let action = item.action;
  let items = item.resolved.items;
  let mealType = item.resolved.mealType;
  if ("mealType" in patch) {
    mealType = patch.mealType;
    if (action.kind === "log_meal") action = { ...action, mealType };
  } else {
    items = items.map((p, i) => (i === patch.itemIndex && p.food ? reportion(p, patch.quantity, patch.unit) : p));
  }
  const next: StoredItem = { ...item, action, resolved: { ...item.resolved, items, mealType }, ask: null };
  // The user picked the missing detail themselves: the rest of the policy still applies.
  const tier = tierFor(action, ctx);
  return { ...next, tier, state: "pending", receipt: mealLine(next, tier === "do" ? "will" : "check") };
}

/** A parsed item at another amount, with grams and macros worked out again on the phone. */
function reportion(p: AssistantParsedItem, quantity: number, unit: AssistantParsedItem["unit"]): AssistantParsedItem {
  if (!p.food) return { ...p, quantity, unit };
  const { grams, macros } = portion(nutritionOf(p.food), quantity, unit);
  return { ...p, quantity, unit, grams, macros, reasons: p.reasons.filter((x) => x !== "vague_quantity"), uncertain: false };
}

// ── Receipt words ────────────────────────────────────────────────────────────────────────────────

const qty = (q: number) => (Number.isInteger(q) ? String(q) : (Math.round(q * 10) / 10).toString());

function mealWords(items: readonly AssistantParsedItem[]): string {
  return items
    .filter((p) => p.food)
    .map((p) => `${p.food!.name.toLowerCase()}, ${qty(p.quantity)} ${UNIT_LABEL[p.unit][p.quantity === 1 ? "one" : "many"]}`)
    .join("; ");
}

function mealLine(item: AssistantTurnItem, mode: "done" | "will" | "check"): string {
  if (item.resolved?.kind !== "meal") return item.line;
  const kcal = r(item.resolved.items.reduce((s, p) => s + (p.food ? p.macros.kcal : 0), 0));
  const words = mealWords(item.resolved.items);
  const when = MEAL_WORD[item.resolved.mealType];
  if (mode === "done") return `Logged ${words} for ${when} (${kcal} kcal).`;
  if (mode === "will") return `Ready to log ${words} for ${when} (${kcal} kcal).`;
  return `Check before I log ${words} for ${when} (${kcal} kcal).`;
}

// ── Running an action ────────────────────────────────────────────────────────────────────────────

export type RunContext = {
  userId: string;
  today: string;
  /** What was heard, for a day's brief text. */
  heard: string;
  source: "voice" | "text";
  /** The thread's previous turn, for `correct` and `undo` (and a way to save it). */
  previous: { turn: StoredTurn; save: (t: StoredTurn) => void } | null;
};

const done = (item: StoredItem, receipt: string, undo: UndoToken | null, extra: Partial<StoredItem> = {}): StoredItem => ({
  ...item,
  ...extra,
  state: "done",
  receipt,
  undo,
});
const failed = (item: StoredItem, note: string): StoredItem => ({ ...item, state: "failed", receipt: note, note });

/** A saved meal's item from a parsed one (the server's food, the phone's portion maths). */
function mealItemFrom(p: AssistantParsedItem): MealItem | null {
  if (!p.food) return null;
  const { grams, macros } = portion(nutritionOf(p.food), p.quantity, p.unit);
  return {
    id: randomUUID(),
    foodId: p.food.id,
    name: p.food.name,
    quantity: p.quantity,
    unit: p.unit,
    grams,
    kcal: macros.kcal,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    diet: p.food.diet,
    category: p.food.category,
  };
}

/** When a meal for another day is stamped: that day at the slot's usual time. Today: now. */
function loggedAtFor(date: string | undefined, today: string, mealType: MealType): Date {
  if (!date || date === today) return new Date();
  const [y, m, d] = date.split("-").map(Number);
  const minute = SLOT_MINUTE[mealType];
  return new Date(y!, m! - 1, d!, Math.floor(minute / 60), minute % 60);
}

/** Saves a new meal of `mealType` on `date` (today when absent); its id. */
function saveNewMeal(ctx: RunContext, mealType: MealType, date: string | undefined, items: MealItem[]): string {
  const id = randomUUID();
  saveMeal({
    id,
    userId: ctx.userId,
    mealType,
    loggedAt: loggedAtFor(date, ctx.today, mealType).toISOString(),
    localDate: date ?? ctx.today,
    source: ctx.source,
    oilLevel: null,
    photoUri: null,
    items,
  });
  reactMascot("happy");
  return id;
}

function logMeal(item: StoredItem, ctx: RunContext): StoredItem {
  if (item.resolved?.kind !== "meal" || item.action.kind !== "log_meal") return failed(item, "Nothing to log.");
  const items = item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x);
  if (!items.length) return failed(item, `I couldn't find "${item.resolved.items.map((p) => p.query).join(", ")}". Tap Change to search.`);
  const id = saveNewMeal(ctx, item.resolved.mealType, item.action.date, items);
  const missing = item.resolved.items.filter((p) => !p.food).map((p) => `"${p.query}"`);
  return done(item, mealLine(item, "done"), { kind: "meal", mealId: id }, {
    mealId: id,
    note: missing.length ? `Couldn't find ${missing.join(", ")}.` : undefined,
  });
}

function logWorkout(item: StoredItem, ctx: RunContext): StoredItem {
  if (item.resolved?.kind !== "workout") return failed(item, "Nothing to log.");
  if (item.resolved.usual) {
    goTo("/train/prepare");
    return done(item, "Opened your usual session.", null);
  }
  // Approved (or sure) sets are logged as done; the user has seen them.
  const sets = item.resolved.sets.map((s) => ({ ...s, uncertain: false }));
  const lookup = (id: string) => getExercise(ctx.userId, id);
  // One workout per day: the sets join the workout of the day they were done ("yesterday"), whenever that is.
  const date = item.action.kind === "log_workout" ? item.action.date : undefined;
  const day = startWorkout(ctx.userId, { at: date && date !== ctx.today ? noonOf(date) : new Date() });
  const before = new Map(day.exercises.flatMap((e) => e.sets.map((s) => [s.id, s.done] as const)));
  const exercisesBefore = new Set(day.exercises.map((e) => e.id));
  const { added, unmatched } = applyVoiceSets(ctx.userId, day.id, sets, lookup);
  if (!added.length) {
    const left = getWorkout(day.id);
    if (left && !left.exercises.length) deleteWorkout(left);
    return failed(item, `I couldn't match ${unmatched.join(", ") || "those sets"}.`);
  }
  const after = getWorkout(day.id)!;
  // Undo takes back exactly what this turn ticked: new rows, and empty rows it filled in.
  const exerciseIds = after.exercises.filter((e) => !exercisesBefore.has(e.id)).map((e) => e.id);
  const setIds = after.exercises.flatMap((e) => e.sets.filter((s) => s.done && before.get(s.id) !== true).map((s) => s.id));
  reactMascot("happy");
  return done(item, `Added ${added.map((a) => a.exerciseName).join(", ")} to ${date && date !== ctx.today ? `${dayWord(date, ctx.today)}'s` : "today's"} workout.`, {
    kind: "sets",
    workoutId: day.id,
    setIds,
    exerciseIds,
  });
}

/**
 * create_routine on OK: saved like one built in the routine editor (synced, on the Train tab). Each exercise is this
 * phone's own copy when it has one (a custom exercise's latest name and type), else the server's match.
 */
function createRoutine(item: StoredItem, ctx: RunContext): StoredItem {
  const a = item.action;
  if (a.kind !== "create_routine" || item.resolved?.kind !== "routine" || !item.resolved.exercises.length)
    return failed(item, "There were no exercises to save.");
  const exercises: RoutineExercise[] = item.resolved.exercises.map(({ exercise, targetSets, targetReps }) => {
    const e = getExercise(ctx.userId, exercise.id) ?? exercise;
    const counted = e.type === "weight_reps" || e.type === "reps";
    return {
      id: randomUUID(),
      exerciseId: e.id,
      name: e.name,
      type: e.type,
      category: e.category,
      targetSets: Math.max(1, Math.min(ROUTINE_MAX_SETS, Math.round(targetSets))),
      targetReps: counted && targetReps !== null ? Math.max(1, Math.round(targetReps)) : null,
    };
  });
  const saved = saveRoutine(ctx.userId, { name: a.name, exercises });
  reactMascot("happy");
  return done(item, `Saved "${saved.name}" with ${exercises.length} exercise${exercises.length === 1 ? "" : "s"}. It's on the Train tab.`, {
    kind: "routine",
    routineId: saved.id,
  });
}

/** Noon of a local date: safely inside that day whatever the time zone. */
function noonOf(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0);
}

function setDay(item: StoredItem, ctx: RunContext): StoredItem {
  const a = item.action;
  if (a.kind !== "set_day") return item;
  const previous = briefFor(ctx.userId, a.date);
  // Keep what the user already told Zorka about that day; only the day type changes (D91).
  const facts = previous
    ? factsForDayType(a.dayType, previous.facts)
    : item.resolved?.kind === "day"
      ? item.resolved.facts
      : factsForDayType(a.dayType);
  saveBrief(ctx.userId, a.date, a.note ?? ctx.heard, facts, "confirmed");
  requestReplan(ctx.userId);
  const day = a.date === ctx.today ? "today" : a.date;
  return done(item, `Re-planned ${day} as ${a.dayType.replace("_", " ")} day.`, { kind: "brief", date: a.date, previous });
}

// ── set_target (D99): one day's number, the rest of the week moves around it ───────────────────

const TARGET_KEY = { protein: "proteinG", kcal: "kcal", steps: "steps" } as const satisfies Record<TargetMetric, string>;
const TARGET_WORD: Record<TargetMetric, string> = { protein: "protein", kcal: "calories", steps: "steps" };
const TARGET_UNIT: Record<TargetMetric, string> = { protein: " g", kcal: " kcal", steps: "" };
const targetText = (metric: TargetMetric, n: number) => `${n.toLocaleString("en-IN")}${TARGET_UNIT[metric]}`;
const dayName = (date: string, today: string) => (date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : date);

/**
 * The range the planner allows for that day's number (week.ts `chosenLimits`, the same as Plan a day's own numbers),
 * from the same base targets the planner reads (useTargets). null: no profile on this phone yet.
 */
function targetRange(userId: string, date: string, metric: TargetMetric): [number, number] | null | "no_goal" {
  const profile = readCachedProfile(userId);
  if (!profile) return null;
  const plan = targetsFromProfile(profile);
  if (!plan) return null;
  const today = localDate(new Date());
  const effective = effectiveTargets(plan, profile, listPhases(userId), listCheckins(userId), today).targets;
  const base = easedTargets(effective, easeFor(userId, today), profile.weightKg ?? 0);
  const brief = briefFor(userId, date);
  const dayType = brief ? classifyDay(brief.facts, standingFrom(profile)) : "normal";
  const limits = chosenLimits(
    {
      date,
      baseKcal: base.kcal,
      baseProteinG: base.proteinG,
      baseSteps: base.steps,
      dayType,
      capacity: defaultCapacity(dayType, base.proteinG),
      actual: null,
      ...(dayType === "feast" ? { allowanceKcal: eventAllowance(base.kcal) } : {}),
      maintenanceKcal: Math.round(base.tdee),
    },
    base.floorKcal,
    profile.goal,
  );
  if (metric === "steps") return limits.steps ?? "no_goal";
  return metric === "kcal" ? limits.kcal : limits.protein;
}

/** Why this number can't be that day's target (with the range it can take), or null when it can. */
function targetOutOfRange(userId: string, a: Extract<AssistantAction, { kind: "set_target" }>): string | null {
  const range = targetRange(userId, a.date, a.metric);
  if (!range) return "Finish setting up your plan in Zorka first.";
  const day = dayName(a.date, localDate(new Date()));
  if (range === "no_goal") return `There's no step goal ${day === "today" || day === "tomorrow" ? day : `on ${day}`}, so there's nothing to set.`;
  const [lo, hi] = range;
  if (a.value >= lo && a.value <= hi) return null;
  return `I can't set ${day}'s ${TARGET_WORD[a.metric]} to ${targetText(a.metric, a.value)}. It can go from ${targetText(a.metric, lo)} to ${targetText(a.metric, hi)}.`;
}

function setTarget(item: StoredItem, ctx: RunContext): StoredItem {
  const a = item.action;
  if (a.kind !== "set_target") return item;
  // Checked again: an earlier action of the turn may have changed the day.
  const off = targetOutOfRange(ctx.userId, a);
  if (off) return failed(item, off);
  const previous = briefFor(ctx.userId, a.date);
  // Keep what the user already told Zorka about the day and any other number they picked; only this one changes.
  const facts = previous?.facts ?? factsForDayType("normal");
  const next = validateDayFacts({ ...facts, targets: { ...facts.targets, [TARGET_KEY[a.metric]]: a.value } });
  saveBrief(ctx.userId, a.date, previous?.rawText ?? ctx.heard, next, "confirmed");
  requestReplan(ctx.userId);
  const day = dayName(a.date, ctx.today);
  return done(
    item,
    `Set ${day}'s ${TARGET_WORD[a.metric]} to ${targetText(a.metric, a.value)}. The days left this week pick up the difference.`,
    { kind: "brief", date: a.date, previous },
  );
}

async function correct(item: StoredItem, ctx: RunContext): Promise<StoredItem> {
  const a = item.action;
  if (a.kind !== "correct" || !ctx.previous) return failed(item, "There's nothing to correct.");
  const prevTurn = ctx.previous.turn;
  const target = prevTurn.items[a.index];
  if (!target) return failed(item, "There's nothing to correct.");
  if (item.resolved?.kind === "meal" && target.mealId) {
    const meal = getMeal(target.mealId);
    const items = item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x);
    if (!meal || !items.length) return failed(item, `I couldn't find "${a.span}".`);
    // The router restates the whole entry with the fix in it ("2 roti and dal"), so it's the meal as a whole.
    saveMeal({ ...meal, items });
    // D97: "dahl" → Dal tadka is remembered for next time.
    const before = target.action.kind === "log_meal" ? target.action.span : null;
    const food = item.resolved.items.find((p) => p.food)?.food;
    if (before && food && item.resolved.items.length === 1 && normalize(before) !== normalize(food.name))
      rememberAlias(ctx.userId, { heard: before, means: food.name, target: "food", id: food.id });
    const words = mealWords(item.resolved.items);
    ctx.previous.save({ ...prevTurn, items: prevTurn.items.map((it, i) => (i === a.index ? { ...it, receipt: `Changed to ${words}.` } : it)) });
    return done(item, `Changed it to ${words}.`, { kind: "meal_edit", previous: meal });
  }
  if (item.resolved?.kind === "workout" && target.undo) {
    await undoToken(ctx.userId, target.undo);
    const redone = logWorkout({ ...item, action: { kind: "log_workout", span: a.span, confidence: "high" } }, ctx);
    ctx.previous.save({ ...prevTurn, items: prevTurn.items.map((it, i) => (i === a.index ? { ...it, state: "undone", undo: null } : it)) });
    return redone;
  }
  return failed(item, "I can only correct a meal or a workout. Say it again instead.");
}

async function undoPrevious(item: StoredItem, ctx: RunContext): Promise<StoredItem> {
  if (!ctx.previous) return failed(item, "There's nothing to undo.");
  const prevTurn = ctx.previous.turn;
  if (prevTurn.date !== ctx.today) return failed(item, "Only today's actions can be undone.");
  const undone: string[] = [];
  const items = [...prevTurn.items];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.state !== "done" || !it.undo) continue;
    await undoToken(ctx.userId, it.undo);
    items[i] = { ...it, state: "undone", undo: null };
    undone.unshift(it.receipt.replace(/\.$/, ""));
  }
  if (!undone.length) return failed(item, "There's nothing left to undo.");
  ctx.previous.save({ ...prevTurn, items });
  return done(item, `Undid: ${undone.join("; ")}.`, null);
}

async function deleteEntry(item: StoredItem, ctx: RunContext): Promise<StoredItem> {
  const a = item.action;
  if (a.kind !== "delete_entry") return item;
  if (a.target === "reminder") {
    const rem = upcomingReminders(ctx.userId).find((x) => x.id === item.targetId);
    if (!rem) return failed(item, "That reminder already went off or was cancelled.");
    await cancelReminder(rem.id, ctx.userId);
    return done(item, `Cancelled "${rem.what}" at ${clockText(rem.minute)}.`, { kind: "reminder_restore", reminder: rem });
  }
  if (a.target === "planned_meal") {
    const found = [ctx.today, addDays(ctx.today, 1), ...(a.date ? [a.date] : [])]
      .map((d) => ({ date: d, meal: plannedMeals(ctx.userId, d).find((p) => p.id === item.targetId) }))
      .find((x) => x.meal);
    if (!found?.meal) return failed(item, "That plan is already gone.");
    removePlannedMeal(ctx.userId, found.date, found.meal.id);
    return done(item, `Dropped ${found.meal.text} from ${MEAL_WORD[found.meal.mealType]}.`, { kind: "planned_restore", date: found.date, meal: found.meal });
  }
  const date = a.date ?? ctx.today;
  const when = dayWord(date, ctx.today);
  if (a.target === "meal") {
    const meal = item.targetId ? getMeal(item.targetId) : null;
    if (!meal) return failed(item, "That meal is already gone.");
    deleteMeal(meal);
    return done(item, `Deleted ${MEAL_TITLE[meal.mealType].toLowerCase()} from ${when}.`, { kind: "meal_restore", meal });
  }
  if (a.target === "water") {
    let removed = 0;
    for (let n = 0; n < (a.glasses ?? 1); n++) if (undoGlass(ctx.userId, date)) removed++;
    if (!removed) return failed(item, `There's no water logged ${when}.`);
    return done(item, `Removed ${removed} glass${removed === 1 ? "" : "es"} of water.`, { kind: "water_add", day: date, glasses: removed });
  }
  if (a.target === "weight") {
    const w = listWeights(ctx.userId).find((x) => x.id === item.targetId);
    if (!w) return failed(item, "That weigh-in is already gone.");
    deleteWeight(w);
    return done(item, `Deleted the ${w.kg} kg weigh-in.`, { kind: "weight_restore", weight: w });
  }
  const workout = item.targetId ? getWorkout(item.targetId) : null;
  if (!workout) return failed(item, "That workout is already gone.");
  deleteWorkout(workout);
  return done(item, `Deleted ${workout.name}.`, { kind: "workout_restore", workoutId: workout.id });
}

function editMeal(item: StoredItem, ctx: RunContext): StoredItem {
  const a = item.action;
  if (a.kind !== "edit_meal") return item;
  // "Add poha to breakfast" with no breakfast yet (withTarget found none): a new meal of that type.
  if (!item.targetId && a.mode === "add" && item.resolved?.kind === "meal") {
    const items = item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x);
    if (!items.length) return failed(item, `I couldn't find "${a.span}".`);
    const mealType = a.mealType ?? item.resolved.mealType;
    const id = saveNewMeal(ctx, mealType, a.date, items);
    return done(item, `Logged ${mealWords(item.resolved.items)} as ${mealType}.`, { kind: "meal", mealId: id }, { mealId: id });
  }
  const meal = item.targetId ? getMeal(item.targetId) : null;
  if (!meal) return failed(item, "That meal is gone.");
  const name = MEAL_TITLE[meal.mealType].toLowerCase();
  if (a.mode === "remove") {
    const gone = new Set(matching(meal.items, a.span).map((i) => i.id));
    if (!gone.size) return failed(item, `Your ${name} doesn't have ${a.span}.`);
    const left = meal.items.filter((i) => !gone.has(i.id));
    // Nothing left: the meal goes (Undo brings it back whole).
    if (!left.length) {
      deleteMeal(meal);
      return done(item, `Deleted ${name}: nothing was left in it.`, { kind: "meal_restore", meal });
    }
    saveMeal({ ...meal, items: left });
    return done(item, `Took ${a.span} out of ${name}.`, { kind: "meal_edit", previous: meal });
  }
  const items = editedItems(meal, a, item);
  if (typeof items === "string") return failed(item, items);
  saveMeal({ ...meal, items });
  const words = item.resolved?.kind === "meal" ? mealWords(item.resolved.items) : a.span;
  if (a.mode === "add") return done(item, `Added ${words} to ${name}.`, { kind: "meal_edit", previous: meal });
  return done(item, a.from ? `Swapped ${a.from} for ${words} in ${name}.` : `Changed ${name} to ${itemsText(items)}.`, { kind: "meal_edit", previous: meal });
}

function setAmount(item: StoredItem, ctx: RunContext): StoredItem {
  const a = item.action;
  if (a.kind !== "set_amount") return item;
  const meal = item.targetId ? getMeal(item.targetId) : null;
  if (!meal) return failed(item, "That meal is gone.");
  const items = amountedItems(ctx.userId, meal, a);
  if (typeof items === "string") return failed(item, items);
  saveMeal({ ...meal, items });
  return done(item, `Changed ${MEAL_TITLE[meal.mealType].toLowerCase()} to ${itemsText(items)}.`, { kind: "meal_edit", previous: meal });
}

/** Runs one action (tier do, or approved). Never throws: a failure becomes a failed receipt. */
export async function runItem(item: StoredItem, ctx: RunContext): Promise<StoredItem> {
  const a = item.action;
  try {
    switch (a.kind) {
      case "log_meal":
        return logMeal(item, ctx);
      case "plan_meal": {
        if (item.resolved?.kind !== "meal") return failed(item, "Nothing to plan.");
        const date = a.date ?? ctx.today;
        const planned = planMeal(ctx.userId, date, {
          mealType: a.mealType,
          text: mealWords(item.resolved.items) || a.span,
          items: item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x),
        });
        return done(item, `Planned ${planned.text} for ${MEAL_WORD[a.mealType]}.`, { kind: "planned", date, id: planned.id });
      }
      case "log_water":
        for (let n = 0; n < a.glasses; n++) logGlass(ctx.userId, ctx.today);
        reactMascot("happy");
        return done(item, `Logged ${a.glasses} glass${a.glasses === 1 ? "" : "es"} of water.`, { kind: "water", day: ctx.today, glasses: a.glasses });
      case "log_workout":
        return logWorkout(item, ctx);
      case "start_activity":
        goTo({ pathname: "/activity/record", params: { kind: a.activity, autostart: "1" } });
        return done(item, `${ACTIVITY_LABEL[a.activity]} starting.`, null);
      case "stop_activity": {
        const running = activeActivity();
        if (!running || running.userId !== ctx.userId) return failed(item, "Nothing is recording.");
        await stopRecorder(running.id);
        goTo(`/activity/summary/${running.id}`);
        return done(item, `${ACTIVITY_LABEL[running.kind]} stopped.`, null);
      }
      case "log_weight": {
        const w = logWeight(ctx.userId, a.kg, a.date ?? ctx.today);
        return done(item, `Logged ${w.kg} kg.`, { kind: "weight", weight: w });
      }
      case "set_day":
        return setDay(item, ctx);
      case "set_target":
        return setTarget(item, ctx);
      case "remind_me": {
        const date = a.date ?? ctx.today;
        const set = await scheduleReminder(a.what, date, a.minute, ctx.userId);
        if ("error" in set) return failed(item, set.error);
        return done(item, `I'll remind you to ${a.what} at ${clockText(a.minute)}.`, { kind: "reminder", id: set.id });
      }
      case "correct":
        return correct(item, ctx);
      case "undo":
        return undoPrevious(item, ctx);
      case "delete_entry":
        return deleteEntry(item, ctx);
      case "edit_meal":
        return editMeal(item, ctx);
      case "set_amount":
        return setAmount(item, ctx);
      case "open":
        goTo(SCREEN_HREF[a.screen]);
        return done(item, item.line, null);
      case "ask":
      case "exercise_ref":
        return { ...item, state: "answered" };
      case "create_routine":
        return createRoutine(item, ctx);
      case "clarify":
        return { ...item, state: "asking" };
      case "out_of_scope":
        return { ...item, state: "refused" };
    }
  } catch (e) {
    return failed(item, e instanceof Error ? e.message : "Couldn't do that.");
  }
}

/** AB3 · NextAction.execute(): the Home brief's button runs the same executor as the bar (no turn, nothing to undo). */
export function executeNow(a: Extract<AssistantAction, { kind: "open" | "start_activity" }>) {
  if (a.kind === "open") goTo(SCREEN_HREF[a.screen]);
  else goTo({ pathname: "/activity/record", params: { kind: a.activity, autostart: "1" } });
}

// ── Undo ─────────────────────────────────────────────────────────────────────────────────────────

export async function undoToken(userId: string, token: UndoToken): Promise<void> {
  switch (token.kind) {
    case "meal": {
      const meal = getMeal(token.mealId);
      if (meal) deleteMeal(meal);
      return;
    }
    case "meal_edit":
      saveMeal(token.previous);
      return;
    case "water":
      for (let n = 0; n < token.glasses; n++) undoGlass(userId, token.day);
      return;
    case "weight":
      if (listWeights(userId).some((w) => w.id === token.weight.id)) deleteWeight(token.weight);
      return;
    case "workout": {
      const w = getWorkout(token.workoutId);
      if (w) deleteWorkout(w);
      return;
    }
    case "sets": {
      const w = getWorkout(token.workoutId);
      if (!w) return;
      for (const we of w.exercises)
        for (const s of we.sets) if (token.setIds.includes(s.id)) removeSet(userId, we, s.id);
      const after = getWorkout(token.workoutId);
      for (const we of after?.exercises ?? []) if (token.exerciseIds.includes(we.id) && !we.sets.length) removeExercise(we);
      // The day had nothing else: the workout goes too, here and on the server.
      const left = getWorkout(token.workoutId);
      if (left && !left.exercises.length) deleteWorkout(left);
      return;
    }
    case "brief": {
      if (token.previous) saveBrief(userId, token.date, token.previous.rawText, token.previous.facts, token.previous.status);
      else {
        const b = briefFor(userId, token.date);
        if (b) deleteBrief(userId, b);
      }
      requestReplan(userId);
      return;
    }
    case "planned":
      removePlannedMeal(userId, token.date, token.id);
      return;
    case "reminder":
      await cancelReminder(token.id, userId);
      return;
    case "reminder_restore": {
      // Set again under a new id; one whose time has passed in the meantime just stays gone.
      const { what, date, minute } = token.reminder;
      await scheduleReminder(what, date, minute, userId);
      return;
    }
    case "planned_restore":
      restorePlannedMeal(userId, token.date, token.meal);
      return;
    case "routine": {
      const r = getRoutine(token.routineId);
      if (r) deleteRoutine(r);
      return;
    }
    case "meal_restore":
      saveMeal(token.meal);
      return;
    case "water_add":
      for (let n = 0; n < token.glasses; n++) logGlass(userId, token.day);
      return;
    case "weight_restore":
      restoreWeight(token.weight);
      return;
    case "workout_restore":
      restoreWorkout(token.workoutId);
      return;
  }
}

/** Undo for one receipt (the sheet's 10 s Undo, or the thread's for the same day). */
export async function undoItem(userId: string, item: StoredItem): Promise<StoredItem> {
  if (item.state !== "done" || !item.undo) return item;
  await undoToken(userId, item.undo);
  return { ...item, state: "undone", undo: null };
}

/** AB6 · A chip swapped for another food: the saved meal changes, and the spoken word is remembered (D97). */
export function swapFood(userId: string, item: StoredItem, index: number, food: AssistantParsedItem["alternatives"][number]): StoredItem {
  if (item.resolved?.kind !== "meal") return item;
  const old = item.resolved.items[index];
  if (!old) return item;
  const unit = food.units.some((u) => u.unit === old.unit) ? old.unit : food.defaultUnit;
  const quantity = unit === old.unit ? old.quantity : 1;
  const { grams, macros } = portion(nutritionOf(food), quantity, unit);
  const swapped: AssistantParsedItem = {
    ...old,
    food,
    unit,
    quantity,
    grams,
    macros,
    matchScore: 1,
    uncertain: false,
    reasons: [],
    alternatives: [old.food, ...old.alternatives.filter((f) => f.id !== food.id)].filter((f): f is typeof food => !!f).slice(0, 3),
  };
  const items = item.resolved.items.map((p, i) => (i === index ? swapped : p));
  const next: StoredItem = { ...item, resolved: { ...item.resolved, items } };
  if (normalize(old.query) !== normalize(food.name)) rememberAlias(userId, { heard: old.query, means: food.name, target: "food", id: food.id });
  if (item.state === "done" && item.mealId) {
    const meal = getMeal(item.mealId);
    if (meal) saveMeal({ ...meal, items: items.map(mealItemFrom).filter((x): x is MealItem => !!x) });
    return { ...next, receipt: mealLine(next, "done") };
  }
  return { ...next, receipt: mealLine(next, next.tier === "do" ? "will" : "check") };
}

/** AB6 · The chip's portion stepper: a new amount for one food. */
export function setPortion(item: StoredItem, index: number, quantity: number): StoredItem {
  if (item.resolved?.kind !== "meal") return item;
  const p = item.resolved.items[index];
  if (!p?.food || quantity <= 0) return item;
  const items = item.resolved.items.map((x, i) => (i === index ? reportion(x, quantity, x.unit) : x));
  const next: StoredItem = { ...item, resolved: { ...item.resolved, items } };
  if (item.state === "done" && item.mealId) {
    const meal = getMeal(item.mealId);
    if (meal) saveMeal({ ...meal, items: items.map(mealItemFrom).filter((x): x is MealItem => !!x) });
    return { ...next, receipt: mealLine(next, "done") };
  }
  return { ...next, receipt: mealLine(next, "check") };
}
