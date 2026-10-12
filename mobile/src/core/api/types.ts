// API contract types — mirror backend/src/modules/*/…schemas.ts. Keep the two in step.
import type { FoodUnit, Macros } from "@shared/domain/food";
import type { ExerciseCategory, ExerciseType, SetValues } from "@shared/domain/gym";

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
  /** P18: ask about oil/ghee for home-cooked food on the confirm sheet. */
  oilGheePrompt: boolean;
  /** D48: daily step goal, 8,000–100,000. */
  stepGoal: number;
  /** Daily water goal, in glasses (1–20). */
  waterGoalGlasses: number;
  /** P28 (D50): show the detailed weekly check-in instead of the simple one. */
  checkinDetailed: boolean;
  onboardedAt: string | null;
  updatedAt: string | null;
};

export type ProfileUpdate = Partial<Omit<Profile, "userId" | "displayName" | "updatedAt">>;

export type SyncEntity =
  | "sync_probe"
  | "meal_log"
  | "custom_food"
  | "custom_exercise"
  | "workout"
  | "routine"
  | "activity"
  | "weight_log"
  | "water_log"
  | "checkin"
  | "phase";

/** GET /users/:id/changes (backend/src/modules/sync/changes.ts). */
export type PullEntity =
  "meal_log" | "workout" | "routine" | "activity" | "weight_log" | "water_log" | "checkin" | "phase";
export type Change = { entity: PullEntity; id: string; deleted: boolean; data: unknown };
export type ChangesPage = { changes: Change[]; cursor: string; more: boolean };
export type SyncOp = {
  opId: string;
  entity: SyncEntity;
  action: "upsert" | "delete";
  id: string;
  clientUpdatedAt: string;
  data?: unknown;
};
export type SyncResult = { opId: string; status: "applied" | "stale" | "rejected"; message?: string };

// ── Nearby options (P34) — mirrors backend/src/modules/nearby/nearby.schemas.ts ──────────────────

export type NearbyArea = { locality?: string; city?: string; pincode?: string };
export type NearbyOption = {
  id: string;
  source: "zomato" | "blinkit";
  name: string;
  restaurant: string | null;
  url: string;
  macros: Macros;
  diet: DietPref | null;
  estimate: true;
};
export type NearbyResult = {
  areaKey: string;
  fetchedAt: string;
  expiresAt: string;
  options: NearbyOption[];
  providers: string[];
  partial: boolean;
};

// ── Coach chat (P35) — mirrors backend/src/modules/coach/coach.schemas.ts ────────────────────────

export type CoachDayContext = {
  name?: string | null;
  goal?: Goal | null;
  diet?: DietPref | null;
  localTime: string;
  state: "on_track" | "under" | "over" | "done";
  targetKcal: number;
  floorKcal: number;
  kcalLeft: number;
  proteinLeftG: number;
  carbsLeftG: number;
  fatLeftG: number;
  eatenKcal: number;
  eatenProteinG: number;
  burnedKcal: number;
  steps?: number | null;
  stepGoal: number;
  streakDays: number;
  workoutToday: boolean;
  mealsToday: string[];
};
export type CoachChatResult = {
  reply: string;
  kind: "ai" | "support" | "fallback";
  ai: { slot: string; model: string; attempts: number } | null;
};

// ── Foods (P11–P13) — mirrors backend/src/modules/foods/foods.schemas.ts ─────────────────────────

export type Cuisine = "indian" | "indo_chinese" | "italian" | "continental" | "other";
export type FoodCategory =
  | "home_meal"
  | "restaurant"
  | "bread"
  | "rice"
  | "protein"
  | "dairy"
  | "drink"
  | "snack"
  | "sweet"
  | "fruit"
  | "vegetable";

export type Food = {
  id: string;
  name: string;
  aliases: string[];
  cuisine: Cuisine;
  category: FoodCategory;
  diet: DietPref;
  homeCooked: boolean;
  liquid: boolean;
  per100g: Macros;
  defaultUnit: FoodUnit;
  units: { unit: FoodUnit; grams: number; label: string | null }[];
  source: string;
  custom: boolean;
  updatedAt: string;
};

// ── Meal parsing (P15–P17) — mirrors backend/src/modules/mealParse/parse.schemas.ts ──────────────

export type UncertainReason = "low_confidence" | "no_match" | "vague_quantity" | "unit_unknown";

export type ParsedItem = {
  query: string;
  food: Food | null;
  matchScore: number | null;
  quantity: number;
  unit: FoodUnit;
  grams: number;
  macros: Macros;
  confidence: number;
  uncertain: boolean;
  reasons: UncertainReason[];
};

export type FollowUp = {
  question: string;
  itemIndexes: number[];
  options: { label: string; quantity: number; unit: FoodUnit }[];
};

export type ParseResult = {
  source: "text" | "voice" | "photo";
  transcript: string | null;
  items: ParsedItem[];
  followUp: FollowUp | null;
  timings: { sttMs: number | null; aiMs: number; matchMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number };
};

// ── Gym (P19–P22) — mirrors backend/src/modules/{exercises,gymParse}/…schemas.ts ────────────────

export type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  category: ExerciseCategory;
  type: ExerciseType;
  /** MuscleWiki how-to page (D38). */
  referenceUrl: string | null;
  source: string;
  custom: boolean;
  updatedAt: string;
};

export type GymUncertainReason = "low_confidence" | "no_match" | "missing_values";

export type GymParsedSet = {
  query: string;
  exercise: Exercise | null;
  matchScore: number | null;
  values: SetValues;
  count: number;
  confidence: number;
  uncertain: boolean;
  reasons: GymUncertainReason[];
};

export type GymParseResult = {
  transcript: string;
  sets: GymParsedSet[];
  timings: { sttMs: number; aiMs: number; matchMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number };
};
