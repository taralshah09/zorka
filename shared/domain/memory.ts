// LA5 · The memory layer (docs/LIFE_PLAN.md "memory.ts", D78). What Zorka has learned about this person's life, one fact
// per key. `inferFacts` reads the last 28 days of logs on the phone once a day; `mergeFacts` turns that into changes and
// never touches a fact the user set or dismissed. Only `active` facts feed the planner (`activeFacts`).
// Pure domain logic shared by mobile and backend (D24); "today" is passed in.
//
// Constants are proposals at the LA5 gate. Changing any of them is a product decision.
import type { MealType } from "./food.js";

export type FactKind = "constraint" | "pattern" | "preference" | "event";
export type FactSource = "onboarding" | "brief" | "chat" | "inferred" | "user";
export type FactStatus = "suggested" | "active" | "dismissed";
export type FactEvidence = { count: number; window: number; lastSeen: string };

export type MemoryFact = {
  id: string;
  key: string;
  kind: FactKind;
  value: unknown;
  text: string;
  source: FactSource;
  confidence: number;
  evidence: FactEvidence | null;
  status: FactStatus;
  validFrom: string | null;
  validUntil: string | null;
};

export type DayKind = "weekday" | "weekend";

export const FACT_KEYS = {
  usualMeal: (slot: MealType, dayKind: DayKind) => `usual_meal:${slot}:${dayKind}`,
  trainDays: "trains:days",
  trainTime: "trains:time",
  proteinShortfall: "protein:shortfall",
  wakeTime: "wake:time",
  waterTypical: "water:typical",
  /** "Start fresh": the week's earlier gaps were let go from `value.from` (valid for that Mon–Sun week only). */
  freshStart: "week:fresh_start",
  /** A fact the user asked the coach to remember (LA6 remember_fact). */
  note: (slug: string) => `note:${slug}`,
  /** D97 · A word the user corrected ("dahl" → "dal tadka"). Kind "preference", value AliasValue. Not shown to the coach. */
  alias: (heard: string) => `alias:${slugOf(heard)}`,
} as const;

const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "fact";

/** D97 · What an alias fact stores: the spoken form and what it means (a food or an exercise, by name and id). */
export type AliasValue = { heard: string; means: string; target: "food" | "exercise"; id: string | null };

/** Days of history the job reads. */
export const MEMORY_WINDOW_DAYS = 28;
/** A pattern needs at least this many matching days. */
export const MIN_EVIDENCE = 4;
/** Usual meals look at this many of the latest matching days (weekdays or weekends) that had that slot. */
export const USUAL_MEAL_LOOKBACK = 8;
/** Inferred facts at or above this confidence (with MIN_EVIDENCE) go active straight away, with a "learned" tag. */
export const AUTO_ACTIVE_CONFIDENCE = 0.8;
/** A protein day counts as short under this share of its target. */
export const PROTEIN_SHORT_SHARE = 0.8;
/** Evidence older than this many days lowers confidence. */
export const RECENT_DAYS = 7;
const STALE_FACTOR = 0.8;

export type LoggedMeal = { slot: MealType; at: number; key: string; text: string };
export type LoggedDay = {
  date: string;
  meals: LoggedMeal[];
  trainedAt: number | null;
  proteinG: number | null;
  proteinTargetG: number;
  glasses: number | null;
  /** Coverage of the day's records (evidence.ts); unknown days never count toward a shortfall. */
  coverage: "unknown" | "partial" | "complete" | "pending";
};
/** The last 28 days, any order. */
export type LogsWindow = { days: LoggedDay[] };

export type InferredFact = Pick<MemoryFact, "key" | "kind" | "value" | "text" | "confidence" | "evidence">;
export type FactChange = { type: "insert"; fact: InferredFact & { status: FactStatus } } | { type: "update"; id: string; patch: Partial<MemoryFact> };

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
};
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (date: string) => new Date(dayNumber(date) * DAY_MS).getUTCDay();
export const dayKindOf = (date: string): DayKind => (weekdayOf(date) % 6 === 0 ? "weekend" : "weekday");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
};
export const clockText = (minute: number) => {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const SLOT_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const WEEKDAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const round2 = (n: number) => Math.round(n * 100) / 100;

function confidence(count: number, of: number, lastSeen: string, today: string): number {
  const recent = dayNumber(today) - dayNumber(lastSeen) <= RECENT_DAYS ? 1 : STALE_FACTOR;
  return round2(Math.min(1, of > 0 ? count / of : 0) * recent);
}

/** Facts the last 28 days support. Each needs MIN_EVIDENCE matching days. */
export function inferFacts(logs: LogsWindow, today: string): InferredFact[] {
  const t = dayNumber(today);
  const days = logs.days
    .filter((d) => dayNumber(d.date) < t && t - dayNumber(d.date) <= MEMORY_WINDOW_DAYS)
    .sort((a, b) => dayNumber(b.date) - dayNumber(a.date)); // newest first
  const out: InferredFact[] = [];

  // Usual meals per slot and day kind.
  for (const dayKind of ["weekday", "weekend"] as const) {
    for (const slot of ["breakfast", "lunch", "snack", "dinner"] as const) {
      const matching = days
        .filter((d) => dayKindOf(d.date) === dayKind)
        .map((d) => ({ date: d.date, meal: d.meals.find((m) => m.slot === slot) }))
        .filter((x): x is { date: string; meal: LoggedMeal } => !!x.meal)
        .slice(0, USUAL_MEAL_LOOKBACK);
      const byKey = new Map<string, { date: string; meal: LoggedMeal }[]>();
      for (const x of matching) byKey.set(x.meal.key, [...(byKey.get(x.meal.key) ?? []), x]);
      const best = [...byKey.values()].sort((a, b) => b.length - a.length)[0];
      if (!best || best.length < MIN_EVIDENCE) continue;
      const at = median(best.map((x) => x.meal.at));
      const lastSeen = best[0]!.date;
      out.push({
        key: FACT_KEYS.usualMeal(slot, dayKind),
        kind: "pattern",
        value: { slot, dayKind, mealKey: best[0]!.meal.key, text: best[0]!.meal.text, at },
        text: `${SLOT_LABEL[slot]} on ${dayKind}s is usually ${best[0]!.meal.text} around ${clockText(at)}`,
        confidence: confidence(best.length, USUAL_MEAL_LOOKBACK, lastSeen, today),
        evidence: { count: best.length, window: MEMORY_WINDOW_DAYS, lastSeen },
      });
    }
  }

  // Training days and time.
  const trained = days.filter((d) => d.trainedAt != null);
  if (trained.length >= MIN_EVIDENCE) {
    const perWeekday = new Map<number, number>();
    for (const d of trained) perWeekday.set(weekdayOf(d.date), (perWeekday.get(weekdayOf(d.date)) ?? 0) + 1);
    const weeks = Math.max(1, Math.round(MEMORY_WINDOW_DAYS / 7));
    const usual = [...perWeekday.entries()].filter(([, n]) => n >= Math.ceil(weeks / 2)).map(([w]) => w).sort((a, b) => a - b);
    const lastSeen = trained[0]!.date;
    if (usual.length) {
      const hits = trained.filter((d) => usual.includes(weekdayOf(d.date))).length;
      out.push({
        key: FACT_KEYS.trainDays,
        kind: "pattern",
        value: { days: usual },
        text: `You usually train on ${usual.map((w) => WEEKDAY_NAME[w]).join(", ")}`,
        confidence: confidence(hits, usual.length * weeks, lastSeen, today),
        evidence: { count: hits, window: MEMORY_WINDOW_DAYS, lastSeen },
      });
    }
    const at = median(trained.map((d) => d.trainedAt!));
    const near = trained.filter((d) => Math.abs(d.trainedAt! - at) <= 90).length;
    out.push({
      key: FACT_KEYS.trainTime,
      kind: "pattern",
      value: { minute: at },
      text: `You usually train around ${clockText(at)}`,
      confidence: confidence(near, trained.length, lastSeen, today),
      evidence: { count: near, window: MEMORY_WINDOW_DAYS, lastSeen },
    });
  }

  // First meal of the day (stands in for wake time until there's sleep data).
  const firsts = days
    .map((d) => ({ date: d.date, at: d.meals.length ? Math.min(...d.meals.map((m) => m.at)) : null }))
    .filter((x): x is { date: string; at: number } => x.at != null);
  if (firsts.length >= MIN_EVIDENCE) {
    const at = median(firsts.map((x) => x.at));
    const near = firsts.filter((x) => Math.abs(x.at - at) <= 60).length;
    out.push({
      key: FACT_KEYS.wakeTime,
      kind: "pattern",
      value: { firstMealMinute: at },
      text: `Your first meal is usually around ${clockText(at)}`,
      confidence: confidence(near, firsts.length, firsts[0]!.date, today),
      evidence: { count: near, window: MEMORY_WINDOW_DAYS, lastSeen: firsts[0]!.date },
    });
  }

  // Protein shortfall on days with reasonably complete records.
  const recorded = days.filter((d) => d.proteinG != null && (d.coverage === "complete" || d.coverage === "partial"));
  const short = recorded.filter((d) => d.proteinG! < d.proteinTargetG * PROTEIN_SHORT_SHARE);
  if (short.length >= MIN_EVIDENCE) {
    const gap = Math.round(median(short.map((d) => d.proteinTargetG - d.proteinG!)));
    out.push({
      key: FACT_KEYS.proteinShortfall,
      kind: "pattern",
      value: { typicalShortG: gap },
      text: `Protein often ends about ${gap} g short`,
      confidence: confidence(short.length, recorded.length, short[0]!.date, today),
      evidence: { count: short.length, window: MEMORY_WINDOW_DAYS, lastSeen: short[0]!.date },
    });
  }

  // Typical water.
  const water = days.filter((d) => d.glasses != null && d.glasses > 0);
  if (water.length >= MIN_EVIDENCE) {
    const glasses = Math.round(median(water.map((d) => d.glasses!)));
    out.push({
      key: FACT_KEYS.waterTypical,
      kind: "pattern",
      value: { glasses },
      text: `You usually drink about ${glasses} glasses of water`,
      confidence: confidence(water.length, days.length, water[0]!.date, today),
      evidence: { count: water.length, window: MEMORY_WINDOW_DAYS, lastSeen: water[0]!.date },
    });
  }
  return out;
}

const qualifies = (f: Pick<InferredFact, "confidence" | "evidence">) =>
  f.confidence >= AUTO_ACTIVE_CONFIDENCE && (f.evidence?.count ?? 0) >= MIN_EVIDENCE;

/**
 * Changes that bring stored facts in line with what was inferred. One row per key: an inferred row is updated in
 * place (and may go active once it qualifies); a `user` or `chat` row, or any dismissed row, is never touched, so a
 * dismissed fact never comes back. Facts that are no longer inferred are left as they are.
 */
export function mergeFacts(existing: readonly MemoryFact[], inferred: readonly InferredFact[]): FactChange[] {
  const byKey = new Map(existing.map((f) => [f.key, f]));
  const out: FactChange[] = [];
  for (const f of inferred) {
    const old = byKey.get(f.key);
    if (!old) {
      out.push({ type: "insert", fact: { ...f, status: qualifies(f) ? "active" : "suggested" } });
      continue;
    }
    if (old.status === "dismissed" || old.source !== "inferred") continue;
    const status: FactStatus = old.status === "suggested" && qualifies(f) ? "active" : old.status;
    const same =
      JSON.stringify(old.value) === JSON.stringify(f.value) && old.confidence === f.confidence && old.status === status;
    if (same) continue;
    out.push({ type: "update", id: old.id, patch: { value: f.value, text: f.text, confidence: f.confidence, evidence: f.evidence, status } });
  }
  return out;
}

/** What the planner and the coach read: active facts only, typed. Event facts count only inside their dates. */
export type ActiveFacts = {
  usualMeals: Record<DayKind, Partial<Record<MealType, { text: string; at: number; mealKey: string }>>>;
  trainDays: number[] | null;
  trainMinute: number | null;
  firstMealMinute: number | null;
  waterGlasses: number | null;
  proteinShortG: number | null;
  /** This week was started fresh: days before this date count as on target (week.ts `freshLedger`). */
  freshFrom: string | null;
  /** Short texts for the coach (≤ 8 in DayContext), newest first. */
  texts: string[];
};

export const NO_FACTS: ActiveFacts = {
  usualMeals: { weekday: {}, weekend: {} },
  trainDays: null,
  trainMinute: null,
  firstMealMinute: null,
  waterGlasses: null,
  proteinShortG: null,
  freshFrom: null,
  texts: [],
};

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function activeFacts(facts: readonly MemoryFact[], today: string): ActiveFacts {
  const out: ActiveFacts = { ...NO_FACTS, usualMeals: { weekday: {}, weekend: {} }, texts: [] };
  for (const f of facts) {
    if (f.status !== "active") continue;
    if (f.validFrom && today < f.validFrom) continue;
    if (f.validUntil && today > f.validUntil) continue;
    // Aliases feed speech-to-text and matching (aliasesFrom), not the coach's list of what Zorka knows.
    if (f.key.startsWith("alias:")) continue;
    out.texts.push(f.text);
    const v = obj(f.value);
    const m = /^usual_meal:(breakfast|lunch|snack|dinner):(weekday|weekend)$/.exec(f.key);
    if (m && typeof v.text === "string" && num(v.at) != null)
      out.usualMeals[m[2] as DayKind][m[1] as MealType] = { text: v.text, at: num(v.at)!, mealKey: String(v.mealKey ?? "") };
    else if (f.key === FACT_KEYS.trainDays && Array.isArray(v.days))
      out.trainDays = v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
    else if (f.key === FACT_KEYS.trainTime) out.trainMinute = num(v.minute);
    else if (f.key === FACT_KEYS.wakeTime) out.firstMealMinute = num(v.firstMealMinute);
    else if (f.key === FACT_KEYS.waterTypical) out.waterGlasses = num(v.glasses);
    else if (f.key === FACT_KEYS.proteinShortfall) out.proteinShortG = num(v.typicalShortG);
    else if (f.key === FACT_KEYS.freshStart && typeof v.from === "string") out.freshFrom = v.from;
  }
  return out;
}

/** A stable key for a fact the user asked to remember: "note:" + a slug of its text. */
export const noteKey = (text: string) => FACT_KEYS.note(slugOf(text));

/** D97 · The user's active aliases, newest first, for the vocabulary hint and for matching before the AI runs. */
export function aliasesFrom(facts: readonly MemoryFact[]): { heard: string; means: string }[] {
  return facts
    .filter((f) => f.status === "active" && f.key.startsWith("alias:"))
    .map((f) => obj(f.value))
    .filter((v) => typeof v.heard === "string" && typeof v.means === "string" && v.heard.trim() && v.means.trim())
    .map((v) => ({ heard: String(v.heard).trim(), means: String(v.means).trim() }))
    .reverse();
}

/** D97 · The fact saved when the user fixes a mis-heard word. Same `heard` again updates the same fact (one per key). */
export function aliasFact(value: AliasValue): Pick<MemoryFact, "key" | "kind" | "value" | "text" | "source" | "confidence" | "status"> {
  const heard = value.heard.trim().slice(0, 60);
  const means = value.means.trim().slice(0, 80);
  return {
    key: FACT_KEYS.alias(heard),
    kind: "preference",
    value: { ...value, heard, means },
    text: `When you say "${heard}" you mean ${means}.`,
    source: "user",
    confidence: 1,
    status: "active",
  };
}
