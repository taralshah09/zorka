// AB2/AB5 · What one turn needs from the phone, built without React (docs/ASSISTANT_BAR_PLAN.md D94, D98). The bubble
// over other apps runs turns in a headless JS task, often with Zorka closed, so everything here comes from SQLite and
// the key-value store: the cached profile, today's meals, water, steps and saved plan, the week's intake, the trend,
// the streak, learned facts and aliases. The same function serves the in-app thread.
import type { CoachDayContext, CoachId } from "@/core/api/types";
import { cachedSteps } from "@/features/activity/health";
import { dayCredit } from "@/features/activity/store";
import { dayContext } from "@/features/coach/chat";
import { recentFoods } from "@/features/food/catalog";
import { eatOptionsFor } from "@/features/gap/eat";
import type { DayGap } from "@/features/gap/gap";
import { recentWorkouts } from "@/features/gym/store";
import { lifeContext } from "@/features/life/context";
import { adjustLines, itemTime, itemTitle, whyText } from "@/features/life/copy";
import { targetsOn } from "@/features/life/dayTargets";
import { aliasesFor, factsFor } from "@/features/life/memory";
import { planFor } from "@/features/life/plans";
import { getDb } from "@/core/storage/db";
import { coverageFor } from "@/features/meals/coverage";
import { mealsForDay, mealTotals } from "@/features/meals/store";
import { usualMeals } from "@/features/meals/usual";
import { effectiveTargets, listCheckins } from "@/features/progress/checkins";
import { listPhases } from "@/features/progress/phases";
import { completeIntake, loggedDates, workoutCounts } from "@/features/progress/queries";
import { listWeights, weighInsFor } from "@/features/progress/weights";
import { targetsFromProfile } from "@/features/targets/targetInput";
import { readCachedProfile } from "@/features/users/api";
import { glassesOn } from "@/features/water/store";
import type { AssistantFactsInput } from "@shared/domain/assistantFacts";
import { freshness } from "@shared/domain/evidence";
import { localDate, MEAL_TYPES, mealTypeForTime, sumMacros, type MealType } from "@shared/domain/food";
import { SLOT_MINUTE } from "@shared/domain/planDay";
import { computeGap, minuteOfDay } from "@shared/domain/gap";
import { activeFacts } from "@shared/domain/memory";
import { addDays, trendSeries, weeklyTrendChange } from "@shared/domain/progress";
import { computeStreak } from "@shared/domain/streak";
import { clampWaterGoal } from "@shared/domain/water";
import { weekDates } from "@shared/domain/week";

export type TurnSnapshot = {
  userId: string;
  coach: CoachId;
  today: string;
  context: CoachDayContext;
  facts: AssistantFactsInput;
  vocab: { usuals: string[]; aliases: { heard: string; means: string }[]; recent: string[]; exercises: string[] };
};

const unique = (list: readonly string[], max: number) => [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, max);
const clip = (s: string, n: number) => s.slice(0, n);
const WEEK_MS = 7 * 86_400_000;

/** null until this profile has targets (onboarding not finished, or never opened on this phone). */
export function buildSnapshot(userId: string, nowMs = Date.now()): TurnSnapshot | null {
  const profile = readCachedProfile(userId);
  if (!profile) return null;
  const now = new Date(nowMs);
  const today = localDate(now);
  const base = targetsFromProfile(profile, now);
  if (!base) return null;
  const effective = effectiveTargets(base, profile, listPhases(userId), listCheckins(userId), today).targets;
  const targets = targetsOn(userId, today, effective);

  const meals = mealsForDay(userId, today);
  const eaten = sumMacros(meals.map(mealTotals));
  const credit = dayCredit(userId, today);
  const steps = cachedSteps(userId, today)?.steps ?? null;
  const pending = !!getDb().getFirstSync(
    `SELECT id FROM voice_queue WHERE user_id = ? AND date(created_at, 'localtime') = ? LIMIT 1`,
    userId,
    today,
  );
  const coverage = pending ? "pending" : coverageFor(userId, today);
  const gap = computeGap({
    targets: { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG },
    eaten,
    burnedKcal: credit.kcal,
    minuteOfDay: minuteOfDay(now),
  });
  const weights = listWeights(userId);
  const series = trendSeries(weighInsFor(weights, profile));
  const latest = series[series.length - 1] ?? null;
  const dg: DayGap = {
    coverage,
    weightFreshness: freshness(latest ? `${latest.date}T12:00:00` : null, nowMs, WEEK_MS),
    userId,
    day: today,
    minute: minuteOfDay(now),
    gap,
    targets,
    burnedKcal: credit.kcal,
    steps,
    weightKg: latest?.trendKg ?? profile.weightKg ?? 0,
    workoutToday: workoutCounts(userId, today, today).workouts > 0,
    mealNames: meals.map((m) => m.items.map((i) => i.name).join(", ")),
  };
  const streak = computeStreak(loggedDates(userId), today, now.getHours());
  const plan = planFor(userId, today)?.plan ?? null;
  const facts = factsFor(userId);
  const texts = activeFacts(facts, today).texts;

  const week = weekDates(today);
  const intake = new Map(completeIntake(userId, week[0]!, today).map((d) => [d.date, d]));
  const trained = new Set((plan?.week.days ?? []).filter((d) => d.date < today && d.train).map((d) => d.date));
  const todayRow = plan?.week.days.find((d) => d.date === today);
  // Food ideas for each meal still to come: the plan's ranked options for that slot (the planner already fitted them
  // to what's left), else the food ideas screen's own ranking for the gap. The next one answers "what should I eat?".
  const loggedSlots = new Set(meals.map((m) => m.mealType));
  const minute = minuteOfDay(now);
  const nextMeal = plan?.items.find((i) => i.kind === "meal" && i.at >= minute - 30 && !loggedSlots.has(i.slot));
  const later = MEAL_TYPES.filter((m) => !loggedSlots.has(m) && SLOT_MINUTE[m] >= minute - 90);
  const eatFor: MealType = nextMeal?.kind === "meal" ? nextMeal.slot : (later[0] ?? mealTypeForTime(now));
  const slots = [...new Set([eatFor, ...later])];
  const ranked = eatOptionsFor({ userId, today, gap, diet: profile.diet ?? "non_veg", mealTypes: slots });
  const idea = (o: { name: string; macros: { kcal: number; proteinG: number } }) => ({
    name: clip(o.name, 80),
    kcal: Math.round(o.macros.kcal),
    proteinG: Math.round(o.macros.proteinG),
  });
  const eatBySlot: Partial<Record<MealType, ReturnType<typeof idea>[]>> = {};
  for (const slot of slots) {
    const planned = plan?.items.find((i) => i.kind === "meal" && i.slot === slot);
    const options = planned?.kind === "meal" && planned.options.length ? planned.options : (ranked[slot] ?? []);
    eatBySlot[slot] = options.slice(0, 5).map(idea);
  }
  const yesterday = addDays(today, -1);
  const mealFacts = [...mealsForDay(userId, yesterday).map((m) => ({ m, date: yesterday })), ...meals.map((m) => ({ m, date: today }))]
    .slice(-16)
    .map(({ m, date }) => {
      const t = mealTotals(m);
      return { date, mealType: m.mealType, text: clip(m.items.map((i) => i.name.toLowerCase()).join(", "), 160), kcal: Math.round(t.kcal), proteinG: Math.round(t.proteinG) };
    });

  const factsInput: AssistantFactsInput = {
    today,
    day: {
      targetKcal: Math.round(targets.kcal),
      eatenKcal: Math.round(eaten.kcal),
      targetProteinG: Math.round(targets.proteinG),
      eatenProteinG: Math.round(eaten.proteinG),
      steps,
      stepGoal: targets.steps,
      glasses: glassesOn(userId, today),
      waterGoal: clampWaterGoal(profile.waterGoalGlasses),
      workoutToday: dg.workoutToday,
      mealsLogged: meals.length,
      coverage: coverage === "complete" || coverage === "partial" || coverage === "pending" ? coverage : "unknown",
    },
    streak: { current: streak.current, best: streak.best, atRisk: streak.atRisk },
    week: plan
      ? {
          days: week
            .filter((d) => d <= today)
            .map((d) => {
              const logged = intake.get(d);
              return {
                date: d,
                kcal: d === today ? Math.round(eaten.kcal) : logged ? Math.round(logged.kcal) : null,
                proteinG: d === today ? Math.round(eaten.proteinG) : logged ? Math.round(logged.proteinG) : null,
                targetKcal: Math.round(effective.kcal),
                targetProteinG: Math.round(effective.proteinG),
                trained: trained.has(d),
              };
            }),
          sessionsDone: plan.week.sessionsDone,
          sessionsTarget: plan.week.sessionsTarget,
        }
      : null,
    trend: { trendKg: latest?.trendKg ?? null, weeklyChangeKg: weeklyTrendChange(series, today), weighIns: weights.length },
    plan: plan
      ? {
          dayType: plan.dayType,
          kcal: Math.round(plan.targets.kcal),
          proteinG: Math.round(plan.targets.proteinG),
          steps: plan.targets.steps,
          items: plan.items.slice(0, 6).map((i) => clip(`${itemTime(i)} ${itemTitle(i)}`, 120)),
          why: [...(todayRow ? adjustLines(todayRow, today) : []), ...whyText(plan.why)].slice(0, 4).map((w) => clip(w, 160)),
        }
      : null,
    eat: eatBySlot[eatFor] ?? [],
    eatFor,
    eatBySlot,
    meals: mealFacts,
  };

  return {
    userId,
    // Zorka's voice follows the picked coach; a profile without one gets the calm one rather than no assistant.
    coach: profile.coach ?? "calm_mentor",
    today,
    context: { ...dayContext(dg, profile, streak, now), ...lifeContext(plan, texts, today) },
    facts: factsInput,
    vocab: {
      usuals: unique(usualMeals(userId).map((u) => u.items.map((i) => i.name).join(" + ")), 12).map((s) => clip(s, 80)),
      aliases: aliasesFor(userId).slice(0, 30).map((a) => ({ heard: clip(a.heard, 60), means: clip(a.means, 80) })),
      recent: unique(recentFoods(userId, 20).map((f) => f.name), 20).map((s) => clip(s, 80)),
      exercises: unique(recentWorkouts(userId, 6).flatMap((w) => w.exercises.map((e) => e.name)), 20).map((s) => clip(s, 60)),
    },
  };
}
