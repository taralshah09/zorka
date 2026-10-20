// Domain-core fixtures for docs/LIFE_PLAN.md "Scenarios to test against" (1–7; 8 is the menu scan, LA7).
// The week is Mon 2026-10-19 … Sun 2026-10-25 (D75).
import type { DayType } from "../../../shared/domain/dayType.js";
import type { DayFacts, Standing } from "../../../shared/domain/life.js";
import { defaultCapacity, type DayActual, type DayLedgerInput } from "../../../shared/domain/week.js";

export const WEEK = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
export const [MON, TUE, WED, THU, FRI, SAT, SUN] = WEEK as [string, string, string, string, string, string, string];

export const at = (h: number, m = 0) => h * 60 + m;

export const OFFICE: Standing = {
  mealSource: "home_family",
  budget: "comfortable",
  workPattern: "office",
  hasKitchen: true,
  hasFridge: true,
  sessionsPerWeek: 3,
};

export const HOSTEL: Standing = {
  mealSource: "mess",
  budget: "tight",
  workPattern: "student",
  hasKitchen: false,
  hasFridge: false,
  sessionsPerWeek: null,
};

export const facts = (f: Partial<DayFacts>): DayFacts => ({ blocks: [], whereabouts: "home", mealAccess: {}, flags: [], ...f });

/** An ordinary office day, 9:30–18:00. */
export const OFFICE_DAY = facts({ blocks: [{ from: at(9, 30), to: at(18), kind: "work" }] });

/** 1. Expo Wed 13:00–19:00 (office in the morning). */
export const EXPO_WED = facts({
  blocks: [
    { from: at(9, 30), to: at(12, 30), kind: "work" },
    { from: at(13), to: at(19), kind: "event", label: "Expo", canEat: true },
  ],
  whereabouts: "away_local",
  mealAccess: { breakfast: "home", lunch: "packed", snack: "packed", dinner: "home" },
});

/** Scenario 1 as written: the expo is the day (home breakfast, packed lunch and snack). */
export const EXPO_ONLY_WED = facts({
  blocks: [{ from: at(13), to: at(19), kind: "event", label: "the expo" }],
  whereabouts: "away_local",
  mealAccess: { breakfast: "home", lunch: "packed", snack: "packed", dinner: "home" },
});

/** "Expo tomorrow 1–7, client dinner at 8" (LA2 exit): still away, not a feast. */
export const EXPO_CLIENT_DINNER = facts({
  blocks: [
    { from: at(13), to: at(19), kind: "event", label: "Expo" },
    { from: at(20), to: at(22), kind: "social", label: "Client dinner", canEat: true },
  ],
  whereabouts: "away_local",
  mealAccess: { dinner: "eat_out" },
});

/** 2. Late meeting Tue until 23:00, with a lunch break. */
export const LATE_TUE = facts({
  blocks: [
    { from: at(9, 30), to: at(13), kind: "work" },
    { from: at(14), to: at(23), kind: "work", label: "Late meeting" },
  ],
  sleepMinute: at(23, 30),
});

/** 3. Hostel: the mess for every meal. */
export const HOSTEL_DAY = facts({
  blocks: [{ from: at(9), to: at(17), kind: "study" }],
  mealAccess: { breakfast: "mess", lunch: "mess", snack: "mess", dinner: "mess" },
});

/** 4. Wedding Saturday evening. */
export const WEDDING_SAT = facts({
  blocks: [{ from: at(19), to: at(23, 30), kind: "social", label: "Wedding", canEat: true }],
  mealAccess: { dinner: "event_food" },
  sleepMinute: at(24, 30),
});

/** 5. Flight Thu 06:00–11:00, then another city Thu–Fri. */
export const FLIGHT_THU = facts({
  blocks: [{ from: at(6), to: at(11), kind: "travel", label: "Flight" }],
  whereabouts: "other_city",
  wakeMinute: at(4, 30),
});
export const OTHER_CITY_FRI = facts({ blocks: [{ from: at(10), to: at(17), kind: "work" }], whereabouts: "other_city" });

export type DayOpts = {
  base?: { kcal: number; proteinG: number; steps: number };
  dayType?: DayType;
  actual?: DayActual | null;
  allowanceKcal?: number;
  achievableProteinG?: number;
  maintenanceKcal?: number;
  patternDay?: boolean;
  canTrain?: boolean;
};

export const BASE = { kcal: 2000, proteinG: 130, steps: 8000 };

export function ledgerDay(date: string, o: DayOpts = {}): DayLedgerInput {
  const base = o.base ?? BASE;
  const dayType = o.dayType ?? "normal";
  const capacity = defaultCapacity(dayType, base.proteinG);
  if (o.canTrain !== undefined) capacity.canTrain = o.canTrain;
  const d: DayLedgerInput = {
    date,
    baseKcal: base.kcal,
    baseProteinG: base.proteinG,
    baseSteps: base.steps,
    dayType,
    actual: o.actual ?? null,
    capacity,
  };
  if (o.allowanceKcal !== undefined) d.allowanceKcal = o.allowanceKcal;
  if (o.achievableProteinG !== undefined) d.achievableProteinG = o.achievableProteinG;
  if (o.maintenanceKcal !== undefined) d.maintenanceKcal = o.maintenanceKcal;
  if (o.patternDay !== undefined) d.patternDay = o.patternDay;
  return d;
}

/** A week of usual days, with per-date overrides. */
export const week = (over: Partial<Record<string, DayOpts>> = {}, common: DayOpts = {}) =>
  WEEK.map((date) => ledgerDay(date, { ...common, ...over[date] }));

export const onTarget = (kcal = BASE.kcal, proteinG = BASE.proteinG, steps = BASE.steps, trained = false): DayActual => ({
  kcal,
  proteinG,
  steps,
  trained,
});
