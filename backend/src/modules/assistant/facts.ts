// AB2/AB5 · What a turn did and knows, in words and numbers (docs/ASSISTANT_BAR_PLAN.md steps 5–7). Each resolved
// action gets a template receipt line; `ask` gets its facts from shared/domain/assistantFacts.ts. The persona phrases
// a reply over these only, and every number in that reply must be one of `numbers` (numbersGrounded), else the template
// lines are sent instead.
import { clockText } from "../../../../shared/domain/memory.js";
import { UNIT_LABEL, type MealType } from "../../../../shared/domain/food.js";
import { CATEGORY_LABEL, formatSet } from "../../../../shared/domain/gym.js";
import { ACTIVITY_LABEL } from "../../../../shared/domain/activity.js";
import { OUT_OF_SCOPE_LINE } from "../../../../shared/domain/assistant.js";
import { PERSONA_PROMPTS } from "../coach/prompts.js";
import type { CoachId } from "../coach/coach.schemas.js";
import type { TurnItem } from "./assistant.schemas.js";

const r = Math.round;
const MEAL_WORD: Record<MealType, string> = { breakfast: "breakfast", lunch: "lunch", snack: "a snack", dinner: "dinner" };
const DAY_WORD: Record<string, string> = {
  normal: "a usual day",
  busy: "a busy day",
  away: "an away day",
  travel: "a travel day",
  late_work: "a late-work day",
  feast: "a feast day",
  exam: "an exam day",
  sick: "a lighter sick day",
  rest: "a rest day",
};
const SCREEN_WORD: Record<string, string> = {
  gap: "food ideas",
  move: "ways to move",
  quick_log: "quick log",
  log_weight: "weight log",
  progress: "progress",
  checkin: "this week's check-in",
  steps: "steps",
  record_walk: "the walk recorder",
  day: "today's numbers",
  share_day: "the share card",
  plan_tomorrow: "tomorrow's plan",
  menu_scan: "the menu scan",
};

const TARGET_WORD: Record<string, string> = { protein: "protein", kcal: "calories", steps: "steps" };
const TARGET_UNIT: Record<string, string> = { protein: " g", kcal: " kcal", steps: "" };

const qty = (q: number) => (Number.isInteger(q) ? String(q) : (Math.round(q * 10) / 10).toString());

/** "poha, 1 full plate (280 kcal)" for each matched item; unmatched ones by the words heard. */
function mealWords(item: TurnItem): { text: string; numbers: number[] } {
  if (item.resolved?.kind !== "meal") return { text: "", numbers: [] };
  const numbers: number[] = [];
  const parts = item.resolved.items.map((i) => {
    if (!i.food) return `"${i.query}" (not found)`;
    const unit = UNIT_LABEL[i.unit][i.quantity === 1 ? "one" : "many"];
    numbers.push(i.quantity, r(i.macros.kcal), r(i.macros.proteinG));
    return `${i.food.name.toLowerCase()}, ${qty(i.quantity)} ${unit} (${r(i.macros.kcal)} kcal)`;
  });
  const total = item.resolved.items.reduce((s, i) => s + i.macros.kcal, 0);
  numbers.push(r(total));
  return { text: parts.join("; "), numbers };
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The receipt line for one action and the numbers it may be phrased with. */
export function receipt(item: TurnItem, today: string): { line: string; numbers: number[] } {
  const a = item.action;
  const pending = item.tier === "approve";
  switch (a.kind) {
    case "log_meal": {
      const m = mealWords(item);
      if (item.tier === "ask") return { line: item.ask?.question ?? "What did you have?", numbers: m.numbers };
      if (!m.text) return { line: "I couldn't make out the food.", numbers: [] };
      const when = item.resolved?.kind === "meal" ? ` for ${MEAL_WORD[item.resolved.mealType]}` : "";
      return { line: pending ? `Check this before I log it${when}: ${m.text}.` : `Logged ${m.text}${when}.`, numbers: m.numbers };
    }
    case "plan_meal": {
      const m = mealWords(item);
      return { line: `${pending ? "Plan" : "Planned"} ${m.text || a.span} for ${MEAL_WORD[a.mealType]}${pending ? "?" : "."}`, numbers: m.numbers };
    }
    case "log_water":
      return {
        line: `${pending ? "Log" : "Logged"} ${a.glasses} glass${a.glasses === 1 ? "" : "es"} of water${pending ? "?" : "."}`,
        numbers: [a.glasses],
      };
    case "log_workout": {
      if (item.resolved?.kind !== "workout") return { line: `${pending ? "Log" : "Logged"} ${a.span}.`, numbers: [] };
      if (!item.resolved.sets.length)
        return item.resolved.usual
          ? { line: "Log your usual session as done?", numbers: [] }
          : { line: "Which exercises did you do?", numbers: [] };
      const numbers: number[] = [];
      const sets = item.resolved.sets.map((s) => {
        const name = s.exercise?.name ?? s.query;
        const values = s.exercise ? formatSet(s.exercise.type, s.values) : "";
        numbers.push(s.count, ...[s.values.weightKg, s.values.reps].filter((n): n is number => n !== null));
        return `${name}${values ? ` ${s.count > 1 ? `${s.count} × ` : ""}${values}` : ""}`;
      });
      return { line: `${pending ? "Check before I log" : "Logged"}: ${sets.join("; ")}.`, numbers };
    }
    case "start_activity":
      return { line: `${ACTIVITY_LABEL[a.activity]} started.`, numbers: [] };
    case "stop_activity":
      return { line: "Recording stopped.", numbers: [] };
    case "log_weight":
      return { line: pending ? `Log ${a.kg} kg? It's quite a change from last time.` : `Logged ${a.kg} kg.`, numbers: [a.kg] };
    case "set_day": {
      const day = a.date === today ? "today" : WEEKDAY[new Date(`${a.date}T00:00:00Z`).getUTCDay()]!;
      return { line: `I can make ${day} ${DAY_WORD[a.dayType] ?? "a different day"}. Tap OK and I'll re-plan it.`, numbers: [] };
    }
    case "set_target": {
      const day = a.date === today ? "today" : WEEKDAY[new Date(`${a.date}T00:00:00Z`).getUTCDay()]!;
      return {
        line: `Set ${day}'s ${TARGET_WORD[a.metric]} to ${a.value.toLocaleString("en-IN")}${TARGET_UNIT[a.metric]}? The days left this week pick up the difference. Tap OK.`,
        numbers: [a.value],
      };
    }
    case "remind_me": {
      const h = Math.floor(a.minute / 60);
      const m = a.minute % 60;
      return { line: `I'll remind you to ${a.what} at ${clockText(a.minute)}.`, numbers: [h % 12 === 0 ? 12 : h % 12, m] };
    }
    case "correct":
      return { line: `Changed it to ${a.span}.`, numbers: [] };
    case "undo":
      return { line: "Undid the last thing.", numbers: [] };
    case "delete_entry": {
      if (a.target === "reminder") return { line: `Cancel ${a.span ? `the "${a.span}" reminder` : "your next reminder"}? Tap OK.`, numbers: [] };
      if (a.target === "planned_meal")
        return { line: `Drop the ${a.mealType ? `${MEAL_WORD[a.mealType]} ` : ""}plan${a.date && a.date !== today ? ` for ${WEEKDAY[new Date(`${a.date}T00:00:00Z`).getUTCDay()]}` : ""}? Tap OK.`, numbers: [] };
      const day = !a.date || a.date === today ? "today" : "yesterday";
      const what =
        a.target === "meal"
          ? `your ${a.mealType ? MEAL_WORD[a.mealType] : "last meal"}`
          : a.target === "water"
            ? `${a.glasses ?? 1} glass${(a.glasses ?? 1) === 1 ? "" : "es"} of water`
            : a.target === "weight"
              ? "the weigh-in"
              : "the workout";
      return { line: `Delete ${what} from ${day}? Tap OK.`, numbers: a.glasses ? [a.glasses] : [] };
    }
    case "create_routine": {
      if (item.resolved?.kind !== "routine" || !item.resolved.exercises.length) return { line: "Which exercises go in it?", numbers: [] };
      const r = item.resolved;
      const numbers: number[] = [];
      const parts = r.exercises.map((e) => {
        numbers.push(e.targetSets, ...(e.targetReps === null ? [] : [e.targetReps]));
        return `${e.exercise.name} ${e.targetSets}${e.targetReps === null ? " sets" : `×${e.targetReps}`}`;
      });
      const missing = r.unmatched.length ? ` I couldn't find ${r.unmatched.map((u) => `"${u}"`).join(", ")}.` : "";
      return { line: `Save "${r.name}": ${parts.join(", ")}? Tap OK.${missing}`, numbers };
    }
    case "exercise_ref": {
      if (item.resolved?.kind !== "exercises") return { line: "", numbers: [] };
      const { matches, category, query } = item.resolved;
      const linked = matches.filter((m) => m.url);
      if (!matches.length) return { line: `I couldn't find "${query}" in your exercise list. You can search MuscleWiki for it.`, numbers: [] };
      if (matches.length === 1)
        return linked.length
          ? { line: `Here's ${matches[0]!.name} on MuscleWiki, with how to do it.`, numbers: [] }
          : { line: `${matches[0]!.name} has no MuscleWiki link yet. You can search MuscleWiki for it.`, numbers: [] };
      return { line: `${category ? CATEGORY_LABEL[category] : "Some"} exercises from your list: ${matches.map((m) => m.name).join(", ")}. Tap one to see it on MuscleWiki.`, numbers: [] };
    }
    case "edit_meal": {
      const meal = a.mealType ? MEAL_WORD[a.mealType] : "your last meal";
      const m = mealWords(item);
      if (a.mode === "remove") return { line: `Take ${a.span} out of ${meal}? Tap OK.`, numbers: [] };
      if (a.mode === "add") return { line: `Add ${m.text || a.span} to ${meal}? Tap OK.`, numbers: m.numbers };
      if (a.from) return { line: `Swap ${a.from} for ${m.text || a.span} in ${meal}? Tap OK.`, numbers: m.numbers };
      return { line: `Change ${meal} to ${m.text || a.span}? Tap OK.`, numbers: m.numbers };
    }
    case "set_amount": {
      const unit = a.unit ? ` ${UNIT_LABEL[a.unit][a.quantity === 1 ? "one" : "many"]}` : "";
      const meal = a.mealType ? MEAL_WORD[a.mealType] : "your last meal";
      const what = `${a.more ? `${qty(a.quantity)}${unit} more` : `${qty(a.quantity)}${unit}`}`;
      return { line: `Make ${a.food ?? "it"} in ${meal} ${what}? Tap OK.`, numbers: [a.quantity] };
    }
    case "open":
      return { line: `Opening ${SCREEN_WORD[a.screen] ?? "that"}.`, numbers: [] };
    case "clarify":
      return { line: a.question, numbers: [] };
    case "out_of_scope":
      return { line: OUT_OF_SCOPE_LINE, numbers: [] };
    case "ask": {
      if (item.resolved?.kind !== "answer") return { line: "", numbers: [] };
      return { line: item.resolved.lines.slice(0, 3).join(" "), numbers: item.resolved.numbers };
    }
  }
}

/** The fixed reply: every action's receipt, in order. Used offline-style when phrasing fails a check. */
export const templateReply = (items: readonly TurnItem[]): string =>
  items
    .map((i) => i.line)
    .filter(Boolean)
    .join(" ");

export const PHRASING_RULES = `You are writing Zorka's reply after the app acted on what the user said.
Rules:
- Say what was done and answer any question, using ONLY the FACTS lines. 1 to 3 short sentences, under 50 words.
- Never add a number, food, target or advice that isn't in FACTS. Keep every number exactly as written.
- Lines that ask for OK or a choice stay questions. Don't claim anything was done that FACTS says is waiting.
- Clean language, no markdown, no lists. You are an AI coach character, not a real person.
Reply with JSON only: {"reply":"..."}`;

export const phrasingSystem = (coach: CoachId) => `${PERSONA_PROMPTS[coach]}\n${PHRASING_RULES}`;

export const phrasingUser = (lines: readonly string[]) => `FACTS:\n${lines.map((l) => `- ${l}`).join("\n")}`;
