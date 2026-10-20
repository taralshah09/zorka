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
import { nutritionOf } from "@/features/food/catalog";
import { getExercise } from "@/features/gym/catalog";
import {
  activeWorkout,
  deleteWorkout,
  finishWorkout,
  getWorkout,
  removeExercise,
  removeSet,
  startWorkout,
} from "@/features/gym/store";
import { applyVoiceSets } from "@/features/gym/voice";
import { briefFor, deleteBrief, saveBrief } from "@/features/life/briefs";
import { rememberAlias } from "@/features/life/memory";
import { deleteMeal, getMeal, lastPortions, saveMeal, type MealItem } from "@/features/meals/store";
import { deleteWeight, listWeights, logWeight } from "@/features/progress/weights";
import { logGlass, undoGlass } from "@/features/water/store";
import {
  ASSISTANT_SCREENS,
  deviatesFromUsual,
  factsForDayType,
  planTurn,
  stricterTier,
  tierFor,
  type AssistantAction,
  type AssistantScreen,
  type Tier,
  type TurnContext,
} from "@shared/domain/assistant";
import { ACTIVITY_LABEL } from "@shared/domain/activity";
import { portion, UNIT_LABEL, type MealType } from "@shared/domain/food";
import { normalize } from "@shared/domain/foodMatch";
import { clockText } from "@shared/domain/memory";
import { SLOT_MINUTE } from "@shared/domain/planDay";
import { goTo } from "./navigate";
import { planMeal, removePlannedMeal } from "./plannedMeals";
import { cancelReminder, scheduleReminder } from "./reminders";
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
  plan_meal: "restaurant",
  remind_me: "notifications",
  ask: "auto_awesome",
  correct: "edit",
  undo: "undo",
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
export function checkPhoneTurn(result: AssistantTurnResult, ctx: TurnContext, usual: Usual): StoredItem[] {
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
    return { ...item, tier, state, receipt: item.line, undo: null };
  });
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

function logMeal(item: StoredItem, ctx: RunContext): StoredItem {
  if (item.resolved?.kind !== "meal" || item.action.kind !== "log_meal") return failed(item, "Nothing to log.");
  const items = item.resolved.items.map(mealItemFrom).filter((x): x is MealItem => !!x);
  if (!items.length) return failed(item, `I couldn't find "${item.resolved.items.map((p) => p.query).join(", ")}". Tap Change to search.`);
  const mealType = item.resolved.mealType;
  const at = loggedAtFor(item.action.date, ctx.today, mealType);
  const id = randomUUID();
  saveMeal({
    id,
    userId: ctx.userId,
    mealType,
    loggedAt: at.toISOString(),
    localDate: item.action.date ?? ctx.today,
    source: ctx.source,
    oilLevel: null,
    photoUri: null,
    items,
  });
  reactMascot("happy");
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
  const open = activeWorkout(ctx.userId);
  if (open) {
    const before = new Set(open.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)]));
    const { added, unmatched } = applyVoiceSets(ctx.userId, open.id, sets, lookup);
    if (!added.length) return failed(item, `I couldn't match ${unmatched.join(", ") || "those sets"}.`);
    const after = getWorkout(open.id)!;
    const exerciseIds = after.exercises.filter((e) => !before.has(e.id)).map((e) => e.id);
    const setIds = after.exercises.flatMap((e) => e.sets.filter((s) => !before.has(s.id)).map((s) => s.id));
    return done(item, `Added ${added.map((a) => a.exerciseName).join(", ")} to ${after.name}.`, {
      kind: "sets",
      workoutId: open.id,
      setIds,
      exerciseIds,
    });
  }
  const w = startWorkout(ctx.userId, { name: "Logged with Zorka" });
  const { added, unmatched } = applyVoiceSets(ctx.userId, w.id, sets, lookup);
  const finished = added.length ? finishWorkout(w.id) : null;
  if (!finished) {
    const left = getWorkout(w.id);
    if (left && left.status === "active") deleteWorkout(left);
    return failed(item, `I couldn't match ${unmatched.join(", ") || "those sets"}.`);
  }
  reactMascot("happy");
  return done(item, `Logged ${added.map((a) => a.exerciseName).join(", ")}.`, { kind: "workout", workoutId: finished.id });
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
      case "remind_me": {
        const date = a.date ?? ctx.today;
        const set = await scheduleReminder(a.what, date, a.minute);
        if ("error" in set) return failed(item, set.error);
        return done(item, `I'll remind you to ${a.what} at ${clockText(a.minute)}.`, { kind: "reminder", id: set.id });
      }
      case "correct":
        return correct(item, ctx);
      case "undo":
        return undoPrevious(item, ctx);
      case "open":
        goTo(SCREEN_HREF[a.screen]);
        return done(item, item.line, null);
      case "ask":
        return { ...item, state: "answered" };
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
      await cancelReminder(token.id);
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
