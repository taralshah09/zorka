// Onboarding copy — DESIGN.md §6.2 (S03, S05, S06, S07).
import type { ActivityLevel, DietPref, Goal, Pace, Sex } from "@/core/api/types";
import type { IconName } from "@/core/icons/Icon";

export const GOAL_OPTIONS: readonly { value: Goal; title: string; body: string; icon: IconName }[] = [
  {
    value: "lose_fat",
    title: "Lose fat",
    body: "Drop body fat and keep your strength.",
    icon: "local_fire_department",
  },
  {
    value: "build_muscle",
    title: "Build muscle",
    body: "Gain muscle with a small calorie surplus.",
    icon: "fitness_center",
  },
  { value: "maintain", title: "Maintain", body: "Stay at your weight and eat well.", icon: "monitor_weight" },
  {
    value: "get_fitter",
    title: "Get fitter",
    body: "Move more and feel better. Weight stays steady.",
    icon: "directions_run",
  },
];

export const SEX_OPTIONS: readonly { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

export const ACTIVITY_OPTIONS: readonly { value: ActivityLevel; title: string; body: string }[] = [
  { value: "sedentary", title: "Mostly sitting", body: "Desk job, little walking." },
  { value: "light", title: "Lightly active", body: "Desk job plus daily walks, or light workouts 1–3 days a week." },
  { value: "moderate", title: "Moderately active", body: "On my feet most of the day, or workouts 3–5 days a week." },
  { value: "active", title: "Active", body: "Physical job, or hard training 6–7 days a week." },
  { value: "very_active", title: "Very active", body: "Physical job plus daily training, or training twice a day." },
];

export const DIET_OPTIONS: readonly { value: DietPref; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "jain", label: "Jain" },
  { value: "non_veg", label: "Non-veg" },
];

export const PACE_STOPS: readonly { value: Pace; label: string }[] = [
  { value: "gentle", label: "Gentle" },
  { value: "steady", label: "Steady" },
  { value: "ambitious", label: "Ambitious" },
];

export const GOAL_LABEL: Record<Goal, string> = {
  lose_fat: "Lose fat",
  build_muscle: "Build muscle",
  maintain: "Maintain",
  get_fitter: "Get fitter",
};

export const ACTIVITY_LABEL = Object.fromEntries(ACTIVITY_OPTIONS.map((o) => [o.value, o.title])) as Record<
  ActivityLevel,
  string
>;
export const PACE_LABEL = Object.fromEntries(PACE_STOPS.map((o) => [o.value, o.label])) as Record<Pace, string>;
