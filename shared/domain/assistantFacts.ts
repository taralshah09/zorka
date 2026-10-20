// AB5 · Facts for the Assistant Bar's questions (docs/ASSISTANT_BAR_PLAN.md "Two-way: answering questions", D90).
// Pure domain logic shared by mobile and backend (D24). Every number Zorka may say about the user comes from here,
// built from data the phone already has. The server's phrasing step words these facts in the persona's voice and the
// grounding check (assistant.ts numbersGrounded) rejects any number that isn't in `numbers`. Offline, the phone shows
// `lines` as they are (template phrasing, D98).
import { OFFLINE_ANSWER_LINE, type AskTopic } from "./assistant.js";
import type { DayType } from "./dayType.js";
import type { MealType } from "./food.js";
import { matchScore, MIN_MATCH_SCORE } from "./foodMatch.js";
import type { ExerciseType } from "./gym.js";

/** A day counts as on target when calories land within this share of the target… */
export const ON_TARGET_KCAL_SHARE = 0.1;
/** …and protein reaches this share of its target. */
export const ON_TARGET_PROTEIN_SHARE = 0.9;

export type DayFactsInput = {
  targetKcal: number;
  eatenKcal: number;
  targetProteinG: number;
  eatenProteinG: number;
  steps: number | null;
  stepGoal: number;
  glasses: number | null;
  waterGoal: number | null;
  workoutToday: boolean;
  mealsLogged: number;
  /** How complete today's records are (evidence.ts). Not "complete" → numbers are what's logged so far. */
  coverage: "complete" | "partial" | "unknown" | "pending";
};

/** One day of this week. `kcal` / `proteinG` null = not logged (or not counted). */
export type WeekFactDay = {
  date: string;
  kcal: number | null;
  proteinG: number | null;
  targetKcal: number;
  targetProteinG: number;
  trained: boolean;
};

export type AssistantFactsInput = {
  today: string;
  day: DayFactsInput;
  streak?: { current: number; best: number; atRisk: boolean } | null;
  week?: { days: WeekFactDay[]; sessionsDone: number; sessionsTarget: number } | null;
  trend?: { trendKg: number | null; weeklyChangeKg: number | null; weighIns: number } | null;
  plan?: { dayType: DayType; kcal: number; proteinG: number; steps: number | null; items: string[]; why: string[] } | null;
  /** Food ideas for the next meal: the plan's ranked options, else the food ideas screen's ranking for what's left. */
  eat?: EatIdea[] | null;
  /** Which meal `eat` is for. Missing from an older app. */
  eatFor?: MealType | null;
  /** Ideas for each meal still to come today ("what should I have for dinner"). */
  eatBySlot?: Partial<Record<MealType, EatIdea[]>> | null;
  /** Meals logged today and yesterday, oldest first ("what did I have for lunch?"). */
  meals?: LoggedMealFact[] | null;
  /** Bests per exercise from this phone's logged sets, most recently trained first ("what's my bench PR?"). */
  records?: RecordFact[] | null;
};

export type EatIdea = { name: string; kcal: number; proteinG: number };
export type LoggedMealFact = { date: string; mealType: MealType; text: string; kcal: number; proteinG: number };

/** How many exercises' records the phone sends: the most recently trained ones. */
export const RECORDS_MAX = 40;

/** One exercise's records. Set texts are code-written ("80 kg × 5", gym.ts formatSet), so their numbers are facts. */
export type RecordFact = {
  exerciseId: string;
  name: string;
  aliases: string[];
  type: ExerciseType;
  /** The best set ever (gym.ts topSet). */
  best: string;
  /** Estimated one-rep max, weight + reps exercises only. */
  e1rmKg: number | null;
  /** The latest set that set a record, and the day it was done. */
  lastPr: { set: string; date: string } | null;
};

export type AnswerCard =
  | { kind: "today_rings"; kcal: [number, number]; proteinG: [number, number]; steps: [number, number] | null }
  | { kind: "week_bars"; days: { date: string; kcal: number | null; target: number; onTarget: boolean | null }[] }
  | { kind: "trend_line"; trendKg: number | null; weeklyChangeKg: number | null }
  | { kind: "plan_preview"; dayType: DayType; kcal: number; proteinG: number; items: string[] }
  /** A records answer about one exercise: the phone offers its page (history, chart, 3/6/12-month comparison). */
  | { kind: "exercise_record"; exerciseId: string; name: string };

export type AnswerFacts = {
  topic: AskTopic;
  /** The day the answer is about ("and yesterday?"). */
  date: string;
  /** false: the phone doesn't have what's needed (no weigh-ins, no plan yet); `lines` says so. */
  known: boolean;
  /** Template sentences, 1–3 of them. Shown as-is offline or when the phrased reply fails a check. */
  lines: string[];
  /** Every number the phrasing step may use. */
  numbers: number[];
  card: AnswerCard | null;
};

const r = Math.round;
/** "1,612". Plain thousands commas, so it reads the same with or without Intl on the phone. */
const fmt = (n: number) => String(r(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const kg = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayName = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]!;

const DAY_TYPE_WORDS: Record<DayType, string> = {
  normal: "a usual",
  busy: "a busy",
  away: "an away",
  travel: "a travel",
  late_work: "a late-work",
  feast: "a feast",
  exam: "an exam",
  sick: "a lighter, sick",
  rest: "a rest",
};

/** On target, off target, or null when the day wasn't logged. */
export function onTarget(d: WeekFactDay): boolean | null {
  if (d.kcal === null || d.proteinG === null) return null;
  const kcalOk = Math.abs(d.kcal - d.targetKcal) <= d.targetKcal * ON_TARGET_KCAL_SHARE;
  return kcalOk && d.proteinG >= d.targetProteinG * ON_TARGET_PROTEIN_SHARE;
}

const unknown = (topic: AskTopic, date: string, line: string): AnswerFacts => ({
  topic,
  date,
  known: false,
  lines: [line],
  numbers: [],
  card: null,
});

function todayAnswer(input: AssistantFactsInput, date: string): AnswerFacts {
  if (date !== input.today) {
    const d = input.week?.days.find((x) => x.date === date);
    if (!d || d.kcal === null || d.proteinG === null)
      return unknown("today", date, `I don't have ${weekdayName(date)}'s meals logged.`);
    const hit = onTarget(d);
    return {
      topic: "today",
      date,
      known: true,
      lines: [
        `${weekdayName(date)}: ${fmt(d.kcal)} of ${fmt(d.targetKcal)} kcal and ${fmt(d.proteinG)} of ${fmt(d.targetProteinG)} g protein.`,
        hit ? "That day was on target." : "That day was off target.",
      ],
      numbers: [d.kcal, d.targetKcal, d.proteinG, d.targetProteinG].map(r),
      card: null,
    };
  }
  const t = input.day;
  const kcalLeft = t.targetKcal - t.eatenKcal;
  const proteinLeft = Math.max(0, t.targetProteinG - t.eatenProteinG);
  const lines = [
    `You've had ${fmt(t.eatenKcal)} of ${fmt(t.targetKcal)} kcal and ${fmt(t.eatenProteinG)} of ${fmt(t.targetProteinG)} g protein today.`,
  ];
  const numbers = [t.eatenKcal, t.targetKcal, t.eatenProteinG, t.targetProteinG, Math.abs(kcalLeft), proteinLeft];
  if (kcalLeft >= 0 && proteinLeft > 0) lines.push(`That leaves ${fmt(kcalLeft)} kcal and ${fmt(proteinLeft)} g protein.`);
  else if (kcalLeft < 0) lines.push(`That's ${fmt(-kcalLeft)} kcal over; no need to make it up.`);
  if (t.steps !== null) {
    lines.push(`${fmt(t.steps)} of ${fmt(t.stepGoal)} steps.`);
    numbers.push(t.steps, t.stepGoal);
  }
  if (t.coverage !== "complete") lines.push("Some meals may not be logged yet.");
  return {
    topic: "today",
    date,
    known: true,
    lines: lines.slice(0, 3),
    numbers: numbers.map(r),
    card: {
      kind: "today_rings",
      kcal: [r(t.eatenKcal), r(t.targetKcal)],
      proteinG: [r(t.eatenProteinG), r(t.targetProteinG)],
      steps: t.steps === null ? null : [r(t.steps), r(t.stepGoal)],
    },
  };
}

function weekAnswer(input: AssistantFactsInput): AnswerFacts {
  const w = input.week;
  const counted = (w?.days ?? []).filter((d) => d.date < input.today && onTarget(d) !== null);
  if (!w || !counted.length) return unknown("week", input.today, "There aren't any logged days this week yet.");
  const hits = counted.filter((d) => onTarget(d)).length;
  const avg = (k: "kcal" | "proteinG") => r(counted.reduce((s, d) => s + (d[k] ?? 0), 0) / counted.length);
  const avgTarget = (k: "targetKcal" | "targetProteinG") => r(counted.reduce((s, d) => s + d[k], 0) / counted.length);
  const protein = avg("proteinG");
  const proteinTarget = avgTarget("targetProteinG");
  const kcal = avg("kcal");
  const kcalTarget = avgTarget("targetKcal");
  const lines = [`${hits} of ${counted.length} days on target so far.`];
  const proteinShare = proteinTarget ? protein / proteinTarget : 1;
  const kcalOff = kcalTarget ? Math.abs(kcal - kcalTarget) / kcalTarget : 0;
  if (proteinShare < ON_TARGET_PROTEIN_SHARE && 1 - proteinShare >= kcalOff)
    lines.push(`Protein's been your weak spot (avg ${fmt(protein)} of ${fmt(proteinTarget)} g).`);
  else if (kcalOff > ON_TARGET_KCAL_SHARE)
    lines.push(`Calories have been ${kcal > kcalTarget ? "over" : "under"} (avg ${fmt(kcal)} of ${fmt(kcalTarget)} kcal).`);
  else lines.push(`Averages: ${fmt(kcal)} kcal and ${fmt(protein)} g protein a day.`);
  lines.push(`${w.sessionsDone} of ${w.sessionsTarget} workouts done.`);
  return {
    topic: "week",
    date: input.today,
    known: true,
    lines,
    numbers: [hits, counted.length, protein, proteinTarget, kcal, kcalTarget, w.sessionsDone, w.sessionsTarget],
    card: {
      kind: "week_bars",
      days: w.days.map((d) => ({ date: d.date, kcal: d.kcal === null ? null : r(d.kcal), target: r(d.targetKcal), onTarget: onTarget(d) })),
    },
  };
}

function trendAnswer(input: AssistantFactsInput): AnswerFacts {
  const t = input.trend;
  if (!t || t.trendKg === null || t.weighIns < 2)
    return unknown("trend", input.today, "I need a couple more weigh-ins before I can read a trend.");
  const lines = [`Your trend weight is ${kg(t.trendKg)} kg.`];
  const numbers = [Math.round(t.trendKg * 10) / 10, t.weighIns];
  if (t.weeklyChangeKg !== null) {
    const change = Math.round(Math.abs(t.weeklyChangeKg) * 10) / 10;
    lines.push(change < 0.1 ? "It's held steady this week." : `It's ${t.weeklyChangeKg < 0 ? "down" : "up"} ${kg(change)} kg this week.`);
    numbers.push(change);
  }
  return { topic: "trend", date: input.today, known: true, lines, numbers, card: { kind: "trend_line", trendKg: t.trendKg, weeklyChangeKg: t.weeklyChangeKg } };
}

function streakAnswer(input: AssistantFactsInput): AnswerFacts {
  const s = input.streak;
  if (!s) return unknown("streak", input.today, "I can't see your streak right now.");
  const lines = [s.current > 0 ? `You're on a ${s.current}-day streak (best ${s.best}).` : `No streak running right now (best ${s.best}).`];
  if (s.atRisk) lines.push("Log anything today to keep it going.");
  return { topic: "streak", date: input.today, known: true, lines, numbers: [s.current, s.best], card: null };
}

function planAnswer(input: AssistantFactsInput, why: boolean): AnswerFacts {
  const p = input.plan;
  const topic: AskTopic = why ? "why" : "plan";
  if (!p) return unknown(topic, input.today, "There's no plan for today yet.");
  const head = `Today is ${DAY_TYPE_WORDS[p.dayType]} day: ${fmt(p.kcal)} kcal and ${fmt(p.proteinG)} g protein.`;
  const numbers = [p.kcal, p.proteinG, ...(p.steps === null ? [] : [p.steps])];
  const lines = why ? [head, ...(p.why.length ? p.why.slice(0, 2) : ["Nothing moved; these are your usual numbers."])] : [head, ...p.items.slice(0, 2)];
  // Plan items and why-lines are code-written ("Lunch 1:30pm"); their numbers count as facts too.
  for (const line of lines.slice(1)) for (const m of line.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) numbers.push(Number(m.replace(/,/g, "")));
  return {
    topic,
    date: input.today,
    known: true,
    lines,
    numbers: numbers.map((n) => Math.round(n * 10) / 10),
    card: { kind: "plan_preview", dayType: p.dayType, kcal: r(p.kcal), proteinG: r(p.proteinG), items: p.items.slice(0, 4) },
  };
}

const MEAL_NAME: Record<MealType, string> = { breakfast: "breakfast", lunch: "lunch", snack: "a snack", dinner: "dinner" };
const MEAL_TITLE: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };

/** "What should I eat (for dinner)?": what's left today, then up to three ideas that fit it, with their numbers. */
function eatAnswer(input: AssistantFactsInput, mealType?: MealType): AnswerFacts {
  const t = input.day;
  const proteinLeft = Math.max(0, r(t.targetProteinG - t.eatenProteinG));
  const kcalLeft = r(t.targetKcal - t.eatenKcal);
  const slot = mealType ?? input.eatFor ?? null;
  const options = ((mealType ? input.eatBySlot?.[mealType] : null) ?? (mealType && mealType !== input.eatFor ? [] : input.eat) ?? []).slice(0, 3);
  const forWords = slot ? ` for ${MEAL_NAME[slot]}` : "";
  if (kcalLeft <= 0) {
    // At or over the day's calories: no ideas to eat more, and no "make it up" either.
    const lines = [`You've had ${fmt(t.eatenKcal)} of ${fmt(t.targetKcal)} kcal today, so you're at your target.`];
    const numbers = [t.eatenKcal, t.targetKcal];
    if (proteinLeft > 0) {
      lines.push(`If you're hungry, keep it light and high in protein: ${fmt(proteinLeft)} g protein is still to go.`);
      numbers.push(proteinLeft);
    }
    return { topic: "what_to_eat", date: input.today, known: true, lines, numbers: numbers.map(r), card: null };
  }
  const left = `You have ${fmt(kcalLeft)} kcal and ${fmt(proteinLeft)} g protein left.`;
  if (!options.length)
    return { ...unknown("what_to_eat", input.today, `${left} I don't have ideas${forWords} yet; the food ideas screen can search more.`), numbers: [kcalLeft, proteinLeft] };
  return {
    topic: "what_to_eat",
    date: input.today,
    known: true,
    lines: [left, `Good fits${forWords}: ${options.map((o) => `${o.name} (${fmt(o.kcal)} kcal, ${fmt(o.proteinG)} g protein)`).join(", ")}.`],
    numbers: [kcalLeft, proteinLeft, ...options.flatMap((o) => [r(o.kcal), r(o.proteinG)])],
    card: null,
  };
}

/** "What did I have for lunch / today / yesterday?": the logged meals in words, from the phone's own records. */
function mealsAnswer(input: AssistantFactsInput, date: string, mealType?: MealType): AnswerFacts {
  const day = date === input.today ? "today" : weekdayName(date);
  const meals = (input.meals ?? []).filter((m) => m.date === date && (!mealType || m.mealType === mealType));
  if (!input.meals) return unknown("meals", date, "I can't see your meals from here. Open the day view.");
  if (!meals.length) return unknown("meals", date, `You haven't logged ${mealType ? MEAL_NAME[mealType] : "any meals"} ${day}.`);
  const numbers: number[] = [];
  const parts = meals.map((m) => {
    numbers.push(r(m.kcal), r(m.proteinG));
    // Food names are the user's own records; a number in one ("7 Up") is a fact too.
    for (const n of m.text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) numbers.push(Number(n.replace(/,/g, "")));
    return `${MEAL_TITLE[m.mealType]}: ${m.text} (${fmt(m.kcal)} kcal)`;
  });
  const lines = [`${parts.slice(0, 4).join("; ")}.`];
  if (meals.length > 1) {
    const kcal = meals.reduce((s, m) => s + m.kcal, 0);
    const protein = meals.reduce((s, m) => s + m.proteinG, 0);
    lines.push(`That's ${fmt(kcal)} kcal and ${fmt(protein)} g protein ${day}.`);
    numbers.push(r(kcal), r(protein));
  }
  return { topic: "meals", date, known: true, lines, numbers, card: null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Oct", or "today". */
const shortDay = (date: string, today: string) =>
  date === today ? "today" : `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** Every number in code-written lines (set texts, dates) may be said back. */
const numbersIn = (lines: readonly string[]) =>
  lines.flatMap((l) => (l.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((m) => Number(m.replace(/,/g, ""))));

/** The logged exercise some words mean ("bench" → Barbell Bench Press), or null. */
export function recordFor(records: readonly RecordFact[], about: string): RecordFact | null {
  let best: { r: RecordFact; score: number } | null = null;
  for (const r of records) {
    const score = matchScore(about, { name: r.name, aliases: r.aliases });
    if (score >= MIN_MATCH_SCORE && (!best || score > best.score)) best = { r, score };
  }
  return best?.r ?? null;
}

/**
 * "What's my bench PR?" (`about`: the exercise words): that exercise's best set, estimated max and latest record.
 * "Did I hit a PR today?" / "my PRs" (no `about`): today's new records, else the latest ones.
 */
function recordsAnswer(input: AssistantFactsInput, about?: string): AnswerFacts {
  const today = input.today;
  const records = input.records;
  if (!records) return unknown("records", today, "I can't see your workouts from here. Open Train for your records.");
  if (about) {
    const r = recordFor(records, about);
    if (!r) return unknown("records", today, `I don't see "${about}" in your workouts yet. Log it once and its records show up.`);
    const lines = [`Your best ${r.name}: ${r.best}.`];
    if (r.e1rmKg !== null) lines.push(`That puts your estimated one-rep max at ${kg(r.e1rmKg)} kg.`);
    if (r.lastPr) lines.push(`Your latest record was ${r.lastPr.set}, ${shortDay(r.lastPr.date, today)}.`);
    return { topic: "records", date: today, known: true, lines, numbers: numbersIn(lines), card: { kind: "exercise_record", exerciseId: r.exerciseId, name: r.name } };
  }
  const withPr = records.filter((r) => r.lastPr).sort((a, b) => b.lastPr!.date.localeCompare(a.lastPr!.date));
  if (!withPr.length) return unknown("records", today, "No records yet. Log a few workouts and your bests show up here.");
  const fresh = withPr.filter((r) => r.lastPr!.date === today);
  const list = (fresh.length ? fresh : withPr).slice(0, 3);
  const items = list.map((r) => `${r.name} ${r.lastPr!.set}${fresh.length ? "" : ` (${shortDay(r.lastPr!.date, today)})`}`);
  const lines = fresh.length
    ? [`New record${fresh.length === 1 ? "" : "s"} today: ${items.join(", ")}.`]
    : ["No new records today.", `Your latest: ${items.join(", ")}.`];
  const card = list.length === 1 ? { kind: "exercise_record" as const, exerciseId: list[0]!.exerciseId, name: list[0]!.name } : null;
  return { topic: "records", date: today, known: true, lines, numbers: numbersIn(lines), card };
}

/** One food of a food_fit question, as the server's food parser read it. `name` null: not found. */
export type FitFood = { heard: string; name: string | null; amount: string | null; kcal: number; proteinG: number };

/** Below this share of the protein still to go, a food_fit answer suggests a protein side. */
export const FIT_LOW_PROTEIN_SHARE = 0.3;
/** …but only when at least this much protein is still to go. */
export const FIT_PROTEIN_SIDE_MIN_G = 15;

/**
 * "Would dal and rice be ok for lunch?": the food's numbers (the server's food parser) against what's left today.
 * Without parsed foods (offline, the phone has no parser) it waits for the server.
 */
export function foodFitFacts(input: AssistantFactsInput, words: string, foods: readonly FitFood[] | null): AnswerFacts {
  const today = input.today;
  if (!words.trim()) return unknown("food_fit", today, "Tell me the food and I'll check it against what you have left today.");
  if (!foods) return unknown("food_fit", today, OFFLINE_ANSWER_LINE);
  const found = foods.filter((f) => f.name);
  if (!found.length) return unknown("food_fit", today, `I couldn't find "${words}" in the food list, so I can't size it up. Try naming the foods one by one.`);
  const kcal = r(found.reduce((s, f) => s + f.kcal, 0));
  const protein = r(found.reduce((s, f) => s + f.proteinG, 0));
  const t = input.day;
  const kcalLeft = r(t.targetKcal - t.eatenKcal);
  const proteinLeft = Math.max(0, r(t.targetProteinG - t.eatenProteinG));
  const missing = foods.filter((f) => !f.name).map((f) => `"${f.heard}"`);
  const what = found.map((f) => `${f.name!.toLowerCase()}${f.amount ? ` (${f.amount})` : ""}`).join(" and ");
  const lines = [`${what} comes to about ${fmt(kcal)} kcal and ${fmt(protein)} g protein${missing.length ? `; I couldn't find ${missing.join(", ")}` : ""}.`];
  if (kcalLeft <= 0) lines.push(`You've had ${fmt(t.eatenKcal)} of ${fmt(t.targetKcal)} kcal today, so it would put you ${fmt(kcal - kcalLeft)} kcal over. A smaller portion fits better if you're hungry.`);
  else if (kcal <= kcalLeft) lines.push(`It fits: you have ${fmt(kcalLeft)} kcal left, and it leaves ${fmt(kcalLeft - kcal)}.`);
  else lines.push(`That's ${fmt(kcal - kcalLeft)} kcal more than the ${fmt(kcalLeft)} you have left, so a smaller portion fits better.`);
  if (proteinLeft <= 0) lines.push("Your protein is already covered today.");
  else if (protein >= proteinLeft) lines.push(`It covers the ${fmt(proteinLeft)} g protein you still need.`);
  else if (protein < proteinLeft * FIT_LOW_PROTEIN_SHARE && proteinLeft >= FIT_PROTEIN_SIDE_MIN_G)
    lines.push(`It's light on protein for the ${fmt(proteinLeft)} g still to go: add curd, paneer, eggs or chicken on the side.`);
  else lines.push(`It covers ${fmt(protein)} of the ${fmt(proteinLeft)} g protein you still need.`);
  return { topic: "food_fit", date: today, known: true, lines, numbers: numbersIn(lines), card: null };
}

/**
 * What an `advice` answer may lean on: today's numbers, the plan, this week's workouts and recent lifts, as
 * code-written lines. Every number in the advice must be one of `numbers`.
 */
export function adviceGrounds(input: AssistantFactsInput): { lines: string[]; numbers: number[] } {
  const t = input.day;
  const lines = [...todayAnswer(input, input.today).lines.filter((l) => !l.startsWith("Some meals"))];
  lines.push(t.workoutToday ? "They've logged a workout today." : "No workout logged today.");
  if (input.plan) lines.push(`Today is ${DAY_TYPE_WORDS[input.plan.dayType]} day.`);
  const w = input.week;
  if (w) {
    const trained = w.days.filter((d) => d.trained && d.date < input.today).map((d) => weekdayName(d.date));
    lines.push(`${w.sessionsDone} of ${w.sessionsTarget} workouts done this week${trained.length ? ` (trained ${trained.join(", ")})` : ""}.`);
  }
  const recent = (input.records ?? []).slice(0, 5).map((x) => x.name);
  if (recent.length) lines.push(`Exercises trained most recently: ${recent.join(", ")}.`);
  return { lines, numbers: numbersIn(lines) };
}

/**
 * The facts for one question. `date` defaults to today; `today` and `meals` read another day ("and yesterday?").
 * `mealType` narrows a food question to one meal; `about` names the exercise of a records question.
 */
export function answerFacts(
  topic: AskTopic,
  input: AssistantFactsInput,
  date?: string,
  mealType?: MealType,
  about?: string,
): AnswerFacts {
  switch (topic) {
    case "today":
      return todayAnswer(input, date ?? input.today);
    case "week":
      return weekAnswer(input);
    case "trend":
      return trendAnswer(input);
    case "streak":
      return streakAnswer(input);
    case "plan":
      return planAnswer(input, false);
    case "why":
      return planAnswer(input, true);
    case "what_to_eat":
      return eatAnswer(input, mealType);
    case "meals":
      return mealsAnswer(input, date ?? input.today, mealType);
    case "records":
      return recordsAnswer(input, about);
    // Both need the server: the food parser for food_fit, a written answer for advice.
    case "food_fit":
      return foodFitFacts(input, about ?? "", null);
    case "advice":
      return unknown("advice", input.today, OFFLINE_ANSWER_LINE);
  }
}

/** The template answer: the facts' own sentences, at most three. */
export const answerText = (a: AnswerFacts): string => a.lines.slice(0, 3).join(" ");

/** D98 · Topics the phone can answer offline from local data. Others wait for the server. */
export const OFFLINE_TOPICS: readonly AskTopic[] = ["today", "streak", "plan", "why", "week", "trend", "what_to_eat", "meals", "records"];
