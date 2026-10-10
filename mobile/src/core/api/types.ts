// API contract types — mirror backend/src/modules/*/…schemas.ts. Keep the two in step.

export type Goal = "lose_fat" | "build_muscle" | "maintain" | "get_fitter";
export type Sex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type DietPref = "veg" | "eggetarian" | "jain" | "non_veg";
export type Pace = "gentle" | "steady" | "ambitious";
export type CoachId = "drill_sergeant" | "calm_mentor" | "desi_legend";

export type UserSummary = { id: string; displayName: string; onboarded: boolean };

export type Profile = {
  userId: string;
  displayName: string;
  goal: Goal | null;
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  diet: DietPref | null;
  targetWeightKg: number | null;
  pace: Pace | null;
  coach: CoachId | null;
  onboardedAt: string | null;
  updatedAt: string | null;
};

export type ProfileUpdate = Partial<Omit<Profile, "userId" | "displayName" | "updatedAt">>;

export type SyncEntity = "sync_probe";
export type SyncOp = {
  opId: string;
  entity: SyncEntity;
  action: "upsert" | "delete";
  id: string;
  clientUpdatedAt: string;
  data?: unknown;
};
export type SyncResult = { opId: string; status: "applied" | "stale" | "rejected"; message?: string };
