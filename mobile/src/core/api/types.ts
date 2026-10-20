// API contract types — mirror backend/src/modules/*/…schemas.ts. Keep the two in step.
import type { AskTopic, AssistantAction, Confidence, Tier } from "@shared/domain/assistant";
import type { AnswerCard } from "@shared/domain/assistantFacts";
import type { DayType } from "@shared/domain/dayType";
import type { FoodUnit, Macros, MealType } from "@shared/domain/food";
import type { ExerciseCategory, ExerciseType, SetValues } from "@shared/domain/gym";
import type { BudgetBand, DayFacts, MealSource as LifeMealSource, WorkPattern } from "@shared/domain/life";
import type { MenuTag, Range } from "@shared/domain/menu";

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
  /** D48: daily step goal, 2,000–100,000 (UX F13). */
  stepGoal: number;
  /** Daily water goal, in glasses (1–20). */
  waterGoalGlasses: number;
  /** P28 (D50): show the detailed weekly check-in instead of the simple one. */
  checkinDetailed: boolean;
  /** LA1 standing life (docs/LIFE_PLAN.md). Missing from a server older than LA1. */
  mealSource?: LifeMealSource | null;
  budget?: BudgetBand | null;
  workPattern?: WorkPattern | null;
  hasKitchen?: boolean | null;
  hasFridge?: boolean | null;
  sessionsPerWeek?: number | null;
  /** D73: minute of the day for the evening brief prompt; null = off. */
  briefPromptMinute?: number | null;
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
  | "phase"
  | "day_brief"
  | "day_plan"
  | "memory_fact";

/** GET /users/:id/changes (backend/src/modules/sync/changes.ts). */
export type PullEntity =
  | "meal_log"
  | "workout"
  | "routine"
  | "activity"
  | "weight_log"
  | "water_log"
  | "checkin"
  | "phase"
  | "day_brief"
  | "day_plan"
  | "memory_fact";
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

// ── Food lookup — mirrors backend/src/modules/foodLookup/lookup.schemas.ts ────────────────────────

/** The serving choices Create food offers. "g" means per 100 g. */
export type LookupUnit = "piece" | "katori" | "bowl" | "plate_full" | "glass" | "serving" | "g";
export type FoodLookupResult = {
  query: string;
  found: boolean;
  food: {
    name: string;
    diet: DietPref | null;
    liquid: boolean;
    homeCooked: boolean;
    serving: { unit: LookupUnit; grams: number };
    /** Macros for ONE serving. */
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  source: { title: string; url: string } | null;
  provider: string | null;
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
  /** LA6: the user's date, today's day type and plan, the week, and up to 8 active facts. */
  today?: string;
  dayType?: "normal" | "busy" | "away" | "travel" | "late_work" | "feast" | "exam" | "sick" | "rest";
  planSummary?: string[];
  weekSummary?: string[];
  facts?: string[];
};
/** UX N1 · Screens a coach button may open (backend COACH_SCREENS). */
export type CoachScreen =
  | "gap"
  | "move"
  | "quick_log"
  | "log_weight"
  | "progress"
  | "checkin"
  | "steps"
  | "record_walk"
  | "day"
  | "share_day"
  | "plan_tomorrow"
  | "menu_scan";
/** UX N1 · A button under a coach reply. */
export type CoachAction =
  | { type: "log_meal"; label: string; text: string }
  | { type: "plan_meal" | "save_idea" | "ate_meal"; label: string; text: string }
  | { type: "open"; label: string; screen: CoachScreen }
  | { type: "start_workout"; label: string }
  /** LA6: opens the brief for that date, pre-filled. */
  | { type: "plan_day"; label: string; date: string; text: string }
  /** LA6 (D78): "Remember this?" before saving a fact. */
  | { type: "remember_fact"; label: string; text: string };
export type CoachChatResult = {
  reply: string;
  kind: "ai" | "support" | "fallback";
  /** Missing from a server older than UX4. */
  actions?: CoachAction[];
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

// ── Life plan (LA2, LA7) — mirrors backend/src/modules/{briefs,menu}/…schemas.ts ──────────────────
export type BriefParseResult = {
  transcript: string | null;
  facts: DayFacts;
  question: string | null;
  ai: { slot: string; model: string; attempts: number };
};
export type MenuReadDish = {
  name: string;
  gloss?: string;
  section?: string;
  price?: number | null;
  veg: boolean | null;
  tags: MenuTag[];
  est: { kcal: Range; proteinG: Range; carbsG: Range; fatG: Range };
};
export type MenuReadResult = {
  page: number;
  unreadable: boolean;
  restaurant: string | null;
  cuisine: string | null;
  currency: string | null;
  dishes: MenuReadDish[];
  ai: { slot: string; model: string; attempts: number };
};

// ── Assistant Bar (AB2) — mirrors backend/src/modules/assistant/assistant.schemas.ts ────────────────

/** A parsed food plus its runner-up score and the top 3 other foods (the chip's alternatives, AB6). */
export type AssistantParsedItem = ParsedItem & { runnerUp: number | null; alternatives: Food[] };

export type AskPatch = { mealType: MealType } | { itemIndex: number; quantity: number; unit: FoodUnit };
export type AskQuestion = { question: string; options: { label: string; patch: AskPatch }[] };

export type AssistantResolution =
  | { kind: "meal"; items: AssistantParsedItem[]; mealType: MealType }
  | { kind: "workout"; sets: GymParsedSet[]; usual: boolean }
  | { kind: "day"; facts: DayFacts; dayType: DayType; question: string | null }
  | { kind: "answer"; topic: AskTopic; date: string; known: boolean; lines: string[]; numbers: number[]; card: AnswerCard | null }
  /** exercise_ref: exercises from the user's list with their MuscleWiki page (url null: a custom one without a link). */
  | { kind: "exercises"; query: string; category: ExerciseCategory | null; matches: { id: string; name: string; category: ExerciseCategory; url: string | null }[] }
  /** create_routine: matched exercises with their targets, and the words that matched none. */
  | { kind: "routine"; name: string; exercises: { exercise: Exercise; targetSets: number; targetReps: number | null }[]; unmatched: string[] };

export type AssistantTurnItem = {
  action: AssistantAction;
  tier: Tier;
  resolved: AssistantResolution | null;
  ask: AskQuestion | null;
  line: string;
};

export type AssistantTurnResult = {
  heard: { text: string; source: "voice" | "text"; confidence: Confidence };
  kind: "actions" | "support" | "no_speech";
  items: AssistantTurnItem[];
  dropped: { kind: string | null; reason: string }[];
  reply: string;
  replyKind: "ai" | "template" | "support" | "redirect" | "none";
  timings: { sttMs: number | null; routerMs: number; resolveMs: number; phraseMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number } | null;
};
