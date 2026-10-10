import type { Profile } from "@/core/api/types";

const GOAL = { lose_fat: "Lose fat", build_muscle: "Build muscle", maintain: "Maintain", get_fitter: "Get fitter" };
const ACTIVITY = {
  sedentary: "Mostly sitting",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Active",
  very_active: "Very active",
};
const DIET = { veg: "Veg", eggetarian: "Eggetarian", jain: "Jain", non_veg: "Non-veg" };
const SEX = { male: "Male", female: "Female", unspecified: "Prefer not to say" };
const PACE = { gentle: "Gentle", steady: "Steady", ambitious: "Ambitious" };
const COACH = { drill_sergeant: "Drill Sergeant", calm_mentor: "Calm Mentor", desi_legend: "Desi Legend" };

const dash = "—";
const num = (v: number | null, unit: string) => (v == null ? dash : `${v} ${unit}`);

export function profileRows(p: Profile): { label: string; value: string }[] {
  return [
    { label: "Goal", value: p.goal ? GOAL[p.goal] : dash },
    { label: "Age", value: p.age == null ? dash : String(p.age) },
    { label: "Sex", value: p.sex ? SEX[p.sex] : dash },
    { label: "Height", value: num(p.heightCm, "cm") },
    { label: "Weight", value: num(p.weightKg, "kg") },
    { label: "Activity", value: p.activityLevel ? ACTIVITY[p.activityLevel] : dash },
    { label: "Diet", value: p.diet ? DIET[p.diet] : dash },
    { label: "Target weight", value: num(p.targetWeightKg, "kg") },
    { label: "Pace", value: p.pace ? PACE[p.pace] : dash },
    { label: "Coach", value: p.coach ? COACH[p.coach] : dash },
  ];
}
