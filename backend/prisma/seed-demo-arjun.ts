// Demo history for Arjun (8 weeks, 2026-08-16 … 2026-10-10), so the progress features (P27–P30) can be tested
// on real-looking data: the weight trend, weekly check-ins, a closed phase with its summary, and the streak.
//
// Run: npm run db:seed:arjun      (writes)
//      npm run db:seed:arjun:dry  (computes and prints, writes nothing; also the default without --write)
//
// Idempotent and additive: every row has a stable id derived from its content key and is inserted with
// skipDuplicates, so a re-run changes nothing. Existing rows are never updated or deleted. The one exception is
// profile.onboarded_at, which moves back to the start of the history (only if it's later), because the app
// ignores phases and check-ins from before onboarding.
//
// v1 of this seed (ids under "kimbo-demo-arjun:") was written once and then soft-deleted (deleted_at set, so
// phones drop it through sync); this version uses the "kimbo-demo-arjun:v2:" id namespace.
//
// Everything is generated from a fixed PRNG seed. Days with no log at all (2026-08-26, 09-09, 09-16…18 and
// 09-30) give the streak screen freezes and one reset. Today's check-in (week 10-04 … 10-10) is left
// unanswered so S35 can be tested.
import { PrismaPg } from "@prisma/adapter-pg";

import { routeStats, type ActivityKind, type RoutePoint } from "../../shared/domain/activity.js";
import { applyOil, portion, type FoodNutrition, type FoodUnit, type Macros } from "../../shared/domain/food.js";
import { e1rm, prsForSequence, NO_BESTS, addToBests, type Bests, type ExerciseType } from "../../shared/domain/gym.js";
import {
  addDays,
  checkinWindow,
  datesBetween,
  phaseSummary,
  trendOn,
  trendSeries,
  weekday,
  type DayIntake,
  type TrendPoint,
} from "../../shared/domain/progress.js";
import { computeStreak } from "../../shared/domain/streak.js";
import { calculateTargets, weeklyCheckin, type Targets } from "../../shared/domain/targets.js";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { stableUuid } from "../src/lib/stableId.js";
import { exercisesFromRows } from "../src/modules/exercises/catalog.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import { EXERCISES } from "./data/exercises.js";
import { FOODS } from "./data/foods.js";

const USER_ID = "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22";
const START = "2026-08-16"; // a Sunday, 8 weeks before today
const END = "2026-10-10"; // the Saturday before today
const TODAY = "2026-10-11";
const ONBOARDED_AT = new Date("2026-08-16T09:00:00+05:30");
const MISSED = new Set(["2026-08-26", "2026-09-09", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-30"]);
/** Writes only with --write; anything else is a dry run. */
const DRY_RUN = !process.argv.includes("--write");

/** v2: the first run (v1, 2026-10-11) was soft-deleted and replaced; see the note at the top. */
const id = (key: string) => stableUuid(`kimbo-demo-arjun:v2:${key}`);
/** Local time in India (the user's timezone). */
const at = (date: string, hh: number, mm = 0, ss = 0) =>
  new Date(
    `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}+05:30`,
  );
const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261011);
const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const round = (n: number, step: number) => Math.round(n / step) * step;

const DAYS = datesBetween(START, END);
const weekOf = (date: string) => Math.floor(DAYS.indexOf(date) / 7);
const active = (date: string) => !MISSED.has(date);

// ── Profile and the plan ────────────────────────────────────────────────────────────────────────────

type ProfileRow = NonNullable<Awaited<ReturnType<PrismaClient["profile"]["findUnique"]>>>;

function planOf(p: ProfileRow): Targets {
  return calculateTargets({
    goal: p.goal!,
    sex: p.sex!,
    age: p.age!,
    heightCm: p.heightCm!,
    weightKg: p.weightKg!,
    activityLevel: p.activityLevel!,
    targetWeightKg: p.targetWeightKg,
    pace: p.pace,
    stepGoal: p.stepGoal,
  });
}

// ── Weigh-ins ───────────────────────────────────────────────────────────────────────────────────────

/** True weight gain per week (kg). The scale adds day-to-day water noise on top. */
const WEEKLY_GAIN = [0.1, 0.25, 0.35, 0.4, 0.2, 0.35, 0.3, 0.3];
const WEIGH_DAYS = new Set([1, 2, 4, 5, 6]); // Mon, Tue, Thu, Fri, Sat

function weighIns() {
  const out: { date: string; kg: number; loggedAt: Date }[] = [];
  let truth = 72.4;
  for (const date of DAYS) {
    truth += WEEKLY_GAIN[weekOf(date)]! / 7;
    const noise = between(-0.35, 0.35) + (weekday(date) === 1 ? 0.2 : 0);
    const weighs = WEIGH_DAYS.has(weekday(date)) ? rand() > 0.12 : rand() > 0.8;
    if (!active(date) || (!weighs && date !== START)) continue;
    out.push({ date, kg: Math.round((truth + noise) * 10) / 10, loggedAt: at(date, 7, int(5, 40)) });
  }
  return out;
}

// ── Meals ───────────────────────────────────────────────────────────────────────────────────────────

const FOOD_BY_SLUG = new Map(foodsFromRows(FOODS).map((f) => [f.slug, f]));
type Item = [slug: string, quantity: number, unit: FoodUnit];

const BREAKFASTS: Item[][] = [
  [
    ["poha", 1, "plate_full"],
    ["masala-chai", 1, "cup"],
  ],
  [
    ["moong-chilla", 2, "piece"],
    ["dahi", 1, "katori"],
  ],
  [
    ["aloo-paratha", 2, "piece"],
    ["dahi", 1, "katori"],
  ],
  [
    ["oats-porridge", 1, "bowl"],
    ["banana", 1, "piece"],
  ],
  [
    ["methi-thepla", 3, "piece"],
    ["masala-chai", 1, "cup"],
  ],
  [
    ["upma", 1, "plate_full"],
    ["filter-coffee", 1, "cup"],
  ],
  [
    ["idli", 4, "piece"],
    ["masala-chai", 1, "cup"],
  ],
];
const LUNCHES: Item[][] = [
  [
    ["roti", 3, "piece"],
    ["dal-tadka", 1, "katori"],
    ["mix-veg", 1, "katori"],
    ["steamed-rice", 1, "katori"],
    ["chaas", 1, "glass"],
  ],
  [
    ["roti", 3, "piece"],
    ["rajma", 1, "katori"],
    ["jeera-rice", 1, "katori"],
  ],
  [
    ["roti", 3, "piece"],
    ["chole", 1, "katori"],
    ["dahi", 1, "katori"],
  ],
  [
    ["roti", 2, "piece"],
    ["gujarati-dal", 1, "katori"],
    ["steamed-rice", 1, "katori"],
    ["bhindi-masala", 1, "katori"],
  ],
  [
    ["paneer-paratha", 2, "piece"],
    ["dahi", 1, "katori"],
  ],
  [
    ["roti", 3, "piece"],
    ["soya-chunks-curry", 1, "katori"],
    ["cabbage-sabzi", 1, "katori"],
    ["chaas", 1, "glass"],
  ],
];
const SNACKS: Item[][] = [
  [
    ["whey-protein", 1, "serving"],
    ["banana", 1, "piece"],
  ],
  [["protein-shake-milk", 1, "glass"]],
  [
    ["peanuts", 1, "serving"],
    ["whey-protein", 1, "serving"],
  ],
  [
    ["dhokla", 4, "piece"],
    ["whey-protein", 1, "serving"],
  ],
  [
    ["sprouts-salad", 1, "katori"],
    ["paneer-tikka", 4, "piece"],
  ],
  [
    ["greek-yogurt", 1, "katori"],
    ["banana", 1, "piece"],
  ],
];
const DINNERS: Item[][] = [
  [
    ["roti", 3, "piece"],
    ["palak-paneer", 1, "katori"],
    ["dal-fry", 1, "katori"],
  ],
  [
    ["khichdi", 1, "bowl"],
    ["dahi", 1, "katori"],
  ],
  [
    ["roti", 3, "piece"],
    ["paneer-bhurji", 1, "katori"],
    ["moong-dal", 1, "katori"],
  ],
  [
    ["veg-pulao", 1, "plate_full"],
    ["dahi", 1, "katori"],
  ],
  [
    ["roti", 3, "piece"],
    ["matar-paneer", 1, "katori"],
    ["aloo-sabzi", 1, "katori"],
  ],
  [
    ["roti", 2, "piece"],
    ["soya-chunks-curry", 1, "katori"],
    ["steamed-rice", 1, "katori"],
  ],
];
const WEEKEND_DINNERS: Item[][] = [
  [["pav-bhaji", 1, "plate_full"]],
  [["masala-dosa", 2, "piece"]],
  [
    ["veg-biryani", 1, "plate_full"],
    ["dahi", 1, "katori"],
  ],
  [
    ["paneer-butter-masala", 1, "katori"],
    ["tandoori-roti", 3, "piece"],
  ],
];
/** Added to a day, one at a time, until it's close to the day's intake. Protein first: Arjun is bulking. */
const TOP_UPS: Item[] = [
  ["protein-shake-milk", 1, "glass"],
  ["paneer", 1, "serving"],
  ["roti", 1, "piece"],
  ["greek-yogurt", 1, "katori"],
  ["milk", 1, "glass"],
  ["roti", 1, "piece"],
  ["peanuts", 1, "serving"],
  ["banana", 1, "piece"],
];

const MEAL_TIMES = { breakfast: [8, 30], lunch: [13, 30], snack: [17, 30], dinner: [21, 0] } as const;
type MealType = keyof typeof MEAL_TIMES;
const SOURCES = ["search", "search", "text", "voice", "repeat", "photo"] as const;

function itemFor([slug, quantity, unit]: Item, oil: "little" | "normal" | "heavy" | null) {
  const food = FOOD_BY_SLUG.get(slug);
  if (!food) throw new Error(`Unknown food slug "${slug}"`);
  const nutrition: FoodNutrition = {
    per100g: {
      kcal: food.kcalPer100g,
      proteinG: food.proteinPer100g,
      carbsG: food.carbsPer100g,
      fatG: food.fatPer100g,
    },
    defaultUnit: food.defaultUnit,
    units: food.units,
    liquid: food.liquid,
  };
  const { grams, macros } = portion(nutrition, quantity, unit);
  const m: Macros = food.homeCooked && oil ? applyOil(macros, grams, oil) : macros;
  return { foodId: food.id, name: food.name, quantity, unit, grams, homeCooked: food.homeCooked, ...m };
}

type Meal = {
  id: string;
  mealType: MealType;
  date: string;
  loggedAt: Date;
  source: (typeof SOURCES)[number];
  oilLevel: "little" | "normal" | "heavy" | null;
  items: ReturnType<typeof itemFor>[];
};

function mealsFor(date: string, targetKcal: number): Meal[] {
  const weekend = weekday(date) === 0 || weekday(date) === 6;
  const plan: [MealType, Item[]][] = [
    ["breakfast", pick(BREAKFASTS)],
    ["lunch", pick(LUNCHES)],
    ["snack", pick(SNACKS)],
    ["dinner", weekend && rand() < 0.6 ? pick(WEEKEND_DINNERS) : pick(DINNERS)],
  ];
  const oil = () => (rand() < 0.7 ? "normal" : rand() < 0.6 ? "little" : "heavy") as Meal["oilLevel"];
  const meals = plan.map(([mealType, items]): Meal => {
    const level = oil();
    const built = items.map((it) => itemFor(it, level));
    const [hh, mm] = MEAL_TIMES[mealType];
    return {
      id: id(`meal:${date}:${mealType}`),
      mealType,
      date,
      loggedAt: addMs(at(date, hh, mm), int(-20, 25) * 60_000),
      source: pick(SOURCES),
      oilLevel: built.some((i) => i.homeCooked) ? level : null,
      items: built,
    };
  });
  const total = () => meals.reduce((s, m) => s + m.items.reduce((t, i) => t + i.kcal, 0), 0);
  for (let i = 0; total() < targetKcal - 90 && i < 12; i++) {
    const meal = meals[[2, 3, 1][i % 3]!]!; // snack, dinner, lunch
    meal.items.push(itemFor(TOP_UPS[i % TOP_UPS.length]!, meal.oilLevel));
  }
  return meals;
}

// ── Workouts ────────────────────────────────────────────────────────────────────────────────────────

const CATALOG = new Map(exercisesFromRows(EXERCISES).map((e) => [e.slug, e]));
type Lift = { exerciseId: string; name: string; type: ExerciseType; from: number; to: number; step: number };

/** Arjun's own routines (Pull day, Push day) plus a leg day from the catalog. Loads rise over the 8 weeks. */
async function programme(prisma: PrismaClient) {
  const routines = await prisma.routine.findMany({
    where: { userId: USER_ID, deletedAt: null, name: { in: ["Pull day", "Push day"] } },
    include: { exercises: { orderBy: { position: "asc" } } },
  });
  const byName = new Map(routines.map((r) => [r.name, r]));
  const LOADS: Record<string, [from: number, to: number, step: number]> = {
    "Lat Pulldown": [37.5, 47.5, 2.5],
    "Cable pull over": [20, 27.5, 2.5],
    "Seated Cable Row": [45, 57.5, 2.5],
    "Dumbbell Shrug": [20, 27.5, 2.5],
    "Dumbbell Curl": [10, 14, 1],
    "EZ-Bar Curl": [20, 27.5, 2.5],
    "Barbell Bench Press": [50, 62.5, 2.5],
    "Incline Barbell Bench Press": [40, 50, 2.5],
    "Pec Deck Fly": [35, 45, 2.5],
    "Dumbbell Overhead Tricep Extension": [12.5, 18, 1],
    "Skull Crusher": [20, 27.5, 2.5],
  };
  const fromRoutine = (name: string) => {
    const r = byName.get(name);
    if (!r) throw new Error(`Arjun's routine "${name}" is missing`);
    return {
      routineId: r.id as string | null,
      lifts: r.exercises.map((e): Lift => {
        const load = LOADS[e.name];
        if (!load || !e.exerciseId) throw new Error(`No load set for routine exercise "${e.name}"`);
        return { exerciseId: e.exerciseId, name: e.name, type: e.type, from: load[0], to: load[1], step: load[2] };
      }),
    };
  };
  const leg = (slug: string, from: number, to: number, step: number): Lift => {
    const e = CATALOG.get(slug);
    if (!e) throw new Error(`Unknown exercise slug "${slug}"`);
    return { exerciseId: e.id, name: e.name, type: e.type, from, to, step };
  };
  return {
    push: { name: "Push day", ...fromRoutine("Push day") },
    pull: { name: "Pull day", ...fromRoutine("Pull day") },
    legs: {
      name: "Leg day",
      routineId: null,
      lifts: [
        leg("barbell-squat", 60, 80, 2.5),
        leg("leg-press", 120, 160, 5),
        leg("romanian-deadlift", 50, 65, 2.5),
        leg("leg-extension", 35, 45, 2.5),
        leg("standing-calf-raise", 40, 55, 2.5),
        leg("hanging-knee-raise", 0, 0, 1),
      ],
    },
  };
}

/** Chance that an exercise's session can set a record (see the workout loop). */
const PR_DAY_CHANCE = 0.1;

/** Mon push, Tue pull, Thu legs, Fri push, Sat pull. */
const SPLIT: Record<number, "push" | "pull" | "legs"> = { 1: "push", 2: "pull", 4: "legs", 5: "push", 6: "pull" };

// ── GPS activities (Sabarmati Riverfront, Ahmedabad) ────────────────────────────────────────────────

/** The west-bank promenade, south to north (lat, lng). */
const RIVERFRONT: [number, number][] = [
  [23.016, 72.5695],
  [23.0219, 72.5716],
  [23.0262, 72.5737],
  [23.03, 72.5758],
  [23.0352, 72.5781],
  [23.0405, 72.5795],
];
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const legM = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * M_PER_DEG_LAT, (b[1] - a[1]) * mPerDegLng(a[0]));

/** Position `s` metres along an out-and-back on the promenade. */
function along(s: number): [number, number] {
  const out = [...RIVERFRONT, ...[...RIVERFRONT].reverse().slice(1)];
  let left = s;
  for (let i = 1; ; i = (i % (out.length - 1)) + 1) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const len = legM(a, b);
    if (left <= len) return [a[0] + ((b[0] - a[0]) * left) / len, a[1] + ((b[1] - a[1]) * left) / len];
    left -= len;
  }
}

function route(start: Date, distanceM: number, seconds: number, everyS: number) {
  const points: [number, number, number, number, number, number][] = [];
  for (let t = 0; t <= seconds; t += everyS) {
    const pace = 1 + 0.06 * Math.sin(t / 97);
    const [lat, lng] = along(Math.min(distanceM, (distanceM * t * pace) / seconds));
    const jitter = () => between(-1.5, 1.5) / M_PER_DEG_LAT;
    points.push([
      Math.round((lat + jitter()) * 1e6) / 1e6,
      Math.round((lng + jitter()) * 1e6) / 1e6,
      start.getTime() + t * 1000,
      Math.round(between(4, 9) * 10) / 10,
      0,
      t * 1000,
    ]);
  }
  const asRoute: RoutePoint[] = points.map(([latitude, longitude, timestamp, accuracy, segment, activeMs]) => ({
    latitude,
    longitude,
    timestamp,
    accuracy,
    segment,
    activeMs,
  }));
  return { points, distanceM: routeStats(asRoute).distanceM };
}

// ── Build ───────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const profile = await prisma.profile.findUnique({ where: { userId: USER_ID } });
    if (!profile?.goal || !profile.onboardedAt) throw new Error("Arjun has no onboarded profile; onboard first");
    const plan = planOf(profile);
    const phase1 = await prisma.phase.findFirst({ where: { userId: USER_ID, deletedAt: null, closedDate: null } });
    if (phase1 && phase1.startDate <= END)
      throw new Error(`Active phase "${phase1.name}" starts ${phase1.startDate}; expected after ${END}`);

    // Weigh-ins and the trend.
    const weights = weighIns();
    const series: TrendPoint[] = trendSeries(weights.map((w) => ({ date: w.date, kg: w.kg })));

    // Meals: daily intake follows the target in force that week (set by the check-ins below), plus a weekly bias.
    const WEEK_BIAS = [-40, 0, 60, 30, -50, 40, 10, -20];
    const PARTIAL_DAYS = new Set(["2026-08-29", "2026-09-22"]); // only breakfast and lunch logged
    const NO_FOOD_DAYS = new Set(["2026-09-03", "2026-10-07"]); // weigh-in or workout only
    const lean = { id: id("phase:lean-bulk"), name: "Lean bulk" };
    const meals: Meal[] = [];
    const checkins: Prisma.CheckinCreateManyInput[] = [];
    let currentKcal = plan.kcal;

    const intakeOf = (start: string, end: string): DayIntake[] => {
      const byDay = new Map<string, DayIntake>();
      for (const m of meals) {
        if (m.date < start || m.date > end) continue;
        const d = byDay.get(m.date) ?? { date: m.date, kcal: 0, proteinG: 0 };
        for (const i of m.items) {
          d.kcal += i.kcal;
          d.proteinG += i.proteinG;
        }
        byDay.set(m.date, d);
      }
      return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    };

    const DECISION: Record<string, "accepted" | "kept"> = { "2026-09-06": "kept" };
    for (let w = 0; w < 8; w++) {
      const days = DAYS.slice(w * 7, w * 7 + 7);
      for (const date of days) {
        if (!active(date) || NO_FOOD_DAYS.has(date)) continue;
        const target = currentKcal + WEEK_BIAS[w]! + int(-150, 130);
        const day = mealsFor(date, target);
        meals.push(...(PARTIAL_DAYS.has(date) ? day.slice(0, 2) : day));
      }

      // The check-in on the Sunday after this week (the last one, today's, stays unanswered).
      const window = checkinWindow(addDays(days[6]!, 1));
      if (window.checkinDate === TODAY) break;
      const before = addDays(window.start, -1);
      const trendStartKg = trendOn(series, before);
      const trendEndKg = trendOn(series, window.end);
      const result = weeklyCheckin({
        goal: profile.goal,
        loggedKcal: intakeOf(window.start, window.end)
          .filter((d) => d.kcal > 0)
          .map((d) => d.kcal),
        trendStartKg,
        trendEndKg,
        weighedInWeek: series.some((p) => p.date >= window.start && p.date <= window.end),
        currentKcal,
        floorKcal: plan.floorKcal,
        adjustmentKcal: plan.adjustmentKcal,
      });
      const ready = result.status === "ready" ? result : null;
      const status = ready ? (DECISION[window.checkinDate] ?? "accepted") : "skipped";
      checkins.push({
        id: id(`checkin:${window.checkinDate}`),
        userId: USER_ID,
        phaseId: lean.id,
        checkinDate: window.checkinDate,
        status,
        loggedDays: result.loggedDays,
        previousKcal: currentKcal,
        newKcal: ready?.newKcal ?? null,
        proteinG: ready?.proteinG ?? null,
        carbsG: ready?.carbsG ?? null,
        fatG: ready?.fatG ?? null,
        avgIntakeKcal: ready ? Math.round(ready.avgIntakeKcal) : null,
        estimatedBurnKcal: ready ? Math.round(ready.estimatedBurnKcal) : null,
        trendStartKg: ready ? trendStartKg : null,
        trendEndKg: ready ? trendEndKg : null,
        capped: ready?.capped ?? false,
        clientUpdatedAt: at(window.checkinDate, 9, int(5, 50)),
      });
      if (ready && status === "accepted") currentKcal = ready.newKcal;
    }

    // Workouts, with PRs worked out against the seeded history before each one.
    const prog = await programme(prisma);
    const bests = new Map<string, Bests>();
    const workouts: Prisma.WorkoutCreateManyInput[] = [];
    const workoutExercises: Prisma.WorkoutExerciseCreateManyInput[] = [];
    const sets: Prisma.WorkoutSetCreateManyInput[] = [];
    for (const date of DAYS) {
      const kind = SPLIT[weekday(date)];
      if (!kind || !active(date) || rand() < 0.12) continue;
      const day = prog[kind];
      const k = weekOf(date) / 7;
      const startedAt = at(date, 18, int(15, 50));
      let clock = startedAt.getTime() + 4 * 60_000;
      const wid = id(`workout:${date}`);
      day.lifts.forEach((lift, position) => {
        const weid = id(`workout:${date}:${position}`);
        workoutExercises.push({
          id: weid,
          workoutId: wid,
          exerciseId: lift.exerciseId,
          position,
          name: lift.name,
          type: lift.type,
        });
        const base = round(lift.from + (lift.to - lift.from) * k, lift.step);
        const bodyweight = lift.type !== "weight_reps" || lift.to === 0;
        const history = bests.get(lift.exerciseId) ?? NO_BESTS;
        // Records are rare: only on a "good day" can the middle set beat the best so far; every other set is
        // held at or under it (same weight or lighter, fewer reps).
        const goodDay = rand() < PR_DAY_CHANCE;
        const values = [0, 1, 2].map((i) => {
          let weightKg = bodyweight ? null : base;
          let reps = bodyweight ? int(10, 15) : int(8, 11) - i;
          if (!(goodDay && i === 1)) {
            if (weightKg !== null && history.weightKg !== null) weightKg = Math.min(weightKg, history.weightKg);
            if (weightKg !== null && history.e1rm !== null) {
              while (reps > 1 && e1rm(weightKg, reps)! > history.e1rm + 0.05) reps--;
            }
            if (weightKg === null && history.reps !== null) reps = Math.min(reps, history.reps);
          }
          return { weightKg, reps, durationS: null, distanceM: null, done: true };
        });
        const prs = prsForSequence(lift.type, history, values);
        let b = history;
        values.forEach((v, i) => {
          clock += int(90, 180) * 1000;
          b = addToBests(b, lift.type, v);
          sets.push({
            id: id(`workout:${date}:${position}:${i}`),
            workoutExerciseId: weid,
            position: i,
            weightKg: v.weightKg,
            reps: v.reps,
            durationS: null,
            distanceM: null,
            completedAt: new Date(clock),
            prKinds: prs[i]!,
          });
        });
        bests.set(lift.exerciseId, b);
      });
      const endedAt = new Date(clock + 3 * 60_000);
      workouts.push({
        id: wid,
        userId: USER_ID,
        name: day.name,
        startedAt,
        endedAt,
        localDate: date,
        routineId: day.routineId,
        clientUpdatedAt: endedAt,
      });
    }

    // GPS: a Wednesday morning run and a Sunday evening walk on the riverfront.
    const activities: Prisma.ActivityCreateManyInput[] = [];
    let distanceM = 0;
    for (const date of DAYS) {
      const wd = weekday(date);
      if (!active(date) || (wd !== 3 && wd !== 0)) continue;
      const kind: ActivityKind = wd === 3 ? "run" : "walk";
      const metres = kind === "run" ? round(between(3000, 5200), 10) : round(between(2500, 4000), 10);
      const secPerKm = kind === "run" ? between(345, 400) : between(600, 690);
      const seconds = Math.round((metres / 1000) * secPerKm);
      const startedAt = kind === "run" ? at(date, 6, int(20, 45)) : at(date, 18, int(0, 30));
      const r = route(startedAt, metres, seconds, kind === "run" ? 3 : 5);
      distanceM += r.distanceM;
      const scale = [...weights].reverse().find((w) => w.date <= date)?.kg ?? profile.weightKg!;
      const endedAt = addMs(startedAt, seconds * 1000);
      activities.push({
        id: id(`activity:${date}`),
        userId: USER_ID,
        kind,
        weightKg: scale,
        startedAt,
        endedAt,
        localDate: date,
        elapsedMs: seconds * 1000,
        points: r.points,
        clientUpdatedAt: endedAt,
      });
    }

    // The closed phase and its summary, worked out the way the phone does when a phase is closed.
    const prCount = sets.filter((s) => (s.prKinds as string[]).length > 0).length;
    const summary = phaseSummary({
      start: START,
      end: END,
      series,
      intake: intakeOf(START, END),
      workouts: workouts.length,
      prs: prCount,
      distanceM,
    });
    const phase: Prisma.PhaseCreateManyInput = {
      id: lean.id,
      userId: USER_ID,
      name: lean.name,
      goal: "build_muscle",
      startDate: START,
      endDate: END,
      targetWeightKg: profile.targetWeightKg,
      kcal: null,
      proteinG: null,
      closedDate: END,
      summary,
      clientUpdatedAt: at(END, 22, 0),
    };

    // ── Report ──
    const logged = new Set([
      ...meals.map((m) => m.date),
      ...weights.map((w) => w.date),
      ...workouts.map((w) => w.localDate),
      ...activities.map((a) => a.localDate),
      TODAY, // the meal and workout Arjun already logged today
    ]);
    const streak = computeStreak(logged, TODAY, 12);
    const mealItems = meals.reduce((s, m) => s + m.items.length, 0);
    console.log(
      `Plan: ${plan.kcal} kcal, ${plan.proteinG} g protein (adjustment ${plan.adjustmentKcal}, floor ${Math.round(plan.floorKcal)})`,
    );
    console.log(
      `Weigh-ins: ${weights.length}  (${weights[0]!.kg} → ${weights.at(-1)!.kg} kg; trend ${series[0]!.trendKg.toFixed(2)} → ${series.at(-1)!.trendKg.toFixed(2)})`,
    );
    console.log(`Meals: ${meals.length} with ${mealItems} items on ${new Set(meals.map((m) => m.date)).size} days`);
    console.log(
      `Workouts: ${workouts.length}, ${workoutExercises.length} exercises, ${sets.length} sets, ${prCount} PR sets`,
    );
    console.log(`Activities: ${activities.length} (${(distanceM / 1000).toFixed(1)} km)`);
    console.log("Check-ins:");
    for (const c of checkins) {
      console.log(
        `  ${c.checkinDate} ${String(c.status).padEnd(8)} days ${c.loggedDays}  ${c.previousKcal} → ${c.newKcal ?? "-"}` +
          `  intake ${c.avgIntakeKcal ?? "-"} burn ${c.estimatedBurnKcal ?? "-"}` +
          `  trend ${c.trendStartKg?.toFixed(2) ?? "-"} → ${c.trendEndKg?.toFixed(2) ?? "-"}${c.capped ? " (capped)" : ""}`,
      );
    }
    const pendingWindow = checkinWindow(TODAY);
    const pending = weeklyCheckin({
      goal: profile.goal,
      loggedKcal: intakeOf(pendingWindow.start, pendingWindow.end).map((d) => d.kcal),
      trendStartKg: trendOn(series, addDays(pendingWindow.start, -1)),
      trendEndKg: trendOn(series, pendingWindow.end),
      weighedInWeek: series.some((p) => p.date >= pendingWindow.start && p.date <= pendingWindow.end),
      currentKcal,
      floorKcal: plan.floorKcal,
      adjustmentKcal: plan.adjustmentKcal,
    });
    console.log(
      `  ${TODAY} PENDING  ${JSON.stringify(pending.status === "ready" ? { from: pending.previousKcal, to: pending.newKcal, days: pending.loggedDays } : pending)}`,
    );
    console.log(`Phase "${lean.name}": ${JSON.stringify(summary)}`);
    console.log(
      `Streak today: current ${streak.current}, best ${streak.best}, freezes ${streak.freezes}; ` +
        `frozen ${streak.days
          .filter((d) => d.state === "frozen")
          .map((d) => d.date)
          .join(", ")}; ` +
        `missed ${streak.days
          .filter((d) => d.state === "missed")
          .map((d) => d.date)
          .join(", ")}`,
    );
    console.log(
      `Profile onboarded_at: ${profile.onboardedAt.toISOString()} → ${profile.onboardedAt > ONBOARDED_AT ? ONBOARDED_AT.toISOString() : "unchanged"}`,
    );

    if (DRY_RUN) {
      console.log("\nDry run: nothing written.");
      return;
    }

    // ── Write (insert-only; existing ids are skipped) ──
    const mealRows: Prisma.MealLogCreateManyInput[] = meals.map((m) => ({
      id: m.id,
      userId: USER_ID,
      mealType: m.mealType,
      loggedAt: m.loggedAt,
      localDate: m.date,
      source: m.source,
      oilLevel: m.oilLevel,
      clientUpdatedAt: addMs(m.loggedAt, 15_000),
    }));
    const itemRows: Prisma.MealItemCreateManyInput[] = meals.flatMap((m) =>
      m.items.map(({ homeCooked: _h, ...i }, position) => ({
        id: id(`${m.id}:item:${position}`),
        mealLogId: m.id,
        position,
        ...i,
      })),
    );
    const weightRows: Prisma.WeightLogCreateManyInput[] = weights.map((w) => ({
      id: id(`weight:${w.date}`),
      userId: USER_ID,
      localDate: w.date,
      kg: w.kg,
      loggedAt: w.loggedAt,
      clientUpdatedAt: w.loggedAt,
    }));

    const res = await prisma.$transaction([
      prisma.mealLog.createMany({ data: mealRows, skipDuplicates: true }),
      prisma.mealItem.createMany({ data: itemRows, skipDuplicates: true }),
      prisma.weightLog.createMany({ data: weightRows, skipDuplicates: true }),
      prisma.workout.createMany({ data: workouts, skipDuplicates: true }),
      prisma.workoutExercise.createMany({ data: workoutExercises, skipDuplicates: true }),
      prisma.workoutSet.createMany({ data: sets, skipDuplicates: true }),
      prisma.activity.createMany({ data: activities, skipDuplicates: true }),
      prisma.phase.createMany({ data: [phase], skipDuplicates: true }),
      prisma.checkin.createMany({ data: checkins, skipDuplicates: true }),
      prisma.profile.updateMany({
        where: { userId: USER_ID, onboardedAt: { gt: ONBOARDED_AT } },
        data: { onboardedAt: ONBOARDED_AT },
      }),
    ]);
    const names = [
      "meals",
      "meal items",
      "weigh-ins",
      "workouts",
      "workout exercises",
      "sets",
      "activities",
      "phases",
      "check-ins",
      "profile",
    ];
    console.log(`\nWritten: ${res.map((r, i) => `${names[i]} ${r.count}`).join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
