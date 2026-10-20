// AB5 · Facts for the Assistant Bar's questions (docs/ASSISTANT_BAR_PLAN.md "Two-way: answering questions", D90).
// Pure domain logic shared by mobile and backend (D24). Every number Zorka may say about the user comes from here,
// built from data the phone already has. The server's phrasing step words these facts in the persona's voice and the
// grounding check (assistant.ts numbersGrounded) rejects any number that isn't in `numbers`. Offline, the phone shows
// `lines` as they are (template phrasing, D98).
import type { AskTopic } from "./assistant.js";
import type { DayType } from "./dayType.js";

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
  eat?: { name: string; kcal: number; proteinG: number }[] | null;
};

export type AnswerCard =
  | { kind: "today_rings"; kcal: [number, number]; proteinG: [number, number]; steps: [number, number] | null }
  | { kind: "week_bars"; days: { date: string; kcal: number | null; target: number; onTarget: boolean | null }[] }
  | { kind: "trend_line"; trendKg: number | null; weeklyChangeKg: number | null }
  | { kind: "plan_preview"; dayType: DayType; kcal: number; proteinG: number; items: string[] };

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

function eatAnswer(input: AssistantFactsInput): AnswerFacts {
  const options = (input.eat ?? []).slice(0, 3);
  const t = input.day;
  const proteinLeft = Math.max(0, r(t.targetProteinG - t.eatenProteinG));
  const kcalLeft = r(t.targetKcal - t.eatenKcal);
  if (!options.length) return unknown("what_to_eat", input.today, "I don't have food ideas for right now. Try the food ideas screen.");
  return {
    topic: "what_to_eat",
    date: input.today,
    known: true,
    lines: [
      `You have ${fmt(Math.max(0, kcalLeft))} kcal and ${fmt(proteinLeft)} g protein left.`,
      `Good fits: ${options.map((o) => `${o.name} (${fmt(o.proteinG)} g protein)`).join(", ")}.`,
    ],
    numbers: [Math.max(0, kcalLeft), proteinLeft, ...options.flatMap((o) => [r(o.kcal), r(o.proteinG)])],
    card: null,
  };
}

/** The facts for one question. `date` defaults to today; only `today` reads another day ("and yesterday?"). */
export function answerFacts(topic: AskTopic, input: AssistantFactsInput, date?: string): AnswerFacts {
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
      return eatAnswer(input);
  }
}

/** The template answer: the facts' own sentences, at most three. */
export const answerText = (a: AnswerFacts): string => a.lines.slice(0, 3).join(" ");

/** D98 · Topics the phone can answer offline from local data. Others wait for the server. */
export const OFFLINE_TOPICS: readonly AskTopic[] = ["today", "streak", "plan", "why", "week", "trend"];
