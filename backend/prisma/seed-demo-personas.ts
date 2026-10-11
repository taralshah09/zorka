// P40 · Demo history for Riya and Meera (8 weeks, 2026-08-16 … 2026-10-11), next to Arjun's own seed
// (seed-demo-arjun.ts, the "fitness geek"). Together the three profiles show every Flow C state in a demo:
//
//   Riya  — casual user. Logs most days (sometimes only two meals), weighs in ~3×/week, evening GPS walks on
//           Marine Drive, no gym, a 30+ day streak running up to yesterday, and weekly check-ins including one
//           capped ±150 kcal change in her goal's direction. Riya is already onboarded in Neon (build muscle), so
//           the history follows her own profile (P40 gate: "adapt to her profile"): one active phase ("Lean bulk")
//           and a +150 kcal step after a stall week (09-20). An empty profile gets the fat-loss persona instead ("Steady
//           cut", a −150 cut). This week's check-in (Sunday 2026-10-11) is left unanswered so S35 can be tested.
//   Meera — returning user. Six good weeks of runs in Cubbon Park and steady weight (get fitter), a closed
//           phase ("10K build") with its frozen summary, then a new active phase, then 5 days away
//           (2026-10-07 … 10-11, nothing logged) so Home shows "Welcome back" (S48) and the streak screen shows
//           the two freezes that were spent before it reset.
//
// Run: npm run db:seed:demo      (writes)
//      npm run db:seed:demo:dry  (computes and prints, writes nothing; also the default without --write)
//      add -- --only=riya or -- --only=meera to seed one profile
//
// Idempotent and additive, like Arjun's seed: stable ids from content keys ("kimbo-demo-persona:v1:<user>:…"),
// createMany with skipDuplicates, nothing updated or deleted. Profiles: an empty (not onboarded) profile gets the
// persona's onboarding answers; an onboarded one is never overwritten, except onboarded_at moving back to the
// start of the history (the app ignores phases and check-ins from before onboarding). The history is computed from
// the profile actually used (goal, weight, diet); a persona can carry a variant per goal for onboarded profiles.
//
// Everything comes from a fixed PRNG seed per persona, so a dry run and the write produce the same rows.
import { PrismaPg } from "@prisma/adapter-pg";

import {
  routeStats,
  type ActivityKind,
  type RoutePoint,
} from "../../shared/domain/activity.js";
import {
  applyOil,
  dietAllows,
  portion,
  type Diet,
  type FoodNutrition,
  type FoodUnit,
  type Macros,
} from "../../shared/domain/food.js";
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
import {
  calculateTargets,
  weeklyCheckin,
  type Goal,
  type Targets,
} from "../../shared/domain/targets.js";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { stableUuid } from "../src/lib/stableId.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import { FOODS } from "./data/foods.js";

const START = "2026-08-16"; // a Sunday, 8 weeks before the last day
const END = "2026-10-11"; // yesterday
const TODAY = "2026-10-12";
const ONBOARDED_AT = new Date("2026-08-16T09:00:00+05:30");
const DAYS = datesBetween(START, END);
/** Writes only with --write; anything else is a dry run. */
const DRY_RUN = !process.argv.includes("--write");

const at = (date: string, hh: number, mm = 0) =>
  new Date(
    `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`,
  );
const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const weekOf = (date: string) => Math.floor(DAYS.indexOf(date) / 7);

function rng(seed: number) {
  let a = seed;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  return {
    rand,
    between,
    int: (lo: number, hi: number) => Math.floor(between(lo, hi + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!,
  };
}
type Rng = ReturnType<typeof rng>;

// ── Foods ───────────────────────────────────────────────────────────────────────────────────────────

const FOOD_BY_SLUG = new Map(foodsFromRows(FOODS).map((f) => [f.slug, f]));
type Item = [slug: string, quantity: number, unit: FoodUnit];
type OilLevel = "little" | "normal" | "heavy";

function itemFor([slug, quantity, unit]: Item, oil: OilLevel | null) {
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
  const m: Macros =
    food.homeCooked && oil ? applyOil(macros, grams, oil) : macros;
  return {
    foodId: food.id,
    name: food.name,
    quantity,
    unit,
    grams,
    homeCooked: food.homeCooked,
    ...m,
  };
}

const MEAL_TIMES = {
  breakfast: [8, 45],
  lunch: [13, 45],
  snack: [17, 15],
  dinner: [20, 45],
} as const;
type MealType = keyof typeof MEAL_TIMES;
const SOURCES = [
  "search",
  "text",
  "voice",
  "voice",
  "repeat",
  "photo",
] as const;

type Meal = {
  id: string;
  mealType: MealType;
  date: string;
  loggedAt: Date;
  source: (typeof SOURCES)[number];
  oilLevel: OilLevel | null;
  items: ReturnType<typeof itemFor>[];
};

type Menu = {
  breakfasts: Item[][];
  lunches: Item[][];
  snacks: Item[][];
  dinners: Item[][];
  weekendDinners: Item[][];
  /** Added one at a time while the day is well under its intake. */
  topUps: Item[];
  /** Share of days with an afternoon snack logged. */
  snackChance: number;
};

// ── Personas ────────────────────────────────────────────────────────────────────────────────────────

type ProfileFill = {
  goal: Goal;
  sex: "female";
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: "moderate" | "active";
  diet: "veg" | "eggetarian";
  targetWeightKg: number | null;
  pace: "steady" | null;
  coach: "calm_mentor" | "desi_legend";
  stepGoal: number;
  checkinDetailed: boolean;
};

type PhasePlan = {
  key: string;
  name: string;
  start: string;
  end: string | null;
  closed: boolean;
};

type Persona = {
  key: string;
  userId: string;
  name: string;
  seed: number;
  profile: ProfileFill;
  /** Days with nothing logged at all. */
  missed: ReadonlySet<string>;
  /** Only breakfast and lunch logged. */
  partialDays: ReadonlySet<string>;
  /** Weigh-in or activity only. */
  noFoodDays: ReadonlySet<string>;
  /** True weight change per week (kg); the scale adds water noise on top. One entry per week, 9 weeks. */
  weeklyChangeKg: number[];
  /** Weekdays with a likely weigh-in (0 = Sunday). */
  weighDays: ReadonlySet<number>;
  /** Average kcal over/under the day's aim, per week. */
  weekBiasKcal: number[];
  /** What a day's eating aims at: the target in force (follows the check-ins) or the onboarding plan (habit). */
  eatsTo: "target" | "plan";
  menu: Menu;
  /** Most top-up items added to a day that's short of its aim (default 10). */
  topUpMax?: number;
  /** Check-in answers that aren't "accepted" (keyed by the Sunday). */
  decisions: Partial<Record<string, "kept">>;
  phases: PhasePlan[];
  activity: {
    route: [number, number][];
    /** What (if anything) is recorded on a weekday, with its distance range in metres and pace range (s/km). */
    plan: (
      date: string,
      r: Rng,
    ) => {
      kind: ActivityKind;
      metres: number;
      secPerKm: number;
      hh: number;
    } | null;
  };
  /** Overrides used when the profile is already onboarded with another goal (the history follows the profile). */
  variants?: Partial<Record<Goal, PersonaVariant>>;
};

type PersonaVariant = Partial<
  Pick<
    Persona,
    | "weeklyChangeKg"
    | "weekBiasKcal"
    | "decisions"
    | "phases"
    | "menu"
    | "topUpMax"
  >
>;

/** Drops menu options with a food the diet doesn't allow (e.g. eggs for a vegetarian profile). */
function menuFor(menu: Menu, diet: Diet): Menu {
  const ok = ([slug]: Item) => {
    const food = FOOD_BY_SLUG.get(slug);
    if (!food) throw new Error(`Unknown food slug "${slug}"`);
    return dietAllows(diet, food.diet as Diet);
  };
  const options = (xs: Item[][], what: string) => {
    const kept = xs.filter((o) => o.every(ok));
    if (!kept.length) throw new Error(`No ${what} left for a ${diet} diet`);
    return kept;
  };
  return {
    ...menu,
    breakfasts: options(menu.breakfasts, "breakfasts"),
    lunches: options(menu.lunches, "lunches"),
    snacks: options(menu.snacks, "snacks"),
    dinners: options(menu.dinners, "dinners"),
    weekendDinners: options(menu.weekendDinners, "weekend dinners"),
    topUps: menu.topUps.filter(ok),
  };
}

const RIYA: Persona = {
  key: "riya",
  userId: "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11",
  name: "Riya",
  seed: 20261012,
  profile: {
    goal: "lose_fat",
    sex: "female",
    age: 29,
    heightCm: 162,
    weightKg: 68.5,
    activityLevel: "moderate",
    diet: "eggetarian",
    targetWeightKg: 62,
    pace: "steady",
    coach: "calm_mentor",
    stepGoal: 8000,
    checkinDetailed: false,
  },
  // 08-23 is frozen; 09-02 and 09-03 use both freezes and 09-04 resets the streak; 09-27 is frozen inside the
  // current streak (a snowflake on S40).
  missed: new Set([
    "2026-08-23",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-27",
  ]),
  // Only two meals logged (in this week, which is still unanswered).
  partialDays: new Set(["2026-10-05"]),
  noFoodDays: new Set(["2026-09-10", "2026-10-03"]),
  // Week 4 (09-06 … 09-12) is a festive week (+0.8 kg, mostly salt and water): the 09-13 check-in answers it with a
  // capped −150 kcal cut, which Riya accepts.
  weeklyChangeKg: [-1.1, -0.75, -0.7, 0.8, -0.75, -0.7, -0.65, -0.6, -0.55],
  weighDays: new Set([1, 3, 6]),
  weekBiasKcal: [0, 0, 20, 180, 20, 0, 0, 10, 0],
  eatsTo: "target",
  menu: {
    breakfasts: [
      [
        ["poha", 1, "plate_full"],
        ["masala-chai", 1, "cup"],
      ],
      [
        ["omelette", 1, "piece"],
        ["brown-bread", 2, "slice"],
      ],
      [
        ["besan-chilla", 2, "piece"],
        ["masala-chai", 1, "cup"],
      ],
      [
        ["oats-porridge", 1, "bowl"],
        ["apple", 1, "piece"],
      ],
      [
        ["upma", 1, "katori"],
        ["boiled-egg", 2, "piece"],
      ],
      [
        ["idli", 3, "piece"],
        ["sambar", 1, "katori"],
      ],
    ],
    lunches: [
      [
        ["roti", 2, "piece"],
        ["dal-tadka", 1, "katori"],
        ["mix-veg", 1, "katori"],
        ["dahi", 1, "katori"],
      ],
      [
        ["roti", 2, "piece"],
        ["rajma", 1, "katori"],
        ["green-salad", 1, "katori"],
      ],
      [
        ["steamed-rice", 1, "katori"],
        ["sambar", 1, "katori"],
        ["cabbage-sabzi", 1, "katori"],
      ],
      [
        ["roti", 2, "piece"],
        ["egg-curry", 1, "katori"],
        ["cucumber", 1, "piece"],
      ],
      [
        ["curd-rice", 1, "katori"],
        ["sprouts-salad", 1, "katori"],
      ],
    ],
    snacks: [
      [
        ["masala-chai", 1, "cup"],
        ["marie-biscuit", 2, "piece"],
      ],
      [["makhana", 1, "katori"]],
      [["greek-yogurt", 1, "katori"]],
      [["fruit-salad", 1, "katori"]],
      [["boiled-chana", 1, "katori"]],
    ],
    dinners: [
      [
        ["roti", 2, "piece"],
        ["palak-paneer", 1, "katori"],
      ],
      [
        ["khichdi", 1, "bowl"],
        ["dahi", 1, "katori"],
      ],
      [
        ["moong-chilla", 2, "piece"],
        ["dahi", 1, "katori"],
      ],
      [
        ["roti", 2, "piece"],
        ["egg-bhurji", 1, "katori"],
        ["lauki-sabzi", 1, "katori"],
      ],
      [
        ["roti", 2, "piece"],
        ["moong-dal", 1, "katori"],
        ["bhindi-masala", 1, "katori"],
      ],
    ],
    weekendDinners: [
      [["pav-bhaji", 1, "plate_full"]],
      [
        ["masala-dosa", 1, "piece"],
        ["coconut-chutney", 2, "tbsp"],
      ],
      [
        ["veg-hakka-noodles", 1, "plate_half"],
        ["veg-manchurian-gravy", 1, "plate_half"],
      ],
      [["margherita-pizza", 3, "slice"]],
    ],
    topUps: [
      ["banana", 1, "piece"],
      ["dahi", 1, "katori"],
      ["roti", 1, "piece"],
      ["almonds", 10, "piece"],
      ["milk", 1, "glass"],
    ],
    snackChance: 0.6,
  },
  // "Keep current" on the first check-in (early water weight); the stall week's capped cut is accepted.
  decisions: { "2026-08-30": "kept" },
  phases: [
    {
      key: "steady-cut",
      name: "Steady cut",
      start: START,
      end: "2026-12-27",
      closed: false,
    },
  ],
  activity: {
    // Marine Drive, Mumbai: Nariman Point to Girgaum Chowpatty (lat, lng).
    route: [
      [18.926, 72.8228],
      [18.9318, 72.8236],
      [18.938, 72.8232],
      [18.9435, 72.8225],
      [18.949, 72.8195],
      [18.954, 72.815],
    ],
    plan: (date, r) => {
      const wd = weekday(date);
      if (![2, 4, 6].includes(wd) || r.rand() < 0.2) return null;
      return {
        kind: "walk",
        metres: roundTo(r.between(2400, 4200), 10),
        secPerKm: r.between(620, 720),
        hh: 19,
      };
    },
  },
};

// Riya as she is onboarded in Neon (build muscle, vegetarian): a slow lean bulk. Week 4 (09-06 … 09-12) is a busy
// week with lighter eating and no gain; the trend is still flat a week later, so the 09-20 check-in answers with a
// capped +150 kcal step, which she accepts (the others move ±50). Bigger veg top-ups so a day can reach a surplus.
RIYA.variants = {
  build_muscle: {
    weeklyChangeKg: [0.22, 0.17, 0.22, -0.05, 0.25, 0.28, 0.2, 0.15, 0.2],
    weekBiasKcal: [0, 0, 0, -120, 0, 0, 0, 0, 0],
    decisions: {},
    phases: [
      {
        key: "lean-bulk",
        name: "Lean bulk",
        start: START,
        end: "2026-12-27",
        closed: false,
      },
    ],
    menu: {
      ...RIYA.menu,
      topUps: [
        ["paneer-bhurji", 1, "katori"],
        ["full-cream-milk", 1, "glass"],
        ["roti", 2, "piece"],
        ["peanuts", 1, "serving"],
        ["banana", 1, "piece"],
        ["paneer-paratha", 1, "piece"],
        ["dahi", 1, "katori"],
      ],
    },
    topUpMax: 16,
  },
};

const MEERA: Persona = {
  key: "meera",
  userId: "9b3e5c70-2d4f-4e9c-9a43-7c9d5ebf2a33",
  name: "Meera",
  seed: 20261013,
  profile: {
    goal: "get_fitter",
    sex: "female",
    age: 34,
    heightCm: 158,
    weightKg: 57,
    activityLevel: "active",
    diet: "veg",
    targetWeightKg: null,
    pace: null,
    coach: "desi_legend",
    stepGoal: 10000,
    checkinDetailed: true,
  },
  // Single misses are frozen (two snowflakes); 10-07 … 10-11 is the time away: two more freezes, then a reset.
  missed: new Set([
    "2026-08-28",
    "2026-09-19",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]),
  partialDays: new Set(["2026-09-06", "2026-09-24", "2026-10-03"]),
  noFoodDays: new Set(["2026-09-12"]),
  // Holding steady: get fitter keeps the trend within ±0.25 kg a week.
  weeklyChangeKg: [0.05, -0.1, 0.05, -0.05, 0.1, -0.05, 0, 0.05, 0],
  weighDays: new Set([1, 3, 5]),
  weekBiasKcal: [0, -30, 20, 0, -20, 30, -10, 0, 0],
  eatsTo: "plan",
  menu: {
    breakfasts: [
      [
        ["idli", 3, "piece"],
        ["sambar", 1, "katori"],
        ["filter-coffee", 1, "cup"],
      ],
      [
        ["masala-dosa", 1, "piece"],
        ["filter-coffee", 1, "cup"],
      ],
      [
        ["muesli-milk", 1, "bowl"],
        ["banana", 1, "piece"],
      ],
      [
        ["upma", 1, "plate_full"],
        ["filter-coffee", 1, "cup"],
      ],
      [
        ["moong-chilla", 2, "piece"],
        ["dahi", 1, "katori"],
      ],
    ],
    lunches: [
      [
        ["steamed-rice", 1, "katori"],
        ["sambar", 1, "katori"],
        ["rasam", 1, "katori"],
        ["cabbage-sabzi", 1, "katori"],
        ["dahi", 1, "katori"],
      ],
      [
        ["roti", 3, "piece"],
        ["chole", 1, "katori"],
        ["raita", 1, "katori"],
      ],
      [
        ["lemon-rice", 1, "katori"],
        ["sprouts-salad", 1, "katori"],
        ["chaas", 1, "glass"],
      ],
      [
        ["roti", 3, "piece"],
        ["dal-fry", 1, "katori"],
        ["aloo-gobi", 1, "katori"],
      ],
    ],
    snacks: [
      [["banana-shake", 1, "glass"]],
      [
        ["peanuts", 1, "serving"],
        ["coconut-water", 1, "glass"],
      ],
      [["dhokla", 3, "piece"]],
      [
        ["greek-yogurt", 1, "katori"],
        ["dates", 3, "piece"],
      ],
    ],
    dinners: [
      [
        ["roti", 2, "piece"],
        ["paneer-bhurji", 1, "katori"],
        ["masoor-dal", 1, "katori"],
      ],
      [
        ["curd-rice", 1, "bowl"],
        ["pickle", 1, "tsp"],
      ],
      [
        ["roti", 2, "piece"],
        ["matar-paneer", 1, "katori"],
      ],
      [
        ["pongal", 1, "bowl"],
        ["coconut-chutney", 2, "tbsp"],
      ],
    ],
    weekendDinners: [
      [
        ["veg-biryani", 1, "plate_full"],
        ["raita", 1, "katori"],
      ],
      [
        ["uttapam", 2, "piece"],
        ["sambar", 1, "katori"],
      ],
      [
        ["paneer-butter-masala", 1, "katori"],
        ["tandoori-roti", 2, "piece"],
      ],
    ],
    topUps: [
      ["peanut-butter", 1, "tbsp"],
      ["banana", 1, "piece"],
      ["roti", 1, "piece"],
      ["milk", 1, "glass"],
      ["almonds", 10, "piece"],
    ],
    snackChance: 0.85,
  },
  decisions: { "2026-09-13": "kept" },
  phases: [
    {
      key: "10k-build",
      name: "10K build",
      start: START,
      end: "2026-09-26",
      closed: true,
    },
    {
      key: "half-base",
      name: "Half-marathon base",
      start: "2026-09-27",
      end: "2026-12-20",
      closed: false,
    },
  ],
  activity: {
    // Cubbon Park, Bengaluru (lat, lng).
    route: [
      [12.9763, 77.5929],
      [12.9745, 77.5958],
      [12.973, 77.5985],
      [12.9752, 77.6],
      [12.9785, 77.5975],
      [12.979, 77.5945],
    ],
    plan: (date, r) => {
      const wd = weekday(date);
      const k = weekOf(date) / 7; // 0 → 1 over the history
      if (wd === 0)
        return {
          kind: "run",
          metres: roundTo(6000 + 4000 * k + r.between(-300, 300), 10),
          secPerKm: r.between(380, 420),
          hh: 6,
        };
      if (wd === 2 || wd === 4) {
        if (r.rand() < 0.1) return null;
        return {
          kind: "run",
          metres: roundTo(r.between(4000, 6000), 10),
          secPerKm: r.between(350, 390),
          hh: 6,
        };
      }
      if (wd === 6 && r.rand() < 0.5) {
        return {
          kind: "walk",
          metres: roundTo(r.between(3000, 4500), 10),
          secPerKm: r.between(600, 680),
          hh: 18,
        };
      }
      return null;
    },
  },
};

/** `--only=riya` or `--only=meera` seeds one profile. */
const ONLY = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length);
const PERSONAS = [RIYA, MEERA].filter((p) => !ONLY || p.key === ONLY);

// ── GPS route along a polyline (out and back) ─────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const legM = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * M_PER_DEG_LAT, (b[1] - a[1]) * mPerDegLng(a[0]));

function along(line: [number, number][], s: number): [number, number] {
  const out = [...line, ...[...line].reverse().slice(1)];
  let left = s;
  for (let i = 1; ; i = (i % (out.length - 1)) + 1) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const len = legM(a, b);
    if (left <= len)
      return [
        a[0] + ((b[0] - a[0]) * left) / len,
        a[1] + ((b[1] - a[1]) * left) / len,
      ];
    left -= len;
  }
}

function route(
  r: Rng,
  line: [number, number][],
  start: Date,
  distanceM: number,
  seconds: number,
  everyS: number,
) {
  const points: [number, number, number, number, number, number][] = [];
  for (let t = 0; t <= seconds; t += everyS) {
    const pace = 1 + 0.06 * Math.sin(t / 97);
    const [lat, lng] = along(
      line,
      Math.min(distanceM, (distanceM * t * pace) / seconds),
    );
    const jitter = () => r.between(-1.5, 1.5) / M_PER_DEG_LAT;
    points.push([
      Math.round((lat + jitter()) * 1e6) / 1e6,
      Math.round((lng + jitter()) * 1e6) / 1e6,
      start.getTime() + t * 1000,
      Math.round(r.between(4, 9) * 10) / 10,
      0,
      t * 1000,
    ]);
  }
  const asRoute: RoutePoint[] = points.map(
    ([latitude, longitude, timestamp, accuracy, segment, activeMs]) => ({
      latitude,
      longitude,
      timestamp,
      accuracy,
      segment,
      activeMs,
    }),
  );
  return { points, distanceM: routeStats(asRoute).distanceM };
}

// ── Build one persona ─────────────────────────────────────────────────────────────────────────────

type ProfileRow = NonNullable<
  Awaited<ReturnType<PrismaClient["profile"]["findUnique"]>>
>;

async function build(prisma: PrismaClient, base: Persona) {
  const r = rng(base.seed);
  const id = (key: string) =>
    stableUuid(`kimbo-demo-persona:v1:${base.key}:${key}`);
  const active = (date: string) => !base.missed.has(date);

  const row: ProfileRow | null = await prisma.profile.findUnique({
    where: { userId: base.userId },
  });
  if (!row)
    throw new Error(
      `${base.name} has no profile row; run "npm run db:seed" first`,
    );
  const onboarded = !!(row.goal && row.onboardedAt);
  // A profile onboarded with another goal is never overwritten. If the persona has a variant for that goal, the
  // history follows the profile; otherwise it's computed for the persona (so the dry run shows it) and the write
  // refuses to run.
  const variant =
    onboarded && row.goal !== base.profile.goal
      ? base.variants?.[row.goal!]
      : undefined;
  const mismatch = onboarded && row.goal !== base.profile.goal && !variant;
  const diet: Diet =
    onboarded && !mismatch && row.diet ? (row.diet as Diet) : base.profile.diet;
  const merged: Persona = { ...base, ...variant };
  const p: Persona = { ...merged, menu: menuFor(merged.menu, diet) };
  const prof =
    onboarded && !mismatch
      ? {
          goal: row.goal!,
          sex: row.sex!,
          age: row.age!,
          heightCm: row.heightCm!,
          weightKg: row.weightKg!,
          activityLevel: row.activityLevel!,
          targetWeightKg: row.targetWeightKg,
          pace: row.pace,
          stepGoal: row.stepGoal,
        }
      : p.profile;
  const warnings: string[] = [];
  if (mismatch)
    warnings.push(
      `already onboarded with goal ${row.goal} (persona: ${p.profile.goal}); computed for the persona, but --write ` +
        `refuses until the profile is reset (Settings → Redo setup as "${p.profile.goal}", or clear it)`,
    );
  const plan: Targets = calculateTargets(prof);

  const ours = new Set(p.phases.map((ph) => id(`phase:${ph.key}`)));
  const otherActive = await prisma.phase.findFirst({
    where: {
      userId: p.userId,
      deletedAt: null,
      closedDate: null,
      id: { notIn: [...ours] },
    },
  });
  if (otherActive)
    throw new Error(
      `${p.name} already has an active phase "${otherActive.name}" (from ${otherActive.startDate}); ` +
        `close or delete it in the app first so the demo phases don't overlap`,
    );

  // Weigh-ins and the trend.
  const weights: { date: string; kg: number; loggedAt: Date }[] = [];
  let truth = prof.weightKg;
  for (const date of DAYS) {
    truth += p.weeklyChangeKg[weekOf(date)]! / 7;
    const noise = r.between(-0.35, 0.35) + (weekday(date) === 1 ? 0.15 : 0);
    const weighs = p.weighDays.has(weekday(date))
      ? r.rand() > 0.15
      : r.rand() > 0.9;
    if (!active(date) || (!weighs && date !== START)) continue;
    weights.push({
      date,
      kg: Math.round((truth + noise) * 10) / 10,
      loggedAt: at(date, 7, r.int(5, 50)),
    });
  }
  const series: TrendPoint[] = trendSeries(
    weights.map((w) => ({ date: w.date, kg: w.kg })),
  );

  // Meals: each day's intake follows the target in force that week (set by the check-ins), plus a weekly bias.
  const meals: Meal[] = [];
  const mealsFor = (date: string, targetKcal: number): Meal[] => {
    const weekend = weekday(date) === 0 || weekday(date) === 6;
    const plan: [MealType, Item[]][] = [
      ["breakfast", r.pick(p.menu.breakfasts)],
      ["lunch", r.pick(p.menu.lunches)],
      ...(r.rand() < p.menu.snackChance
        ? ([["snack", r.pick(p.menu.snacks)]] as [MealType, Item[]][])
        : []),
      [
        "dinner",
        weekend && r.rand() < 0.6
          ? r.pick(p.menu.weekendDinners)
          : r.pick(p.menu.dinners),
      ],
    ];
    const day = plan.map(([mealType, items]): Meal => {
      const level: OilLevel =
        r.rand() < 0.7 ? "normal" : r.rand() < 0.7 ? "little" : "heavy";
      const built = items.map((it) => itemFor(it, level));
      const [hh, mm] = MEAL_TIMES[mealType];
      return {
        id: id(`meal:${date}:${mealType}`),
        mealType,
        date,
        loggedAt: addMs(at(date, hh, mm), r.int(-25, 30) * 60_000),
        source: r.pick(SOURCES),
        oilLevel: built.some((i) => i.homeCooked) ? level : null,
        items: built,
      };
    });
    const total = () =>
      day.reduce((s, m) => s + m.items.reduce((t, i) => t + i.kcal, 0), 0);
    for (let i = 0; total() < targetKcal - 40 && i < (p.topUpMax ?? 10); i++) {
      const meal = day[i % 2 === 0 ? day.length - 1 : 1]!; // dinner, lunch
      meal.items.push(
        itemFor(p.menu.topUps[i % p.menu.topUps.length]!, meal.oilLevel),
      );
    }
    return day;
  };
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
  const phaseOn = (date: string) =>
    p.phases.find((ph) => ph.start <= date && (!ph.closed || ph.end! >= date))!;

  // Week by week: log the days, then answer the check-in on the Sunday after (this week's stays unanswered).
  const pendingDate = checkinWindow(TODAY).checkinDate;
  const checkins: Prisma.CheckinCreateManyInput[] = [];
  let currentKcal = plan.kcal;
  for (let w = 0; w * 7 < DAYS.length; w++) {
    const days = DAYS.slice(w * 7, w * 7 + 7);
    for (const date of days) {
      if (!active(date) || p.noFoodDays.has(date)) continue;
      const aim = p.eatsTo === "plan" ? plan.kcal : currentKcal;
      const target = aim + p.weekBiasKcal[w]! + r.int(-130, 130);
      const day = mealsFor(date, target);
      meals.push(...(p.partialDays.has(date) ? day.slice(0, 2) : day));
    }
    if (days.length < 7) break;
    const window = checkinWindow(addDays(days[6]!, 1));
    if (window.checkinDate >= pendingDate) continue;
    const trendStartKg = trendOn(series, addDays(window.start, -1));
    const trendEndKg = trendOn(series, window.end);
    const result = weeklyCheckin({
      goal: prof.goal,
      loggedKcal: intakeOf(window.start, window.end)
        .filter((d) => d.kcal > 0)
        .map((d) => d.kcal),
      trendStartKg,
      trendEndKg,
      weighedInWeek: series.some(
        (s) => s.date >= window.start && s.date <= window.end,
      ),
      currentKcal,
      floorKcal: plan.floorKcal,
      adjustmentKcal: plan.adjustmentKcal,
    });
    const ready = result.status === "ready" ? result : null;
    const status = ready
      ? (p.decisions[window.checkinDate] ?? "accepted")
      : "skipped";
    checkins.push({
      id: id(`checkin:${window.checkinDate}`),
      userId: p.userId,
      phaseId: id(`phase:${phaseOn(window.end).key}`),
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
      clientUpdatedAt: at(window.checkinDate, 9, r.int(5, 50)),
    });
    if (ready && status === "accepted") currentKcal = ready.newKcal;
  }

  // GPS activities.
  const activities: Prisma.ActivityCreateManyInput[] = [];
  const distanceOn = new Map<string, number>();
  for (const date of DAYS) {
    if (!active(date)) continue;
    const a = p.activity.plan(date, r);
    if (!a) continue;
    const seconds = Math.round((a.metres / 1000) * a.secPerKm);
    const startedAt = at(date, a.hh, r.int(5, 40));
    const rt = route(
      r,
      p.activity.route,
      startedAt,
      a.metres,
      seconds,
      a.kind === "run" ? 3 : 5,
    );
    distanceOn.set(date, (distanceOn.get(date) ?? 0) + rt.distanceM);
    const endedAt = addMs(startedAt, seconds * 1000);
    activities.push({
      id: id(`activity:${date}`),
      userId: p.userId,
      kind: a.kind,
      weightKg:
        [...weights].reverse().find((w) => w.date <= date)?.kg ?? prof.weightKg,
      startedAt,
      endedAt,
      localDate: date,
      elapsedMs: seconds * 1000,
      points: rt.points,
      clientUpdatedAt: endedAt,
    });
  }

  // Phases; a closed one gets its summary frozen the way the phone does when it's closed.
  const phases: Prisma.PhaseCreateManyInput[] = p.phases.map((ph) => {
    const closedDate = ph.closed ? ph.end! : null;
    const distanceM = [...distanceOn]
      .filter(([d]) => d >= ph.start && d <= ph.end!)
      .reduce((s, [, m]) => s + m, 0);
    return {
      id: id(`phase:${ph.key}`),
      userId: p.userId,
      name: ph.name,
      goal: prof.goal,
      startDate: ph.start,
      endDate: ph.end,
      targetWeightKg: prof.targetWeightKg,
      kcal: null,
      proteinG: null,
      closedDate,
      summary: closedDate
        ? phaseSummary({
            start: ph.start,
            end: closedDate,
            series,
            intake: intakeOf(ph.start, closedDate),
            workouts: 0,
            prs: 0,
            distanceM,
          })
        : undefined,
      clientUpdatedAt: closedDate ? at(closedDate, 21, 30) : at(ph.start, 9, 5),
    };
  });

  // ── Report ──
  const logged = new Set([
    ...meals.map((m) => m.date),
    ...weights.map((w) => w.date),
    ...activities.map((a) => a.localDate),
  ]);
  const streak = computeStreak(logged, TODAY, 12);
  const last = [...logged].sort().at(-1)!;
  const daysOf = (state: string) =>
    streak.days
      .filter((d) => d.state === state)
      .map((d) => d.date.slice(5))
      .join(" ");
  console.log(
    `\n── ${p.name} (${onboarded ? `already onboarded; profile kept (${prof.goal}, ${diet}${variant ? ", goal variant" : ""})` : "empty profile; persona answers filled in"})`,
  );
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log(
    `  Plan: ${plan.kcal} kcal, ${plan.proteinG} g protein (adjustment ${Math.round(plan.adjustmentKcal)}, floor ${Math.round(plan.floorKcal)})`,
  );
  console.log(
    `  Weigh-ins: ${weights.length} (${weights[0]!.kg} → ${weights.at(-1)!.kg} kg; trend ${series[0]!.trendKg.toFixed(2)} → ${series.at(-1)!.trendKg.toFixed(2)})`,
  );
  console.log(
    `  Meals: ${meals.length} with ${meals.reduce((s, m) => s + m.items.length, 0)} items on ${new Set(meals.map((m) => m.date)).size} days`,
  );
  console.log(
    `  Activities: ${activities.length} (${activities.filter((a) => a.kind === "run").length} runs, ` +
      `${activities.filter((a) => a.kind === "walk").length} walks, ${([...distanceOn.values()].reduce((s, m) => s + m, 0) / 1000).toFixed(1)} km)`,
  );
  console.log("  Check-ins:");
  for (const c of checkins) {
    const change = c.newKcal != null ? c.newKcal - c.previousKcal : null;
    console.log(
      `    ${c.checkinDate} ${String(c.status).padEnd(8)} days ${c.loggedDays}  ${c.previousKcal} → ${c.newKcal ?? "-"}` +
        `${change != null ? ` (${change >= 0 ? "+" : ""}${change})` : ""}  intake ${c.avgIntakeKcal ?? "-"} burn ${c.estimatedBurnKcal ?? "-"}` +
        `  trend ${c.trendStartKg?.toFixed(2) ?? "-"} → ${c.trendEndKg?.toFixed(2) ?? "-"}${c.capped ? " (capped)" : ""}`,
    );
  }
  const pw = checkinWindow(TODAY);
  const pending = weeklyCheckin({
    goal: prof.goal,
    loggedKcal: intakeOf(pw.start, pw.end).map((d) => d.kcal),
    trendStartKg: trendOn(series, addDays(pw.start, -1)),
    trendEndKg: trendOn(series, pw.end),
    weighedInWeek: series.some((s) => s.date >= pw.start && s.date <= pw.end),
    currentKcal,
    floorKcal: plan.floorKcal,
    adjustmentKcal: plan.adjustmentKcal,
  });
  console.log(
    `    ${pw.checkinDate} PENDING  ${JSON.stringify(pending.status === "ready" ? { from: pending.previousKcal, to: pending.newKcal, days: pending.loggedDays } : pending)}`,
  );
  for (const ph of phases)
    console.log(
      `  Phase "${ph.name}" ${ph.startDate} → ${ph.closedDate ? `closed ${ph.closedDate}: ${JSON.stringify(ph.summary)}` : "active"}`,
    );
  console.log(
    `  Streak on ${TODAY}: current ${streak.current}, best ${streak.best}, freezes ${streak.freezes}; frozen ${daysOf("frozen") || "-"}; missed ${daysOf("missed") || "-"}`,
  );
  console.log(
    `  Last log ${last} (${Math.round((Date.parse(TODAY) - Date.parse(last)) / 86_400_000)} days before today)`,
  );

  const mealRows: Prisma.MealLogCreateManyInput[] = meals.map((m) => ({
    id: m.id,
    userId: p.userId,
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
    userId: p.userId,
    localDate: w.date,
    kg: w.kg,
    loggedAt: w.loggedAt,
    clientUpdatedAt: w.loggedAt,
  }));

  return async () => {
    if (mismatch) throw new Error(`${p.name}: ${warnings[0]}`);
    const res = await prisma.$transaction([
      prisma.mealLog.createMany({ data: mealRows, skipDuplicates: true }),
      prisma.mealItem.createMany({ data: itemRows, skipDuplicates: true }),
      prisma.weightLog.createMany({ data: weightRows, skipDuplicates: true }),
      prisma.activity.createMany({ data: activities, skipDuplicates: true }),
      prisma.phase.createMany({ data: phases, skipDuplicates: true }),
      prisma.checkin.createMany({ data: checkins, skipDuplicates: true }),
      onboarded
        ? prisma.profile.updateMany({
            where: { userId: p.userId, onboardedAt: { gt: ONBOARDED_AT } },
            data: { onboardedAt: ONBOARDED_AT },
          })
        : prisma.profile.updateMany({
            where: { userId: p.userId, onboardedAt: null },
            data: { ...p.profile, onboardedAt: ONBOARDED_AT },
          }),
    ]);
    const names = [
      "meals",
      "meal items",
      "weigh-ins",
      "activities",
      "phases",
      "check-ins",
      "profile",
    ];
    console.log(
      `${p.name} written: ${res.map((x, i) => `${names[i]} ${x.count}`).join(", ")}`,
    );
  };
}

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url)
    throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    if (!PERSONAS.length)
      throw new Error(`Unknown --only=${ONLY} (riya or meera)`);
    // Build both first, so a problem with either stops the run before anything is written.
    const writes = [];
    for (const p of PERSONAS) writes.push(await build(prisma, p));
    if (DRY_RUN) {
      console.log("\nDry run: nothing written.");
      return;
    }
    console.log("");
    for (const write of writes) await write();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
