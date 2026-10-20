// AB1 · The Assistant Bar's actions and act policy (docs/ASSISTANT_BAR_PLAN.md, D89–D98). Pure domain logic shared by
// mobile and backend (D24): no imports beyond types and constants, no I/O.
//
// The router (AI) only names actions from this list and copies words out of the transcript. Every action is checked
// here twice: on the server before it's sent, and on the phone before it runs, so a wrong or tampered answer still
// can't write outside these bounds (D96). Day types go through `set_day` and the planner computes the numbers (D91).
// The one number a target may take is the user's own, said out loud (`set_target`, D99): it must be in the transcript,
// it is always approved first, and the planner keeps it inside `chosenLimits` and moves the rest over the week.
import type { ActivityKind } from "./activity.js";
import { classifyDay, DAY_TYPES, type DayType } from "./dayType.js";
import { FOOD_UNITS, MEAL_TYPES, type FoodUnit, type MealType } from "./food.js";
import { normalize } from "./foodMatch.js";
import { EMPTY_STANDING, validateDayFacts, type DayFacts } from "./life.js";
import { WATER_LOG_MAX_GLASSES } from "./water.js";

/** Screens an `open` action may name. The phone maps each to a route, so the AI never picks a raw href (UX N1). */
export const ASSISTANT_SCREENS = [
  "gap",
  "move",
  "quick_log",
  "log_weight",
  "progress",
  "checkin",
  "steps",
  "record_walk",
  "day",
  "share_day",
  "plan_tomorrow",
  "menu_scan",
] as const;
export type AssistantScreen = (typeof ASSISTANT_SCREENS)[number];

/**
 * What a question can be about. The facts for each come from code (assistantFacts.ts), never from the AI. Two need the
 * server: `food_fit` ("would dal rice be ok for lunch?") weighs the food parser's numbers against today's gap, and
 * `advice` ("legs are sore, what should I do?") is a short coach answer written over today's facts.
 */
export const ASK_TOPICS = ["today", "week", "trend", "streak", "what_to_eat", "plan", "why", "meals", "records", "food_fit", "advice"] as const;
export type AskTopic = (typeof ASK_TOPICS)[number];

export const ACTIVITY_KINDS: readonly ActivityKind[] = ["walk", "run", "ride"];

/** How sure the turn is about what was said and matched (D93). Gemini STT has no score, so it's "medium". */
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const MAX_ACTIONS_PER_TURN = 5;
/** Actions that change records already saved (`correct`, `undo`). One per turn. */
export const MAX_EDITS_PER_TURN = 1;
/** Dates an action may touch: yesterday (a late log) up to a week ahead (the brief's range, D73). */
export const DATE_PAST_DAYS = 1;
export const DATE_FUTURE_DAYS = 7;
export const SPAN_MAX = 300;
export const QUESTION_MAX = 160;
export const OPTION_MAX = 40;
export const MAX_OPTIONS = 4;
export const NOTE_MAX = 120;
/** A routine's name (the routine editor's limit). */
export const ROUTINE_NAME_MAX = 60;
/** A routine exercise said without sets or reps ("bench, flys"): the routine editor's defaults. */
export const ROUTINE_DEFAULT_SETS = 3;
export const ROUTINE_DEFAULT_REPS = 10;
export const ROUTINE_MAX_SETS = 10;
export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 300;
/** A weigh-in this far from the last one is shown for approval rather than saved straight away. */
export const WEIGHT_JUMP_KG = 2;
/** More glasses than this in one go is unusual (a mis-heard "two litres" → "twelve"), so it's approved first. */
export const WATER_USUAL_MAX_GLASSES = 4;

/** Saved records a voice delete may target, one at a time. Bulk deletes stay in the UI (Guardrails 4). */
export const DELETE_TARGETS = ["meal", "water", "weight", "workout", "reminder", "planned_meal"] as const;
export type DeleteTarget = (typeof DELETE_TARGETS)[number];
/** Targets that live ahead of today (a reminder, a planned meal), not records already eaten or done. */
const AHEAD_TARGETS: ReadonlySet<DeleteTarget> = new Set(["reminder", "planned_meal"]);
/** replace: the meal is now these foods · add: these foods join it · remove: the named food leaves it. */
export const EDIT_MODES = ["replace", "add", "remove"] as const;
export type EditMode = (typeof EDIT_MODES)[number];
/** Most of one food a `set_amount` may set (2 litres in ml is the largest real one). */
export const AMOUNT_MAX = 2000;
/** D99 · Which of a day's targets `set_target` sets: the numbers the Plan-a-day screen lets the user pick. */
export const TARGET_METRICS = ["protein", "kcal", "steps"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];
/** Outer bounds a said target must sit in before the planner's own limits (`chosenLimits`) are checked on the phone. */
export const TARGET_VALUE_MAX: Record<TargetMetric, number> = { protein: 400, kcal: 6000, steps: 50_000 };

export type AssistantAction =
  | { kind: "log_meal"; span: string; mealType?: MealType; date?: string; confidence: Confidence }
  | { kind: "log_water"; glasses: number }
  | { kind: "log_workout"; span: string; date?: string; confidence: Confidence }
  | { kind: "start_activity"; activity: ActivityKind }
  | { kind: "stop_activity" }
  | { kind: "log_weight"; kg: number; date?: string; confidence: Confidence }
  | { kind: "set_day"; dayType: DayType; date: string; note?: string }
  /**
   * D99 · One day's protein, calorie or step target, as the user said it ("only 75 g protein tomorrow"). The rest of
   * the week moves around it (week.ts `chosen`). Always approved first; the phone refuses a number outside the day's
   * `chosenLimits`.
   */
  | { kind: "set_target"; metric: TargetMetric; value: number; date: string }
  | { kind: "plan_meal"; span: string; mealType: MealType; date?: string }
  | { kind: "remind_me"; what: string; minute: number; date?: string }
  /**
   * `mealType`: which meal "what should I have for dinner", "what did I eat for lunch" or "would dal rice be ok for
   * lunch" is about. `about`: the exercise a records question names ("what's my bench PR" → "bench"), or the food a
   * food_fit question names ("dal and rice").
   */
  | { kind: "ask"; topic: AskTopic; date?: string; mealType?: MealType; about?: string }
  /** How to do an exercise, or exercises for a muscle: links to MuscleWiki pages from the exercise list (D38). */
  | { kind: "exercise_ref"; span: string }
  /** Saves a routine: `span` is the exercises with their sets and reps as said. Always approved first. */
  | { kind: "create_routine"; name: string; span: string }
  /** Fixes action `index` of the previous turn with new words ("no, dal not dahl"). */
  | { kind: "correct"; index: number; span: string }
  | { kind: "undo" }
  /**
   * Deletes one saved record of today or yesterday: a meal (by type, else the latest), the last `glasses` of water,
   * the day's weigh-in, or the day's latest workout. Or one thing ahead (today to a week out): a reminder (`span`: its
   * words, else the next one) or a planned meal (by type, else the next). Always approved first; the phone names the
   * record it found.
   */
  | { kind: "delete_entry"; target: DeleteTarget; mealType?: MealType; date?: string; glasses?: number; span?: string }
  /**
   * Changes one saved meal of today or yesterday: its foods replaced, added to, or one removed. Approved first.
   * replace + `from`: only the foods matching `from` are swapped for `span` ("dal, not rajma").
   */
  | { kind: "edit_meal"; mode: EditMode; span: string; from?: string; mealType?: MealType; date?: string; confidence: Confidence }
  /**
   * A new amount for one food already in a saved meal of today or yesterday ("make it 2 katori", "poha do katori kar
   * do"). The router reads the amount (it understands "do", "aadha", "one more"); `more`: add it to what's there.
   * `food`: the food's words when named, else the meal's only food. Approved first.
   */
  | { kind: "set_amount"; quantity: number; unit?: FoodUnit; more?: boolean; food?: string; mealType?: MealType; date?: string }
  | { kind: "open"; screen: AssistantScreen }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "out_of_scope" };
export type ActionKind = AssistantAction["kind"];

export const ACTION_KINDS: readonly ActionKind[] = [
  "log_meal",
  "log_water",
  "log_workout",
  "start_activity",
  "stop_activity",
  "log_weight",
  "set_day",
  "set_target",
  "plan_meal",
  "remind_me",
  "ask",
  "exercise_ref",
  "create_routine",
  "correct",
  "undo",
  "delete_entry",
  "edit_meal",
  "set_amount",
  "open",
  "clarify",
  "out_of_scope",
];

/** Actions that change records already saved. MAX_EDITS_PER_TURN of them per turn. */
const EDIT_KINDS: ReadonlySet<ActionKind> = new Set(["correct", "undo", "delete_entry", "edit_meal", "set_amount"]);

/** What the phone knows when it checks a turn. */
export type TurnContext = {
  /** The user's local date, YYYY-MM-DD. */
  today: string;
  lastWeightKg: number | null;
  activityRunning: boolean;
  /** How many actions the previous turn ran (0 when there's none to correct or undo). */
  previousActions: number;
};

export type RejectReason =
  | "unknown_kind"
  | "empty"
  | "too_long"
  | "bad_value"
  | "bad_date"
  | "date_out_of_range"
  | "already_running"
  | "nothing_running"
  | "nothing_to_edit"
  | "too_many_actions"
  | "too_many_edits"
  | "duplicate"
  /** An out-of-scope marker next to real actions: the real ones run, the marker is dropped. */
  | "mixed_out_of_scope";

export type Checked = { ok: true; action: AssistantAction } | { ok: false; reason: RejectReason };

/** Do + Undo · Approve first · Ask a question · Refuse · Answer a question. */
export type Tier = "do" | "approve" | "ask" | "refuse" | "answer";

export type PlannedTurn = {
  items: { action: AssistantAction; tier: Tier }[];
  dropped: { action: unknown; reason: RejectReason }[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

function validDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const back = new Date(Date.UTC(y!, m! - 1, d!));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m! - 1 && back.getUTCDate() === d;
}

/**
 * Dates are checked against the window; `minOffset` 0 means "not in the past" (plans, reminders), `maxOffset` 0 "not
 * in the future" (changing what was saved).
 */
function checkDate(
  date: string | undefined,
  today: string,
  minOffset = -DATE_PAST_DAYS,
  maxOffset = DATE_FUTURE_DAYS,
): RejectReason | null {
  if (date === undefined) return null;
  if (typeof date !== "string" || !validDate(date)) return "bad_date";
  const offset = dayNumber(date) - dayNumber(today);
  return offset < minOffset || offset > maxOffset ? "date_out_of_range" : null;
}

/** Trimmed, single-spaced text, or a reason it can't be used. */
function cleanText(text: unknown, max: number): string | RejectReason {
  if (typeof text !== "string") return "bad_value";
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "empty";
  return clean.length > max ? "too_long" : clean;
}

const isReason = (v: string | RejectReason): v is RejectReason =>
  (["empty", "too_long", "bad_value"] as string[]).includes(v);

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && list.includes(v as T);

const confidenceOf = (v: unknown): Confidence => (oneOf(CONFIDENCES, v) ? v : "low");

/**
 * Checks one action and returns a clean copy (trimmed text, rounded numbers, unknown fields dropped). Anything that
 * isn't exactly an action from the catalogue is rejected, so a model that's been talked into inventing one gets nowhere.
 */
export function checkAction(raw: unknown, ctx: TurnContext): Checked {
  const fail = (reason: RejectReason): Checked => ({ ok: false, reason });
  if (!raw || typeof raw !== "object") return fail("unknown_kind");
  const a = raw as Record<string, unknown>;
  if (!oneOf(ACTION_KINDS, a.kind)) return fail("unknown_kind");
  const date = a.date as string | undefined;

  switch (a.kind) {
    case "log_meal":
    case "log_workout": {
      const span = cleanText(a.span, SPAN_MAX);
      if (isReason(span)) return fail(span);
      const bad = checkDate(date, ctx.today);
      if (bad) return fail(bad);
      const confidence = confidenceOf(a.confidence);
      if (a.kind === "log_workout") return { ok: true, action: { kind: "log_workout", span, date, confidence } };
      if (a.mealType !== undefined && !oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      return { ok: true, action: { kind: "log_meal", span, mealType: a.mealType as MealType | undefined, date, confidence } };
    }
    case "log_water": {
      const glasses = a.glasses;
      if (typeof glasses !== "number" || !Number.isFinite(glasses)) return fail("bad_value");
      const n = Math.round(glasses);
      if (n < 1 || n > WATER_LOG_MAX_GLASSES) return fail("bad_value");
      return { ok: true, action: { kind: "log_water", glasses: n } };
    }
    case "start_activity":
      if (!oneOf(ACTIVITY_KINDS, a.activity)) return fail("bad_value");
      if (ctx.activityRunning) return fail("already_running");
      return { ok: true, action: { kind: "start_activity", activity: a.activity } };
    case "stop_activity":
      return ctx.activityRunning ? { ok: true, action: { kind: "stop_activity" } } : fail("nothing_running");
    case "log_weight": {
      const kg = a.kg;
      if (typeof kg !== "number" || !Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) return fail("bad_value");
      const bad = checkDate(date, ctx.today);
      if (bad) return fail(bad);
      return { ok: true, action: { kind: "log_weight", kg: Math.round(kg * 10) / 10, date, confidence: confidenceOf(a.confidence) } };
    }
    case "set_day": {
      if (!oneOf(DAY_TYPES, a.dayType)) return fail("bad_value");
      if (typeof a.date !== "string") return fail("bad_date");
      const bad = checkDate(a.date, ctx.today, 0);
      if (bad) return fail(bad);
      let note: string | undefined;
      if (a.note !== undefined) {
        const clean = cleanText(a.note, NOTE_MAX);
        if (clean === "too_long" || clean === "bad_value") return fail(clean);
        note = clean === "empty" ? undefined : clean;
      }
      return { ok: true, action: { kind: "set_day", dayType: a.dayType, date: a.date, note } };
    }
    case "set_target": {
      if (!oneOf(TARGET_METRICS, a.metric)) return fail("bad_value");
      const value = a.value;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > TARGET_VALUE_MAX[a.metric]) return fail("bad_value");
      if (typeof a.date !== "string") return fail("bad_date");
      const bad = checkDate(a.date, ctx.today, 0);
      if (bad) return fail(bad);
      return { ok: true, action: { kind: "set_target", metric: a.metric, value: Math.round(value), date: a.date } };
    }
    case "plan_meal": {
      const span = cleanText(a.span, SPAN_MAX);
      if (isReason(span)) return fail(span);
      if (!oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      const bad = checkDate(date, ctx.today, 0);
      if (bad) return fail(bad);
      return { ok: true, action: { kind: "plan_meal", span, mealType: a.mealType, date } };
    }
    case "remind_me": {
      const what = cleanText(a.what, NOTE_MAX);
      if (isReason(what)) return fail(what);
      const minute = a.minute;
      if (typeof minute !== "number" || !Number.isInteger(minute) || minute < 0 || minute >= 24 * 60) return fail("bad_value");
      const bad = checkDate(date, ctx.today, 0);
      if (bad) return fail(bad);
      return { ok: true, action: { kind: "remind_me", what, minute, date } };
    }
    case "ask": {
      if (!oneOf(ASK_TOPICS, a.topic)) return fail("bad_value");
      if (a.mealType !== undefined && !oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      const bad = checkDate(date, ctx.today, -DATE_FUTURE_DAYS);
      if (bad) return fail(bad);
      // Only food questions are about one meal.
      const mealType = a.topic === "what_to_eat" || a.topic === "meals" || a.topic === "food_fit" ? (a.mealType as MealType | undefined) : undefined;
      // Only a records question names an exercise, and only a food_fit question names a food.
      let about: string | undefined;
      if ((a.topic === "records" || a.topic === "food_fit") && a.about !== undefined) {
        const clean = cleanText(a.about, OPTION_MAX * 2);
        if (clean === "too_long" || clean === "bad_value") return fail(clean);
        about = clean === "empty" ? undefined : clean;
      }
      return { ok: true, action: { kind: "ask", topic: a.topic, date, mealType, about } };
    }
    case "exercise_ref": {
      const span = cleanText(a.span, OPTION_MAX * 2);
      if (isReason(span)) return fail(span);
      return { ok: true, action: { kind: "exercise_ref", span } };
    }
    case "create_routine": {
      const name = cleanText(a.name, ROUTINE_NAME_MAX);
      if (isReason(name)) return fail(name);
      const span = cleanText(a.span, SPAN_MAX);
      if (isReason(span)) return fail(span);
      return { ok: true, action: { kind: "create_routine", name, span } };
    }
    case "correct": {
      const index = a.index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return fail("bad_value");
      if (index >= ctx.previousActions) return fail("nothing_to_edit");
      const span = cleanText(a.span, SPAN_MAX);
      if (isReason(span)) return fail(span);
      return { ok: true, action: { kind: "correct", index, span } };
    }
    case "undo":
      return ctx.previousActions > 0 ? { ok: true, action: { kind: "undo" } } : fail("nothing_to_edit");
    case "delete_entry": {
      if (!oneOf(DELETE_TARGETS, a.target)) return fail("bad_value");
      if (a.mealType !== undefined && !oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      const ahead = AHEAD_TARGETS.has(a.target);
      const bad = ahead ? checkDate(date, ctx.today, 0) : checkDate(date, ctx.today, -DATE_PAST_DAYS, 0);
      if (bad) return fail(bad);
      let glasses: number | undefined;
      if (a.target === "water") {
        if (a.glasses !== undefined && (typeof a.glasses !== "number" || !Number.isFinite(a.glasses))) return fail("bad_value");
        glasses = a.glasses === undefined ? 1 : Math.round(a.glasses);
        if (glasses < 1 || glasses > WATER_LOG_MAX_GLASSES) return fail("bad_value");
      }
      let span: string | undefined;
      if (a.target === "reminder" && a.span !== undefined) {
        const clean = cleanText(a.span, NOTE_MAX);
        if (clean === "too_long" || clean === "bad_value") return fail(clean);
        span = clean === "empty" ? undefined : clean;
      }
      const mealType = a.target === "meal" || a.target === "planned_meal" ? (a.mealType as MealType | undefined) : undefined;
      return { ok: true, action: { kind: "delete_entry", target: a.target, mealType, date, glasses, span } };
    }
    case "edit_meal": {
      if (!oneOf(EDIT_MODES, a.mode)) return fail("bad_value");
      const span = cleanText(a.span, SPAN_MAX);
      if (isReason(span)) return fail(span);
      let from: string | undefined;
      if (a.from !== undefined) {
        // Only a replace swaps out named foods; add and remove already name theirs in `span`.
        if (a.mode !== "replace") return fail("bad_value");
        const clean = cleanText(a.from, SPAN_MAX);
        if (isReason(clean)) return fail(clean);
        from = clean;
      }
      if (a.mealType !== undefined && !oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      const bad = checkDate(date, ctx.today, -DATE_PAST_DAYS, 0);
      if (bad) return fail(bad);
      return {
        ok: true,
        action: { kind: "edit_meal", mode: a.mode, span, from, mealType: a.mealType as MealType | undefined, date, confidence: confidenceOf(a.confidence) },
      };
    }
    case "set_amount": {
      const q = a.quantity;
      if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > AMOUNT_MAX) return fail("bad_value");
      if (a.unit !== undefined && !oneOf(FOOD_UNITS, a.unit)) return fail("bad_value");
      if (a.more !== undefined && typeof a.more !== "boolean") return fail("bad_value");
      if (a.mealType !== undefined && !oneOf(MEAL_TYPES, a.mealType)) return fail("bad_value");
      let food: string | undefined;
      if (a.food !== undefined) {
        const clean = cleanText(a.food, OPTION_MAX * 2);
        if (clean === "too_long" || clean === "bad_value") return fail(clean);
        food = clean === "empty" ? undefined : clean;
      }
      const bad = checkDate(date, ctx.today, -DATE_PAST_DAYS, 0);
      if (bad) return fail(bad);
      return {
        ok: true,
        action: {
          kind: "set_amount",
          quantity: Math.round(q * 100) / 100,
          unit: a.unit as FoodUnit | undefined,
          more: a.more === true ? true : undefined,
          food,
          mealType: a.mealType as MealType | undefined,
          date,
        },
      };
    }
    case "open":
      return oneOf(ASSISTANT_SCREENS, a.screen) ? { ok: true, action: { kind: "open", screen: a.screen } } : fail("bad_value");
    case "clarify": {
      const question = cleanText(a.question, QUESTION_MAX);
      if (isReason(question)) return fail(question);
      if (!Array.isArray(a.options)) return fail("bad_value");
      const options: string[] = [];
      for (const o of a.options.slice(0, MAX_OPTIONS)) {
        const clean = cleanText(o, OPTION_MAX);
        if (isReason(clean)) return fail(clean);
        options.push(clean);
      }
      return { ok: true, action: { kind: "clarify", question, options } };
    }
    case "out_of_scope":
      return { ok: true, action: { kind: "out_of_scope" } };
  }
  return fail("unknown_kind");
}

/** Anything not on today is approved first: the user should see a change to another day before it happens. */
const offToday = (date: string | undefined, today: string) => date !== undefined && date !== today;

/** The act policy (D92, D93). Only called on an action that passed checkAction. */
export function tierFor(action: AssistantAction, ctx: TurnContext): Tier {
  switch (action.kind) {
    case "out_of_scope":
      return "refuse";
    case "clarify":
      return "ask";
    case "ask":
    case "exercise_ref":
      return "answer";
    case "set_day":
    // D99: a picked number is always shown first.
    case "set_target":
    // A routine is shown, exercise by exercise, before it's saved.
    case "create_routine":
    // D92: anything that changes or deletes a saved record is shown before it happens.
    case "delete_entry":
    case "edit_meal":
    case "set_amount":
      return "approve";
    case "log_meal":
    case "log_workout":
      return action.confidence !== "high" || offToday(action.date, ctx.today) ? "approve" : "do";
    case "log_weight": {
      const jump = ctx.lastWeightKg !== null && Math.abs(action.kg - ctx.lastWeightKg) > WEIGHT_JUMP_KG;
      return jump || action.confidence !== "high" || offToday(action.date, ctx.today) ? "approve" : "do";
    }
    case "log_water":
      return action.glasses > WATER_USUAL_MAX_GLASSES ? "approve" : "do";
    case "plan_meal":
    case "remind_me":
      return offToday(action.date, ctx.today) ? "approve" : "do";
    case "start_activity":
    case "stop_activity":
    case "correct":
    case "undo":
    case "open":
      return "do";
  }
}

/** Two actions are the same request said twice ("start a walk… yeah start the walk"). */
function sameRequest(a: AssistantAction, b: AssistantAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A whole turn: each action checked, then turn rules (at most MAX_ACTIONS_PER_TURN, one edit, no repeats, one
 * `start_activity`), then a tier for each. Out-of-scope only stands alone: next to real actions it's dropped.
 */
export function planTurn(raw: unknown, ctx: TurnContext): PlannedTurn {
  const out: PlannedTurn = { items: [], dropped: [] };
  const list = Array.isArray(raw) ? raw : [];
  let edits = 0;
  let starting = false;
  for (const [i, entry] of list.entries()) {
    if (i >= MAX_ACTIONS_PER_TURN) {
      out.dropped.push({ action: entry, reason: "too_many_actions" });
      continue;
    }
    const checked = checkAction(entry, ctx);
    if (!checked.ok) {
      out.dropped.push({ action: entry, reason: checked.reason });
      continue;
    }
    const action = checked.action;
    if (out.items.some((it) => sameRequest(it.action, action))) {
      out.dropped.push({ action: entry, reason: "duplicate" });
      continue;
    }
    if (EDIT_KINDS.has(action.kind)) {
      if (edits >= MAX_EDITS_PER_TURN) {
        out.dropped.push({ action: entry, reason: "too_many_edits" });
        continue;
      }
      edits++;
    }
    if (action.kind === "start_activity") {
      if (starting) {
        out.dropped.push({ action: entry, reason: "already_running" });
        continue;
      }
      starting = true;
    }
    out.items.push({ action, tier: tierFor(action, ctx) });
  }
  if (out.items.length > 1) {
    const scoped = out.items.filter((it) => it.action.kind !== "out_of_scope");
    for (const it of out.items) if (it.action.kind === "out_of_scope") out.dropped.push({ action: it.action, reason: "mixed_out_of_scope" });
    out.items = scoped;
  }
  return out;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Every number in a phrased reply must be one of the facts it was built from (D90). Rounding is allowed: within 1 or
 * 2%, whichever is larger, so "about 1,600" from 1,612 passes and a made-up "1,200" doesn't.
 */
export function numbersGrounded(reply: string, facts: readonly number[]): boolean {
  for (const match of reply.match(NUMBER) ?? []) {
    const n = Number(match.replace(/,/g, ""));
    if (!Number.isFinite(n)) return false;
    if (!facts.some((f) => Math.abs(f - n) <= Math.max(1, Math.abs(f) * 0.02))) return false;
  }
  return true;
}

// ── Tiers across the two checks ──────────────────────────────────────────────────────────────────

const TIER_RANK: Record<Tier, number> = { answer: 0, do: 0, approve: 1, ask: 2, refuse: 3 };

/** The phone re-tiers every action and keeps the stricter of its own tier and the server's (D96). */
export function stricterTier(a: Tier, b: Tier): Tier {
  if (a === b) return a;
  if (a === "answer" && b === "do") return a;
  if (b === "answer" && a === "do") return b;
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// ── Mis-hearing (AB6): confidence signals ────────────────────────────────────────────────────────

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

/** The lower of two confidences: one shaky signal is enough to ask first (D93). */
export const lowerConfidence = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;

/** A Whisper `verbose_json` segment. */
export type SttSegment = { avg_logprob?: number; no_speech_prob?: number };

/** Mean log-probability at or above this is a clear transcript; at or above MEDIUM it's usable but shown first. */
export const STT_HIGH_LOGPROB = -0.35;
export const STT_MEDIUM_LOGPROB = -0.7;
/** A segment this likely to be silence or noise makes the whole transcript low confidence. */
export const STT_NO_SPEECH = 0.6;

/**
 * How sure speech-to-text was. No segments (Gemini has no scores) is "medium": usable, but never a silent Do for
 * food (D93).
 */
export function sttConfidence(segments: readonly SttSegment[] | null | undefined): Confidence {
  const scored = (segments ?? []).filter((s) => typeof s.avg_logprob === "number" && Number.isFinite(s.avg_logprob));
  if (!scored.length) return "medium";
  if (scored.some((s) => (s.no_speech_prob ?? 0) > STT_NO_SPEECH)) return "low";
  const mean = scored.reduce((sum, s) => sum + s.avg_logprob!, 0) / scored.length;
  return mean >= STT_HIGH_LOGPROB ? "high" : mean >= STT_MEDIUM_LOGPROB ? "medium" : "low";
}

/** Top food match below this, or a runner-up this close, is a weak match: shown with alternatives first. */
export const MATCH_STRONG = 0.75;
export const MATCH_CLOSE_GAP = 0.08;

export type MatchSignal = { score: number | null; runnerUp: number | null; uncertain: boolean };

/** How sure the food (or exercise) match is, across every item of one action. */
export function matchConfidence(items: readonly MatchSignal[]): Confidence {
  if (!items.length) return "low";
  let out: Confidence = "high";
  for (const it of items) {
    if (it.score === null || it.uncertain) return "low";
    const close = it.runnerUp !== null && it.score - it.runnerUp < MATCH_CLOSE_GAP;
    if (it.score < MATCH_STRONG || close) out = "medium";
  }
  return out;
}

/** Most of one food a person logs in one go, per unit. More than this is likely mis-heard ("to rotis" → 12). */
export const ITEM_MAX: Partial<Record<FoodUnit, number>> = {
  piece: 8,
  katori: 4,
  bowl: 3,
  plate_half: 2,
  plate_full: 2,
  glass: 4,
  cup: 4,
  tbsp: 6,
  tsp: 10,
  slice: 6,
  serving: 3,
  g: 800,
  ml: 2000,
};

export const quantityUnusual = (quantity: number, unit: FoodUnit): boolean =>
  !Number.isFinite(quantity) || quantity <= 0 || quantity > (ITEM_MAX[unit] ?? 10);

/** Twice or half the user's usual portion of the same food ("you always have 2 rotis") is approved first. */
export const deviatesFromUsual = (quantity: number, usual: number | null | undefined): boolean =>
  usual != null && usual > 0 && (quantity >= usual * 2 || quantity <= usual / 2);

/**
 * The router must copy words out of the transcript (D91). A span that mostly isn't there was made up and is dropped
 * ("Router disagreement"). Short words ("a", "of") and digits don't count; spellings are compared normalised.
 */
export function spanInTranscript(span: string, transcript: string): boolean {
  const s = normalize(span);
  const t = normalize(transcript);
  if (!s) return false;
  if (t.includes(s)) return true;
  const words = s.split(" ").filter((w) => w.length > 2 && !/^\d+$/.test(w));
  if (!words.length) return false;
  const heard = new Set(t.split(" "));
  return words.filter((w) => heard.has(w)).length / words.length >= 0.6;
}

/**
 * D99 · A target's number must be one the user said ("75g", "1,800 kcal", "8000 steps"). The router may convert a unit
 * but never invent a number, so a value not in the transcript drops the action.
 */
export function numberInTranscript(value: number, transcript: string): boolean {
  // "8k steps" is 8000; the k of "75 kcal" is not.
  for (const match of transcript.match(/\d[\d,]*(?:\.\d+)?(?:\s*k(?![a-z]))?/gi) ?? []) {
    const thousands = /k$/i.test(match);
    const n = Number(match.replace(/[,\sk]/gi, "")) * (thousands ? 1000 : 1);
    if (Number.isFinite(n) && Math.round(n) === Math.round(value)) return true;
  }
  return false;
}

/** Hindi in Devanagari. Food search, the heard-words check and aliases all read Roman script, so it's written in Roman
 *  letters (Hinglish) before the router sees it. */
export const hasDevanagari = (text: string): boolean => /[\u0900-\u097F]/.test(text);

// ── Learned aliases (D97) ────────────────────────────────────────────────────────────────────────

export type Alias = { heard: string; means: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rewrites words the user has corrected before ("dahl" → "dal tadka"), longest first, whole words only. */
export function applyAliases(text: string, aliases: readonly Alias[]): string {
  let out = text;
  for (const a of [...aliases].sort((x, y) => y.heard.length - x.heard.length)) {
    const heard = a.heard.trim();
    const means = a.means.trim();
    if (!heard || !means) continue;
    // ASCII word edges (Hinglish is typed and transcribed in Latin script); Hermes has no \p{…} on older engines.
    out = out.replace(new RegExp(`(^|[^a-z0-9])${escapeRe(heard)}(?=$|[^a-z0-9])`, "gi"), `$1${means}`);
  }
  return out;
}

// ── set_day: a day type → day facts the planner reads ───────────────────────────────────────────

/** classifyDay's order: an earlier type's signal hides every later one. */
const DAY_ORDER: readonly DayType[] = ["sick", "travel", "feast", "away", "late_work", "exam", "rest", "busy", "normal"];

/**
 * The smallest change to `base` (the brief, or an empty usual day) that makes classifyDay return `dayType`. "Make
 * today lighter, I'm sick" becomes the sick flag; the planner then works out the numbers (D91). Signals of types that
 * come earlier in classifyDay's order are removed first, since they would win.
 */
export function factsForDayType(dayType: DayType, base?: DayFacts | null): DayFacts {
  const f = validateDayFacts(base ?? {});
  if (classifyDay(f, EMPTY_STANDING) === dayType) return f;
  const drop = (flag: DayFacts["flags"][number]) => (f.flags = f.flags.filter((x) => x !== flag));
  for (const earlier of DAY_ORDER.slice(0, DAY_ORDER.indexOf(dayType))) {
    if (earlier === "sick") drop("sick");
    if (earlier === "travel") {
      if (f.whereabouts === "travelling") f.whereabouts = "away_local";
      f.blocks = f.blocks.map((b) => (b.kind === "travel" ? { ...b, kind: "other" } : b));
    }
    if (earlier === "feast") {
      drop("feast");
      for (const slot of MEAL_TYPES) if (f.mealAccess[slot] === "event_food") f.mealAccess[slot] = "eat_out";
    }
    if (earlier === "away") {
      if (f.whereabouts === "other_city") f.whereabouts = "away_local";
      f.blocks = f.blocks.map((b) => (b.kind === "event" ? { ...b, kind: "other" } : b));
    }
    if (earlier === "late_work")
      f.blocks = f.blocks.map((b) => ((b.kind === "work" || b.kind === "study") && b.to > 21 * 60 ? { ...b, to: 21 * 60 } : b));
    if (earlier === "exam") drop("exam");
    if (earlier === "rest") drop("rest_day");
    if (earlier === "busy") f.blocks = f.blocks.filter((b) => b.kind === "work" || b.kind === "study" || b.kind === "sleep");
  }
  switch (dayType) {
    case "sick":
      f.flags.push("sick");
      break;
    case "travel":
      f.whereabouts = "travelling";
      break;
    case "feast":
      f.flags.push("feast");
      break;
    case "away":
      f.whereabouts = "other_city";
      break;
    case "late_work":
      f.blocks.push({ from: 18 * 60, to: 22 * 60, kind: "work", label: "Late work" });
      break;
    case "exam":
      f.flags.push("exam");
      break;
    case "rest":
      f.flags.push("rest_day");
      break;
    case "busy":
      f.blocks.push({ from: 10 * 60, to: 15 * 60 + 30, kind: "other", label: "Busy" });
      break;
    case "normal":
      break;
  }
  return validateDayFacts(f);
}

// ── Meal type: guessed from the hour, asked when the hour sits between two meals ────────────────

/** Same boundaries as food.ts mealTypeForTime, on a minute of the day. */
export function mealTypeAt(minute: number): MealType {
  if (minute < 11 * 60) return "breakfast";
  if (minute < 15 * 60 + 30) return "lunch";
  if (minute < 18 * 60 + 30) return "snack";
  return "dinner";
}

/** Half an hour or more either side of a boundary, where "had rice" could be either meal. */
const AMBIGUOUS_MEAL_WINDOWS: readonly [number, number, MealType, MealType][] = [
  [10 * 60 + 30, 11 * 60 + 30, "breakfast", "lunch"],
  [15 * 60, 16 * 60 + 30, "lunch", "snack"],
  [18 * 60, 19 * 60, "snack", "dinner"],
];

/** The two meals a log could be at this minute, or null when the hour makes it clear. */
export function ambiguousMealTypes(minute: number): [MealType, MealType] | null {
  const w = AMBIGUOUS_MEAL_WINDOWS.find(([from, to]) => minute >= from && minute < to);
  return w ? [w[2], w[3]] : null;
}

export const minuteOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// ── Copy both sides agree on ─────────────────────────────────────────────────────────────────────

/** `out_of_scope`: one redirect line, no general-purpose answer (Guardrails 7). */
export const OUT_OF_SCOPE_LINE = "I'm your health PA, so I can log, plan and tell you how you're doing.";
/** Offline, a question the phone can't answer on its own (D98). */
export const OFFLINE_ANSWER_LINE = "I'll answer when you're back online.";
/** Max characters of a transcript or typed turn (Guardrails 9). */
export const TURN_TEXT_MAX = 1000;

/**
 * D98 · Offline there's no router, so only plain questions the phone can answer on its own are recognised here
 * (English and common Hinglish). Anything else waits in the queue.
 */
export function localAskTopic(text: string): AskTopic | null {
  const t = normalize(text);
  if (!t) return null;
  if (/\bstreak\b/.test(t)) return "streak";
  // Not a bare "record": "record a walk" starts the recorder.
  if (/\b(pr|prs|personal (best|record)s?|my best|my max|new records?|1rm|one rep max)\b/.test(t)) return "records";
  if (/\b(what s|whats|show|see) (my |the |today s |todays )?plan\b|\bplan (for )?today\b|\baaj ka plan\b/.test(t)) return "plan";
  if (/\bweek\b/.test(t) && /\b(how|my|this)\b/.test(t)) return "week";
  if (/\b(weight|trend)\b/.test(t) && /\b(how|what|trend|going)\b/.test(t)) return "trend";
  if (/\bwhat did i (eat|have)\b|\bwhat have i (eaten|had)\b|\bwhat i (ate|had)\b|\bkya khaya\b/.test(t)) return "meals";
  if (
    /\bwhat (should|can|do) i (eat|have)\b|\bwhat to eat\b|\bsuggest\b.*\b(eat|meal|food|snack|dinner|lunch|breakfast)\b|\bkya khau?n?\b|\bkya khana\b/.test(t)
  )
    return "what_to_eat";
  if (/\b(how s|hows|how is|how am i doing)\b|\btoday s (numbers|progress)\b|\baaj kaisa\b|\bkitna (bacha|baaki)\b|\bhow much (is )?left\b/.test(t))
    return "today";
  return null;
}

/** Words a records question uses around the exercise ("what's my bench PR" → "bench"). */
const RECORD_WORDS =
  /\b(what|whats|s|is|was|are|my|the|a|an|pr|prs|personal|best|bests|record|records|max|1rm|one|rep|on|in|for|of|at|show|me|tell|did|i|hit|get|got|set|any|new|today|ever|current|kya|hai|mera|meri)\b/g;

/** The exercise an offline records question names, or none ("any new PRs today?"). */
export function localRecordAbout(text: string): string | undefined {
  const rest = normalize(text).replace(RECORD_WORDS, " ").replace(/\s+/g, " ").trim();
  return rest || undefined;
}

/** The meal an offline food question names ("what should I have for dinner"), or none. */
export function localMealType(text: string): MealType | undefined {
  const t = normalize(text);
  if (/\b(breakfast|nashta|nashte)\b/.test(t)) return "breakfast";
  if (/\b(lunch|dopahar)\b/.test(t)) return "lunch";
  if (/\b(snack|snacks)\b/.test(t)) return "snack";
  if (/\b(dinner|raat)\b/.test(t)) return "dinner";
  return undefined;
}
