// LA1 · Standing life from the profile, plus the copy the onboarding step and "What Zorka knows" show.
import type { Profile } from "@/core/api/types";
import { EMPTY_STANDING, type BudgetBand, type MealSource, type Standing, type WorkPattern } from "@shared/domain/life";

export function standingFrom(profile: Profile | null | undefined): Standing {
  if (!profile) return EMPTY_STANDING;
  return {
    mealSource: profile.mealSource ?? null,
    budget: profile.budget ?? null,
    workPattern: profile.workPattern ?? null,
    hasKitchen: profile.hasKitchen ?? null,
    hasFridge: profile.hasFridge ?? null,
    sessionsPerWeek: profile.sessionsPerWeek ?? null,
  };
}

export const MEAL_SOURCE_OPTIONS: { value: MealSource; title: string; body: string }[] = [
  { value: "home_family", title: "Home, family cooks", body: "Someone at home makes most meals." },
  { value: "home_self", title: "Home, I cook", body: "You make most of your own meals." },
  { value: "mess", title: "Hostel or PG mess", body: "A fixed menu you don't choose." },
  { value: "canteen", title: "Office or college canteen", body: "You pick from what's on the counter." },
  { value: "eat_out", title: "Mostly eat out or order in", body: "Restaurants, tiffin services, delivery." },
  { value: "mixed", title: "A mix", body: "It changes day to day." },
];

export const BUDGET_OPTIONS: { value: BudgetBand; title: string; body: string }[] = [
  { value: "comfortable", title: "Comfortable", body: "Food cost isn't a worry." },
  { value: "careful", title: "Careful", body: "You keep an eye on what you spend." },
  { value: "tight", title: "Tight", body: "Every rupee counts. Suggestions stay cheap." },
];

export const WORK_PATTERN_OPTIONS: { value: WorkPattern; title: string; body: string }[] = [
  { value: "office", title: "Office hours", body: "Roughly 9:30 to 6 on weekdays." },
  { value: "student", title: "Student", body: "Classes most weekdays." },
  { value: "wfh", title: "Work from home", body: "Your own desk, your own kitchen." },
  { value: "shifts", title: "Shifts", body: "Hours change week to week." },
  { value: "irregular", title: "No fixed pattern", body: "Every day looks different." },
];

export const label = <T extends string>(options: { value: T; title: string }[], v: T | null | undefined) =>
  options.find((o) => o.value === v)?.title ?? "Not set";

export const minuteLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
