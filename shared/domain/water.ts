// Water intake, counted in glasses. Pure domain logic shared by mobile and backend (D24): no imports, no I/O.
// The daily goal is set during onboarding (S07 target step) and kept on the profile; each tap on Today logs one glass.

export const WATER_GOAL_DEFAULT = 8;
export const WATER_GOAL_MIN = 1;
export const WATER_GOAL_MAX = 20;
/** Most glasses one water log can carry (the server bound). */
export const WATER_LOG_MAX_GLASSES = 10;

/** A water goal from the profile, or the default when it's missing or out of range. */
export function clampWaterGoal(goal: number | null | undefined): number {
  if (goal == null || !Number.isFinite(goal)) return WATER_GOAL_DEFAULT;
  return Math.min(WATER_GOAL_MAX, Math.max(WATER_GOAL_MIN, Math.round(goal)));
}
