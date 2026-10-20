// LA3/LA4 · The day plan on the phone: gathers what planDay needs (standing life, the brief, learned facts, this week's
// logs, routines, food options) and runs it. Today's plan is saved whenever its inputs change, so another phone shows
// the same day; a future day's plan is saved when the user accepts it. Works offline once the brief is parsed.
import { useEffect, useMemo } from "react";

import { cachedSteps } from "@/features/activity/health";
import { useWorkoutsBetween } from "@/features/gym/store";
import { nextRoutine, useRoutines, type Routine } from "@/features/gym/routines";
import { coverageFor, useCoverageVersion } from "@/features/meals/coverage";
import { mealsBetween, useMealsVersion } from "@/features/meals/store";
import { useUsualMeals, type UsualMeal } from "@/features/meals/usual";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { classifyDay } from "@shared/domain/dayType";
import { PROTEIN_STAPLES, type EatCandidate, type ProteinStaple } from "@shared/domain/eatOptions";
import { localDate } from "@shared/domain/food";
import type { DayFacts, Standing } from "@shared/domain/life";
import { planDay, planInputsHash, type DayPlan, type PlanDayInput, type RoutineSummary } from "@shared/domain/planDay";
import { clampWaterGoal } from "@shared/domain/water";
import { defaultCapacity, eventAllowance, sessionsTargetFor, weekDates, type DayLedgerInput } from "@shared/domain/week";
import { useBriefsBetween, type Brief } from "./briefs";
import { useActiveFacts } from "./memory";
import { planFor, savePlan, useStoredPlan, type StoredPlan } from "./plans";
import { standingFrom } from "./standing";

/** A routine's rough length: about 8 minutes an exercise, 30–90 minutes. */
export const routineMinutes = (r: Routine) => Math.min(90, Math.max(30, r.exercises.length * 8));

const staplesAsCandidates = (staples: readonly ProteinStaple[]): EatCandidate[] =>
  staples.map((s) => ({
    id: `staple:${s.id}`,
    name: s.name,
    source: "home",
    macros: s.macros,
    diet: s.diet,
    category: "protein",
    cuisine: null,
    mealTypes: [s.slot],
    timesLogged: 0,
    estimate: true,
    needsKitchen: s.needsKitchen,
    portable: s.portable,
    costInrPerServing: s.costInr,
    access: s.portable ? ["home", "packed", "mess", "canteen"] : ["home"],
  }));

const usualCandidates = (usuals: readonly UsualMeal[]): EatCandidate[] =>
  usuals.map((u) => {
    const macros = u.items.reduce(
      (s, i) => ({ kcal: s.kcal + i.kcal, proteinG: s.proteinG + i.proteinG, carbsG: s.carbsG + i.carbsG, fatG: s.fatG + i.fatG }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
    return {
      id: `usual:${u.id}`,
      name: u.items.map((i) => i.name).join(" + "),
      source: "usual",
      macros,
      diet: u.items.every((i) => i.diet === "veg" || i.diet === "jain") ? "veg" : u.items.some((i) => i.diet === "non_veg") ? "non_veg" : null,
      category: "home_meal",
      cuisine: null,
      mealTypes: [u.mealType],
      timesLogged: 5,
      estimate: false,
    };
  });

export type DayPlanState = {
  plan: DayPlan | null;
  stored: StoredPlan | null;
  brief: Brief | null;
  /** What the plan was made from (the menu scan spreads a treat over this week's ledger). */
  input: PlanDayInput | null;
  /** Saves the plan as accepted (Accept on plan/tomorrow, or on the Today card). */
  accept(): void;
};

/** The week ledger rows: same daily base, each day's type from its brief, logged days from the phone (D77). */
function ledgerFor(
  userId: string,
  date: string,
  today: string,
  base: { kcal: number; proteinG: number; steps: number },
  briefs: Map<string, Brief>,
  standing: Standing,
  trainedDays: Set<string>,
): DayLedgerInput[] {
  const dates = weekDates(date);
  const meals = mealsBetween(userId, dates[0]!, dates[6]!);
  return dates.map((d) => {
    const brief = briefs.get(d);
    const dayType = brief ? classifyDay(brief.facts, standing) : "normal";
    const row: DayLedgerInput = {
      date: d,
      baseKcal: base.kcal,
      baseProteinG: base.proteinG,
      baseSteps: base.steps,
      dayType,
      capacity: defaultCapacity(dayType, base.proteinG),
      actual: null,
    };
    if (dayType === "feast") row.allowanceKcal = eventAllowance(base.kcal);
    if (d <= today) {
      const covered = coverageFor(userId, d);
      const dayMeals = meals.filter((m) => m.localDate === d);
      const sum = (k: "kcal" | "proteinG") => dayMeals.reduce((s, m) => s + m.items.reduce((t, i) => t + i[k], 0), 0);
      const counted = d < today && (covered === "complete" || covered === "partial");
      row.actual = {
        kcal: counted ? sum("kcal") : null,
        proteinG: counted ? sum("proteinG") : null,
        steps: d < today ? (cachedSteps(userId, d)?.steps ?? null) : null,
        trained: trainedDays.has(d),
      };
    }
    return row;
  });
}

/** The plan for `date` (today or one of the next 7 days). null until the profile has targets. */
export function useDayPlan(
  date: string,
  opts: { save?: "auto" | "never"; /** Preview with these facts instead of the saved brief (the brief screen). */ facts?: DayFacts | null } = {},
): DayPlanState {
  const userId = useActiveUser((s) => s.userId);
  const { profile, targets } = useTargets();
  const today = localDate(new Date());
  const week = weekDates(date);
  const briefs = useBriefsBetween(userId, week[0]!, week[6]!);
  const patterns = useActiveFacts(userId, date);
  const { routines, lastDone } = useRoutines(userId);
  const usuals = useUsualMeals(userId);
  const workouts = useWorkoutsBetween(userId, week[0]!, week[6]!);
  const mealsV = useMealsVersion((s) => s.v);
  const coverageV = useCoverageVersion((s) => s.v);
  const stored = useStoredPlan(userId, date);
  const brief = briefs.get(date) ?? null;
  const facts = opts.facts !== undefined ? opts.facts : (brief?.facts ?? null);

  const input = useMemo((): PlanDayInput | null => {
    void mealsV;
    void coverageV;
    const p = profile.data;
    if (!userId || !p || !targets) return null;
    const standing = standingFrom(p);
    const base = { kcal: targets.kcal, proteinG: targets.proteinG, steps: targets.steps };
    const trained = new Set(workouts.map((w) => w.localDate));
    const next = nextRoutine(routines, lastDone);
    const ordered = next ? [next, ...routines.filter((r) => r.id !== next.id)] : routines;
    const routineList: RoutineSummary[] = ordered.map((r) => ({ id: r.id, name: r.name, minutes: routineMinutes(r) }));
    return {
      date,
      today,
      now: 0,
      base: {
        ...base,
        floorKcal: targets.floorKcal,
        waterGlasses: clampWaterGoal(p.waterGoalGlasses),
        goal: p.goal,
        maintenanceKcal: Math.round(targets.tdee),
      },
      standing,
      facts,
      patterns,
      ledger: ledgerFor(userId, date, today, base, briefs, standing, trained),
      routines: routineList,
      candidates: [...usualCandidates(usuals), ...staplesAsCandidates(PROTEIN_STAPLES)],
      diet: p.diet ?? "non_veg",
      staples: PROTEIN_STAPLES,
      sessionsTarget: sessionsTargetFor(p.sessionsPerWeek ?? null, patterns.trainDays?.length ?? null),
    };
  }, [userId, profile.data, targets, date, today, facts, briefs, patterns, routines, lastDone, usuals, workouts, mealsV, coverageV]);

  const plan = useMemo(() => (input ? planDay(input) : null), [input]);
  const hash = useMemo(() => (input ? planInputsHash(input) : null), [input]);

  // Today's plan follows the day automatically; another day's is only saved on Accept.
  const auto = (opts.save ?? "auto") === "auto" && date === today;
  useEffect(() => {
    if (!auto || !userId || !plan || !hash) return;
    if (planFor(userId, date)?.inputsHash === hash) return;
    savePlan(userId, date, plan, hash);
  }, [auto, userId, plan, hash, date]);

  return {
    plan,
    stored,
    brief,
    input,
    accept: () => {
      if (userId && plan && hash) savePlan(userId, date, plan, hash, true);
    },
  };
}

