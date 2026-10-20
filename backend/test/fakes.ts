// In-memory repositories + a test app. No database needed.
import { pino } from "pino";

import { EXERCISE_SOURCE, EXERCISES } from "../prisma/data/exercises.js";
import { FOOD_SOURCE, FOODS } from "../prisma/data/foods.js";
import { createApp, type AppDeps } from "../src/app.js";
import { createAiClient, type AiClient } from "../src/modules/ai/ai.client.js";
import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { exercisesFromRows } from "../src/modules/exercises/catalog.js";
import type { ActivitiesRepository, ActivityRecord } from "../src/modules/activities/activities.repository.js";
import { activitiesService } from "../src/modules/activities/activities.service.js";
import type { CheckinRecord, CheckinsRepository } from "../src/modules/checkins/checkins.repository.js";
import { checkinsService } from "../src/modules/checkins/checkins.service.js";
import type { ExerciseRecord, ExercisesRepository } from "../src/modules/exercises/exercises.repository.js";
import { exercisesService } from "../src/modules/exercises/exercises.service.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import type { FoodRecord, FoodsRepository } from "../src/modules/foods/foods.repository.js";
import { foodsService } from "../src/modules/foods/foods.service.js";
import { coachService } from "../src/modules/coach/coach.service.js";
import { gymParseService } from "../src/modules/gymParse/gymParse.service.js";
import { foodLookupService } from "../src/modules/foodLookup/lookup.service.js";
import { nearbyService } from "../src/modules/nearby/nearby.service.js";
import { createSearchClient, type SearchClient } from "../src/modules/nearby/search.client.js";
import { parseService } from "../src/modules/mealParse/parse.service.js";
import type { MealRecord, MealsRepository } from "../src/modules/meals/meals.repository.js";
import { mealsService } from "../src/modules/meals/meals.service.js";
import type { PhaseRecord, PhasesRepository } from "../src/modules/phases/phases.repository.js";
import { phasesService } from "../src/modules/phases/phases.service.js";
import type { RoutineRecord, RoutinesRepository } from "../src/modules/routines/routines.repository.js";
import { routinesService } from "../src/modules/routines/routines.service.js";
import type { SyncRepository, ProbeRecord } from "../src/modules/sync/sync.repository.js";
import { changesService } from "../src/modules/sync/changes.js";
import { syncService } from "../src/modules/sync/sync.service.js";
import type { UsersRepository, UserWithProfile } from "../src/modules/users/users.repository.js";
import { usersService } from "../src/modules/users/users.service.js";
import type { WeightLogRecord, WeightsRepository } from "../src/modules/weights/weights.repository.js";
import { weightsService } from "../src/modules/weights/weights.service.js";
import type { WaterLogRecord, WaterRepository } from "../src/modules/water/water.repository.js";
import { waterService } from "../src/modules/water/water.service.js";
import type { WorkoutRecord, WorkoutsRepository } from "../src/modules/workouts/workouts.repository.js";
import { workoutsService } from "../src/modules/workouts/workouts.service.js";
import { briefsService } from "../src/modules/briefs/briefs.service.js";
import type { DayBriefRecord, DayPlanRecord, LifeRepositories, MemoryFactRecord } from "../src/modules/life/life.repository.js";
import { lifeService } from "../src/modules/life/life.service.js";
import { menuService } from "../src/modules/menu/menu.service.js";
import { aiPlanService } from "../src/modules/aiPlan/aiPlan.service.js";
import { assistantService } from "../src/modules/assistant/assistant.service.js";

export const RIYA = "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11";
export const ARJUN = "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22";
export const UNKNOWN = "00000000-0000-4000-8000-000000000000";

export function memoryUsers(): UsersRepository & { rows: Map<string, UserWithProfile> } {
  const now = new Date("2026-10-11T00:00:00Z");
  const rows = new Map<string, UserWithProfile>(
    [
      [RIYA, "Riya"],
      [ARJUN, "Arjun"],
    ].map(([id, displayName]) => [id!, { id: id!, displayName: displayName!, createdAt: now, updatedAt: now, profile: null }]),
  );
  return {
    rows,
    list: async () => [...rows.values()],
    findById: async (id) => rows.get(id) ?? null,
    upsertProfile: async (userId, data) => {
      const user = rows.get(userId)!;
      const base = user.profile ?? {
        userId,
        goal: null,
        age: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        activityLevel: null,
        diet: null,
        targetWeightKg: null,
        pace: null,
        coach: null,
        oilGheePrompt: false,
        stepGoal: 8000,
        waterGoalGlasses: 8,
        checkinDetailed: false,
        mealSource: null,
        budget: null,
        workPattern: null,
        hasKitchen: null,
        hasFridge: null,
        sessionsPerWeek: null,
        briefPromptMinute: null,
        onboardedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const { onboardedAt, ...rest } = data;
      const profile = {
        ...base,
        ...rest,
        ...(onboardedAt !== undefined ? { onboardedAt: onboardedAt ? new Date(onboardedAt) : null } : null),
        updatedAt: new Date(),
      };
      rows.set(userId, { ...user, profile });
      return profile;
    },
  };
}

export function memorySync(userIds: string[]): SyncRepository & { probes: Map<string, ProbeRecord> } {
  const probes = new Map<string, ProbeRecord>();
  return {
    probes,
    userExists: async (id) => userIds.includes(id),
    findProbe: async (id) => probes.get(id) ?? null,
    upsertProbe: async (r) => {
      probes.set(r.id, { ...r, deletedAt: null });
    },
    softDeleteProbe: async (id, at) => {
      const p = probes.get(id);
      if (p) probes.set(id, { ...p, deletedAt: at, clientUpdatedAt: at });
    },
    listProbes: async (userId) => [...probes.values()].filter((p) => p.userId === userId && !p.deletedAt),
  };
}

const T0 = new Date("2026-10-11T00:00:00Z");

/** The real curated catalog, in memory, plus user-created foods. */
export function memoryFoods(userIds: string[]): FoodsRepository & { rows: Map<string, FoodRecord> } {
  const rows = new Map<string, FoodRecord>(
    foodsFromRows(FOODS).map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name,
        aliases: f.aliases,
        cuisine: f.cuisine,
        category: f.category,
        diet: f.diet,
        homeCooked: f.homeCooked,
        liquid: f.liquid,
        per100g: { kcal: f.kcalPer100g, proteinG: f.proteinPer100g, carbsG: f.carbsPer100g, fatG: f.fatPer100g },
        defaultUnit: f.defaultUnit,
        units: f.units.map((u) => ({ ...u, label: null })),
        source: FOOD_SOURCE,
        custom: false,
        ownerUserId: null,
        clientUpdatedAt: null,
        deletedAt: null,
        updatedAt: T0,
      },
    ]),
  );
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    listCatalog: async (userId) =>
      [...rows.values()].filter((f) => !f.deletedAt && (f.ownerUserId === null || f.ownerUserId === userId)),
    findFood: async (id) => rows.get(id) ?? null,
    existingIds: async (ids) => new Set(ids.filter((id) => rows.has(id))),
    upsertCustomFood: async (f) => {
      rows.set(f.id, {
        id: f.id,
        name: f.name,
        aliases: [],
        cuisine: "other",
        category: f.category,
        diet: f.diet,
        homeCooked: f.homeCooked,
        liquid: f.liquid,
        per100g: f.per100g,
        defaultUnit: f.defaultUnit,
        units: f.units.map((u) => ({ ...u, label: null })),
        source: "user",
        custom: true,
        ownerUserId: f.ownerUserId,
        clientUpdatedAt: f.clientUpdatedAt,
        deletedAt: null,
        updatedAt: new Date(),
      });
    },
    softDeleteCustomFood: async (id, at) => {
      const f = rows.get(id);
      if (f) rows.set(id, { ...f, deletedAt: at, clientUpdatedAt: at });
    },
  };
}

export function memoryMeals(userIds: string[]): MealsRepository & { rows: Map<string, MealRecord> } {
  const rows = new Map<string, MealRecord>();
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    findMeal: async (id) => rows.get(id) ?? null,
    upsertMeal: async ({ id, userId, clientUpdatedAt, loggedAt, ...m }) => {
      rows.set(id, { ...m, id, userId, clientUpdatedAt, loggedAt: new Date(loggedAt), deletedAt: null });
    },
    softDeleteMeal: async (id, at) => {
      const m = rows.get(id);
      if (m) rows.set(id, { ...m, deletedAt: at, clientUpdatedAt: at });
    },
    listMeals: async (userId, localDate) =>
      [...rows.values()]
        .filter((m) => m.userId === userId && m.localDate === localDate && !m.deletedAt)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime()),
    listChanged: async (userId, since, limit) => changed(rows, userId, since, limit),
  };
}

/** The real curated exercise list, in memory, plus user-created exercises (P19). */
export function memoryExercises(userIds: string[]): ExercisesRepository & { rows: Map<string, ExerciseRecord> } {
  const rows = new Map<string, ExerciseRecord>(
    exercisesFromRows(EXERCISES).map(({ slug: _s, ...e }) => [
      e.id,
      { ...e, source: EXERCISE_SOURCE, custom: false, ownerUserId: null, clientUpdatedAt: null, deletedAt: null, updatedAt: T0 },
    ]),
  );
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    listCatalog: async (userId) =>
      [...rows.values()].filter((e) => !e.deletedAt && (e.ownerUserId === null || e.ownerUserId === userId)),
    findExercise: async (id) => rows.get(id) ?? null,
    existingIds: async (ids) => new Set(ids.filter((id) => rows.has(id))),
    upsertCustomExercise: async ({ id, ownerUserId, clientUpdatedAt, ...e }) => {
      rows.set(id, { id, ...e, aliases: [], source: "user", custom: true, ownerUserId, clientUpdatedAt, deletedAt: null, updatedAt: new Date() });
    },
    softDeleteCustomExercise: async (id, at) => {
      const e = rows.get(id);
      if (e) rows.set(id, { ...e, deletedAt: at, clientUpdatedAt: at });
    },
  };
}

export function memoryWorkouts(userIds: string[]): WorkoutsRepository & { rows: Map<string, WorkoutRecord> } {
  const rows = new Map<string, WorkoutRecord>();
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    findWorkout: async (id) => rows.get(id) ?? null,
    upsertWorkout: async ({ id, userId, clientUpdatedAt, startedAt, endedAt, ...w }) => {
      rows.set(id, { ...w, id, userId, clientUpdatedAt, startedAt: new Date(startedAt), endedAt: new Date(endedAt), deletedAt: null });
    },
    softDeleteWorkout: async (id, at) => {
      const w = rows.get(id);
      if (w) rows.set(id, { ...w, deletedAt: at, clientUpdatedAt: at });
    },
    listRecent: async (userId, limit) =>
      [...rows.values()]
        .filter((w) => w.userId === userId && !w.deletedAt)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit),
    listChanged: async (userId, since, limit) => changed(rows, userId, since, limit),
  };
}

export function memoryRoutines(userIds: string[]): RoutinesRepository & { rows: Map<string, RoutineRecord> } {
  const rows = new Map<string, RoutineRecord>();
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    findRoutine: async (id) => rows.get(id) ?? null,
    upsertRoutine: async ({ id, userId, clientUpdatedAt, ...r }) => {
      rows.set(id, { ...r, id, userId, clientUpdatedAt, deletedAt: null });
    },
    softDeleteRoutine: async (id, at) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, deletedAt: at, clientUpdatedAt: at });
    },
    listRoutines: async (userId) =>
      [...rows.values()].filter((r) => r.userId === userId && !r.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
    existingIds: async (ids) => new Set(ids.filter((id) => rows.has(id))),
    listChanged: async (userId, since, limit) => changed(rows, userId, since, limit),
  };
}

export function memoryActivities(): ActivitiesRepository & { rows: Map<string, ActivityRecord> } {
  const rows = new Map<string, ActivityRecord>();
  return {
    rows,
    findActivity: async (id) => rows.get(id) ?? null,
    upsertActivity: async ({ id, userId, clientUpdatedAt, startedAt, endedAt, ...a }) => {
      rows.set(id, {
        ...a,
        id,
        userId,
        clientUpdatedAt,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        deletedAt: null,
        updatedAt: tick(),
      });
    },
    softDeleteActivity: async (id, at) => {
      const a = rows.get(id);
      if (a) rows.set(id, { ...a, deletedAt: at, clientUpdatedAt: at, updatedAt: tick() });
    },
    listChanged: async (userId, since, limit) => changed(rows, userId, since, limit),
  };
}

/** A simple LWW-synced entity in memory (P27 weigh-ins, P28 check-ins, P29 phases). */
function memoryEntity<R extends { id: string; userId: string; clientUpdatedAt: Date; deletedAt: Date | null; updatedAt: Date }>(
  toRecord: (input: { id: string; userId: string; clientUpdatedAt: Date } & Record<string, unknown>) => Omit<R, "deletedAt" | "updatedAt">,
) {
  const rows = new Map<string, R>();
  return {
    rows,
    find: async (id: string) => rows.get(id) ?? null,
    upsert: async (input: { id: string; userId: string; clientUpdatedAt: Date } & Record<string, unknown>) => {
      rows.set(input.id, { ...toRecord(input), deletedAt: null, updatedAt: tick() } as R);
    },
    softDelete: async (id: string, at: Date) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, deletedAt: at, clientUpdatedAt: at, updatedAt: tick() });
    },
    listChanged: async (userId: string, since: Date, limit: number) => changed(rows, userId, since, limit),
  };
}

export function memoryWeights(): WeightsRepository & { rows: Map<string, WeightLogRecord> } {
  const m = memoryEntity<WeightLogRecord>(({ loggedAt, ...w }) => ({ ...w, loggedAt: new Date(loggedAt as string) }) as WeightLogRecord);
  return { rows: m.rows, findWeight: m.find, upsertWeight: m.upsert, softDeleteWeight: m.softDelete, listChanged: m.listChanged };
}

export function memoryWater(): WaterRepository & { rows: Map<string, WaterLogRecord> } {
  const m = memoryEntity<WaterLogRecord>(({ loggedAt, ...w }) => ({ ...w, loggedAt: new Date(loggedAt as string) }) as WaterLogRecord);
  return { rows: m.rows, findWater: m.find, upsertWater: m.upsert, softDeleteWater: m.softDelete, listChanged: m.listChanged };
}

export function memoryCheckins(): CheckinsRepository & { rows: Map<string, CheckinRecord> } {
  const m = memoryEntity<CheckinRecord>((c) => c as unknown as CheckinRecord);
  return { rows: m.rows, findCheckin: m.find, upsertCheckin: m.upsert, softDeleteCheckin: m.softDelete, listChanged: m.listChanged };
}

export function memoryPhases(): PhasesRepository & { rows: Map<string, PhaseRecord> } {
  const m = memoryEntity<PhaseRecord>((p) => p as unknown as PhaseRecord);
  return { rows: m.rows, findPhase: m.find, upsertPhase: m.upsert, softDeletePhase: m.softDelete, listChanged: m.listChanged };
}

/** LA1–LA5: day briefs, day plans and memory facts in memory. */
export function memoryLife(): LifeRepositories & {
  briefRows: Map<string, DayBriefRecord>;
  planRows: Map<string, DayPlanRecord>;
  factRows: Map<string, MemoryFactRecord>;
} {
  const briefs = memoryEntity<DayBriefRecord>((b) => b as unknown as DayBriefRecord);
  const plans = memoryEntity<DayPlanRecord>(({ acceptedAt, ...p }) => ({ ...p, acceptedAt: acceptedAt ? new Date(acceptedAt as string) : null }) as unknown as DayPlanRecord);
  const facts = memoryEntity<MemoryFactRecord>((f) => f as unknown as MemoryFactRecord);
  const repo = (m: typeof briefs | typeof plans | typeof facts) => ({ find: m.find, upsert: m.upsert, softDelete: m.softDelete, listChanged: m.listChanged });
  return {
    briefs: repo(briefs) as LifeRepositories["briefs"],
    plans: repo(plans) as LifeRepositories["plans"],
    facts: repo(facts) as LifeRepositories["facts"],
    briefRows: briefs.rows,
    planRows: plans.rows,
    factRows: facts.rows,
  };
}

/** Server-side change times for the in-memory repos: strictly increasing, like updated_at. */
let clock = Date.parse("2026-10-11T00:00:00.000Z");
const tick = () => new Date((clock += 1000));
const stamps = new WeakMap<object, Date>();

/** listChanged for repos whose records don't carry updatedAt: stamps each stored object on first sight. */
function changed<R extends { id: string; userId: string; updatedAt?: Date }>(
  rows: Map<string, R>,
  userId: string,
  since: Date,
  limit: number,
): (R & { updatedAt: Date })[] {
  return [...rows.values()]
    .map((r) => {
      if (!r.updatedAt && !stamps.has(r)) stamps.set(r, tick());
      return { ...r, updatedAt: r.updatedAt ?? stamps.get(r)! };
    })
    .filter((r) => r.userId === userId && r.updatedAt.getTime() >= since.getTime())
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** An AI client whose network is `fetchImpl` (default: no slots configured). */
export function fakeAi(slots: AiSlot[] = [], fetchImpl?: Fetch, now?: () => number): AiClient {
  return createAiClient({ slots, logger: pino({ level: "silent" }), fetchImpl, now });
}

/** A search client with fake HTTP (P34). No keys → "not set up". */
export function fakeSearch(
  fetchImpl: Fetch = async () => Response.json({ results: [] }),
  keys: Partial<Record<"tavily" | "firecrawl" | "anakin", string>> = { tavily: "t" },
): SearchClient {
  return createSearchClient({ keys, order: ["tavily", "firecrawl", "anakin"], logger: pino({ level: "silent" }), fetchImpl });
}

export function testApp(
  opts: { dbUp?: boolean; ai?: AiClient; search?: SearchClient; now?: () => number; rateLimit?: AppDeps["rateLimit"] } = {},
) {
  const ids = [RIYA, ARJUN];
  const users = memoryUsers();
  const sync = memorySync(ids);
  const foodsRepo = memoryFoods(ids);
  const mealsRepo = memoryMeals(ids);
  const foods = foodsService(foodsRepo);
  const meals = mealsService(mealsRepo, foods.existingIds);
  const exercisesRepo = memoryExercises(ids);
  const workoutsRepo = memoryWorkouts(ids);
  const routinesRepo = memoryRoutines(ids);
  const exercises = exercisesService(exercisesRepo);
  const routines = routinesService(routinesRepo, exercises.existingIds);
  const workouts = workoutsService(workoutsRepo, exercises.existingIds, routines.existingIds);
  const activitiesRepo = memoryActivities();
  const activities = activitiesService(activitiesRepo);
  const weightsRepo = memoryWeights();
  const weights = weightsService(weightsRepo);
  const waterRepo = memoryWater();
  const water = waterService(waterRepo);
  const checkinsRepo = memoryCheckins();
  const checkins = checkinsService(checkinsRepo);
  const phasesRepo = memoryPhases();
  const phases = phasesService(phasesRepo);
  const lifeRepo = memoryLife();
  const life = lifeService(lifeRepo);
  const ai = opts.ai ?? fakeAi();
  const search = opts.search ?? fakeSearch();
  const parse = parseService(ai, foods, foodsRepo.userExists);
  const gymParse = gymParseService(ai, exercises, exercisesRepo.userExists);
  const briefs = briefsService(ai, foodsRepo.userExists);
  const app = createApp({
    logger: pino({ level: "silent" }),
    pingDb: async () => {
      if (opts.dbUp === false) throw new Error("db down");
    },
    users: usersService(users),
    sync: syncService(sync, {
      meal_log: meals.syncMeal,
      custom_food: foods.syncCustomFood,
      custom_exercise: exercises.syncCustomExercise,
      workout: workouts.syncWorkout,
      routine: routines.syncRoutine,
      activity: activities.syncActivity,
      weight_log: weights.syncWeight,
      water_log: water.syncWater,
      checkin: checkins.syncCheckin,
      phase: phases.syncPhase,
      day_brief: life.syncBrief,
      day_plan: life.syncPlan,
      memory_fact: life.syncFact,
    }),
    changes: changesService(sync.userExists, {
      meal_log: meals.changes,
      workout: workouts.changes,
      routine: routines.changes,
      activity: activities.changes,
      weight_log: weights.changes,
      water_log: water.changes,
      checkin: checkins.changes,
      phase: phases.changes,
      day_brief: life.briefChanges,
      day_plan: life.planChanges,
      memory_fact: life.factChanges,
    }),
    foods,
    foodLookup: foodLookupService(ai, search, foodsRepo.userExists, opts.now),
    meals,
    parse,
    exercises,
    workouts,
    routines,
    gymParse,
    nearby: nearbyService(ai, search, foodsRepo.userExists, opts.now),
    coach: coachService(ai, foodsRepo.userExists),
    briefs,
    menu: menuService(ai, foodsRepo.userExists),
    aiPlan: aiPlanService(ai, foodsRepo.userExists),
    assistant: assistantService({ ai, parse, gymParse, briefs, userExists: foodsRepo.userExists }),
    ai,
    search,
    devRoutes: true,
    rateLimit: opts.rateLimit,
  });
  return {
    app,
    users,
    sync,
    foods: foodsRepo,
    meals: mealsRepo,
    exercises: exercisesRepo,
    workouts: workoutsRepo,
    routines: routinesRepo,
    activities: activitiesRepo,
    weights: weightsRepo,
    water: waterRepo,
    checkins: checkinsRepo,
    phases: phasesRepo,
    life: lifeRepo,
  };
}
