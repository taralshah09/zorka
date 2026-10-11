// P19 · Curated exercise list (D38). FitNotes-style categories and set types, written for Kimbo (names
// and aliases are Kimbo's own, not copied from FitNotes' data).
//
// SOURCE: "kimbo-curated-v1". Every exercise links to its MuscleWiki page (how to do it, muscles worked).
// The slugs were checked against MuscleWiki's public sitemap (https://musclewiki.com/sitemap.xml) on
// 2026-10-11; all 111 resolved. If MuscleWiki renames a page, fix the slug here and re-run the seed.
//
// Row format (one exercise per line):
//   [slug, name, aliases, category, type, musclewikiSlug]
//   type: weight_reps · reps (bodyweight, no added weight) · time (holds) · distance_time (cardio machines)
//   Pull-ups, chin-ups and dips are weight_reps so added weight can be logged; 0 kg = bodyweight.
// Aliases are what people say at the gym ("bench", "ohp", "rdl"); the voice parser (P22) matches on them.

import type { ExerciseCategory, ExerciseType } from "../../../shared/domain/gym.js";

export type ExerciseRow = [
  slug: string,
  name: string,
  aliases: string[],
  category: ExerciseCategory,
  type: ExerciseType,
  musclewikiSlug: string,
];

export const EXERCISE_SOURCE = "kimbo-curated-v1";

export const EXERCISES: ExerciseRow[] = [
  // ── Chest ─────────────────────────────────────────────────────────────────────────────────────
  ["barbell-bench-press", "Barbell Bench Press", ["bench", "bench press", "flat bench", "flat bench press"], "chest", "weight_reps", "barbell-bench-press"],
  ["incline-barbell-bench-press", "Incline Barbell Bench Press", ["incline bench", "incline bench press", "incline press"], "chest", "weight_reps", "barbell-incline-bench-press"],
  ["decline-barbell-bench-press", "Decline Barbell Bench Press", ["decline bench", "decline press"], "chest", "weight_reps", "barbell-decline-bench-press"],
  ["dumbbell-bench-press", "Dumbbell Bench Press", ["db bench", "dumbbell press", "flat dumbbell press"], "chest", "weight_reps", "dumbbell-bench-press"],
  ["incline-dumbbell-bench-press", "Incline Dumbbell Bench Press", ["incline db press", "incline dumbbell press"], "chest", "weight_reps", "dumbbell-incline-bench-press"],
  ["decline-dumbbell-bench-press", "Decline Dumbbell Bench Press", ["decline dumbbell press"], "chest", "weight_reps", "dumbbell-decline-bench-press"],
  ["smith-machine-bench-press", "Smith Machine Bench Press", ["smith bench"], "chest", "weight_reps", "smith-machine-bench-press"],
  ["machine-chest-press", "Machine Chest Press", ["chest press", "chest press machine"], "chest", "weight_reps", "machine-chest-press"],
  ["dumbbell-fly", "Dumbbell Fly", ["chest fly", "flyes", "dumbbell flyes", "db fly"], "chest", "weight_reps", "dumbbell-chest-fly"],
  ["incline-dumbbell-fly", "Incline Dumbbell Fly", ["incline fly", "incline flyes"], "chest", "weight_reps", "dumbbell-incline-chest-flys"],
  ["cable-crossover", "Cable Crossover", ["cable fly", "cable flyes", "crossover", "cable pec fly"], "chest", "weight_reps", "cable-pec-fly"],
  ["pec-deck", "Pec Deck Fly", ["pec deck", "butterfly", "machine fly"], "chest", "weight_reps", "machine-pec-fly"],
  ["push-up", "Push-Up", ["push ups", "pushups", "push up"], "chest", "reps", "push-up"],
  ["chest-dip", "Chest Dip", ["dips", "parallel bar dips"], "chest", "weight_reps", "parralel-bar-dips"],
  ["dumbbell-pullover", "Dumbbell Pullover", ["pullover"], "chest", "weight_reps", "dumbbell-pullover"],

  // ── Back ──────────────────────────────────────────────────────────────────────────────────────
  ["barbell-deadlift", "Barbell Deadlift", ["deadlift", "deadlifts", "conventional deadlift", "dl"], "back", "weight_reps", "barbell-deadlift"],
  ["barbell-row", "Barbell Bent-Over Row", ["barbell row", "bent over row", "bb row"], "back", "weight_reps", "barbell-bent-over-row"],
  ["pendlay-row", "Pendlay Row", ["pendlay"], "back", "weight_reps", "barbell-pronated-pendlay-row"],
  ["dumbbell-row", "One-Arm Dumbbell Row", ["dumbbell row", "db row", "single arm row", "one arm row"], "back", "weight_reps", "dumbbell-row-unilateral"],
  ["pull-up", "Pull-Up", ["pull ups", "pullups", "pull up"], "back", "weight_reps", "pull-ups"],
  ["chin-up", "Chin-Up", ["chin ups", "chinups", "chin up"], "back", "weight_reps", "chin-ups"],
  ["lat-pulldown", "Lat Pulldown", ["pulldown", "lat pull down", "lat pulldowns", "lats"], "back", "weight_reps", "machine-pulldown"],
  ["close-grip-pulldown", "Close-Grip Pulldown", ["close grip pulldown", "v bar pulldown", "narrow pulldown"], "back", "weight_reps", "narrow-pulldown"],
  ["seated-cable-row", "Seated Cable Row", ["cable row", "seated row", "low row"], "back", "weight_reps", "machine-seated-cable-row"],
  ["t-bar-row", "T-Bar Row", ["t bar row", "landmine row"], "back", "weight_reps", "landmine-t-bar-rows"],
  ["chest-supported-row", "Chest-Supported Machine Row", ["machine row", "chest supported row"], "back", "weight_reps", "machine-chest-supported-t-bar-row"],
  ["straight-arm-pulldown", "Straight-Arm Pulldown", ["straight arm pulldown", "lat pushdown"], "back", "weight_reps", "cable-straight-arm-pull-in"],
  ["rack-pull", "Rack Pull", ["rack pulls"], "back", "weight_reps", "barbell-rack-pull"],
  ["back-extension", "Back Extension", ["hyperextension", "hyperextensions", "back extensions"], "back", "weight_reps", "machine-45-degree-back-extension"],
  ["good-morning", "Good Morning", ["good mornings"], "back", "weight_reps", "barbell-high-bar-good-morning"],
  ["inverted-row", "Inverted Row", ["bodyweight row", "australian pull up"], "back", "reps", "inverted-row"],
  ["barbell-shrug", "Barbell Shrug", ["shrugs", "shrug"], "back", "weight_reps", "barbell-shrug"],
  ["dumbbell-shrug", "Dumbbell Shrug", ["db shrug", "dumbbell shrugs"], "back", "weight_reps", "dumbbell-shrug"],

  // ── Shoulders ─────────────────────────────────────────────────────────────────────────────────
  ["overhead-press", "Barbell Overhead Press", ["ohp", "overhead press", "military press", "shoulder press"], "shoulders", "weight_reps", "barbell-overhead-press"],
  ["seated-dumbbell-shoulder-press", "Seated Dumbbell Shoulder Press", ["dumbbell shoulder press", "db shoulder press", "seated shoulder press"], "shoulders", "weight_reps", "dumbbell-seated-overhead-press"],
  ["standing-dumbbell-press", "Standing Dumbbell Overhead Press", ["dumbbell overhead press", "standing dumbbell press"], "shoulders", "weight_reps", "dumbbell-overhead-press"],
  ["arnold-press", "Arnold Press", ["arnold"], "shoulders", "weight_reps", "arnold-press"],
  ["machine-shoulder-press", "Machine Shoulder Press", ["shoulder press machine"], "shoulders", "weight_reps", "machine-overhand-overhead-press"],
  ["dumbbell-lateral-raise", "Dumbbell Lateral Raise", ["lateral raise", "lateral raises", "side raise", "side raises", "laterals"], "shoulders", "weight_reps", "dumbbell-lateral-raise"],
  ["cable-lateral-raise", "Cable Lateral Raise", ["cable lateral", "cable side raise"], "shoulders", "weight_reps", "cable-low-single-arm-lateral-raise"],
  ["dumbbell-front-raise", "Dumbbell Front Raise", ["front raise", "front raises"], "shoulders", "weight_reps", "dumbbell-front-raise"],
  ["rear-delt-fly", "Dumbbell Rear Delt Fly", ["rear delt fly", "reverse fly", "rear delts"], "shoulders", "weight_reps", "dumbbell-rear-delt-fly"],
  ["reverse-pec-deck", "Reverse Pec Deck", ["reverse pec deck", "machine reverse fly"], "shoulders", "weight_reps", "machine-reverse-fly"],
  ["face-pull", "Cable Face Pull", ["face pull", "face pulls"], "shoulders", "weight_reps", "cable-seated-rope-face-pull"],
  ["upright-row", "Barbell Upright Row", ["upright row", "upright rows"], "shoulders", "weight_reps", "barbell-upright-row"],

  // ── Biceps ────────────────────────────────────────────────────────────────────────────────────
  ["barbell-curl", "Barbell Curl", ["bb curl", "bicep curl", "biceps curl", "straight bar curl"], "biceps", "weight_reps", "barbell-curl"],
  ["ez-bar-curl", "EZ-Bar Curl", ["ez curl", "ez bar curl"], "biceps", "weight_reps", "ez-bar-curl"],
  ["dumbbell-curl", "Dumbbell Curl", ["db curl", "dumbbell curls", "alternating curl"], "biceps", "weight_reps", "dumbbell-curl"],
  ["hammer-curl", "Hammer Curl", ["hammer curls", "hammers"], "biceps", "weight_reps", "dumbbell-hammer-curl"],
  ["incline-dumbbell-curl", "Incline Dumbbell Curl", ["incline curl", "incline curls"], "biceps", "weight_reps", "dumbbell-incline-curl"],
  ["preacher-curl", "EZ-Bar Preacher Curl", ["preacher curl", "preacher curls", "scott curl"], "biceps", "weight_reps", "ez-bar-preacher-curl"],
  ["concentration-curl", "Concentration Curl", ["concentration curls"], "biceps", "weight_reps", "dumbbell-concentration-curl"],
  ["cable-curl", "Cable Curl", ["cable curls", "cable bicep curl"], "biceps", "weight_reps", "cable-bar-curl"],
  ["reverse-curl", "Barbell Reverse Curl", ["reverse curl", "reverse curls"], "biceps", "weight_reps", "barbell-reverse-curl"],

  // ── Triceps ───────────────────────────────────────────────────────────────────────────────────
  ["tricep-pushdown", "Cable Tricep Pushdown", ["tricep pushdown", "pushdown", "pushdowns", "triceps pushdown"], "triceps", "weight_reps", "cable-bar-pushdown"],
  ["rope-pushdown", "Rope Pushdown", ["rope pushdown", "rope pushdowns", "rope extension"], "triceps", "weight_reps", "cable-rope-pushdown"],
  ["cable-overhead-tricep-extension", "Cable Overhead Tricep Extension", ["overhead cable extension", "overhead rope extension"], "triceps", "weight_reps", "cable-rope-overhead-tricep-extension"],
  ["dumbbell-overhead-tricep-extension", "Dumbbell Overhead Tricep Extension", ["overhead extension", "tricep extension", "french press"], "triceps", "weight_reps", "dumbbell-overhead-tricep-extension"],
  ["skull-crusher", "Skull Crusher", ["skull crushers", "skullcrusher", "lying tricep extension"], "triceps", "weight_reps", "barbell-skullcrusher"],
  ["close-grip-bench-press", "Close-Grip Bench Press", ["close grip bench", "cgbp"], "triceps", "weight_reps", "barbell-close-grip-bench-press"],
  ["tricep-dip", "Tricep Dip (machine)", ["dip machine", "machine dips", "tricep dips"], "triceps", "weight_reps", "machine-dips"],
  ["bench-dip", "Bench Dip", ["bench dips"], "triceps", "reps", "bench-dips"],
  ["dumbbell-kickback", "Dumbbell Tricep Kickback", ["kickback", "kickbacks", "tricep kickback"], "triceps", "weight_reps", "dumbbell-tricep-kickback"],

  // ── Legs ──────────────────────────────────────────────────────────────────────────────────────
  ["barbell-squat", "Barbell Back Squat", ["squat", "squats", "back squat", "bb squat"], "legs", "weight_reps", "barbell-squat"],
  ["front-squat", "Barbell Front Squat", ["front squat", "front squats"], "legs", "weight_reps", "barbell-front-squat-bodybuilding"],
  ["smith-machine-squat", "Smith Machine Squat", ["smith squat"], "legs", "weight_reps", "smith-machine-squat"],
  ["goblet-squat", "Goblet Squat", ["goblet squats"], "legs", "weight_reps", "dumbbell-goblet-squat"],
  ["bodyweight-squat", "Bodyweight Squat", ["air squat", "air squats", "free squat"], "legs", "reps", "bodyweight-squat"],
  ["leg-press", "Leg Press", ["leg press machine", "45 degree leg press"], "legs", "weight_reps", "machine-leg-press"],
  ["hack-squat", "Hack Squat", ["hack squats", "hack squat machine"], "legs", "weight_reps", "machine-hack-squat"],
  ["bulgarian-split-squat", "Bulgarian Split Squat", ["bulgarian", "split squat", "bss"], "legs", "weight_reps", "dumbbell-bulgarian-split-squat"],
  ["dumbbell-lunge", "Dumbbell Lunge", ["lunges", "lunge", "walking lunges"], "legs", "weight_reps", "dumbbell-forward-lunge"],
  ["barbell-lunge", "Barbell Lunge", ["barbell lunges"], "legs", "weight_reps", "barbell-forward-lunge"],
  ["reverse-lunge", "Bodyweight Reverse Lunge", ["reverse lunge", "reverse lunges"], "legs", "reps", "bodyweight-reverse-lunge"],
  ["step-up", "Dumbbell Step-Up", ["step up", "step ups"], "legs", "weight_reps", "dumbbell-step-up"],
  ["romanian-deadlift", "Romanian Deadlift", ["rdl", "rdls", "romanian deadlifts"], "legs", "weight_reps", "barbell-romanian-deadlift"],
  ["dumbbell-romanian-deadlift", "Dumbbell Romanian Deadlift", ["db rdl", "dumbbell rdl"], "legs", "weight_reps", "dumbbell-romanian-deadlift"],
  ["stiff-leg-deadlift", "Stiff-Leg Deadlift", ["stiff leg deadlift", "sldl"], "legs", "weight_reps", "barbell-stiff-leg-deadlifts"],
  ["sumo-deadlift", "Sumo Deadlift", ["sumo", "sumo deadlifts"], "legs", "weight_reps", "barbell-sumo-deadlift"],
  ["leg-extension", "Leg Extension", ["leg extensions", "quad extension"], "legs", "weight_reps", "machine-leg-extension"],
  ["lying-leg-curl", "Lying Leg Curl", ["leg curl", "leg curls", "hamstring curl"], "legs", "weight_reps", "machine-hamstring-curl"],
  ["seated-leg-curl", "Seated Leg Curl", ["seated hamstring curl"], "legs", "weight_reps", "machine-seated-leg-curl"],
  ["hip-thrust", "Barbell Hip Thrust", ["hip thrust", "hip thrusts"], "legs", "weight_reps", "barbell-hip-thrust"],
  ["glute-bridge", "Barbell Glute Bridge", ["glute bridge", "glute bridges", "bridge"], "legs", "weight_reps", "barbell-glute-bridge"],
  ["hip-abduction", "Hip Abduction Machine", ["abduction", "hip abductor", "outer thigh"], "legs", "weight_reps", "machine-hip-abduction"],
  ["hip-adduction", "Hip Adduction Machine", ["adduction", "hip adductor", "inner thigh"], "legs", "weight_reps", "machine-hip-adduction"],
  ["standing-calf-raise", "Standing Calf Raise", ["calf raise", "calf raises", "calves"], "legs", "weight_reps", "machine-standing-calf-raises"],
  ["seated-calf-raise", "Seated Calf Raise", ["seated calves"], "legs", "weight_reps", "machine-seated-calf-raises"],
  ["kettlebell-swing", "Kettlebell Swing", ["kb swing", "swings", "kettlebell swings"], "legs", "weight_reps", "kettlebell-swing"],

  // ── Abs ───────────────────────────────────────────────────────────────────────────────────────
  ["plank", "Plank", ["forearm plank", "elbow plank", "planks"], "abs", "time", "forearm-plank"],
  ["side-plank", "Side Plank", ["side planks"], "abs", "time", "elbow-side-plank"],
  ["crunch", "Crunch", ["crunches", "ab crunch"], "abs", "reps", "crunches"],
  ["bicycle-crunch", "Bicycle Crunch", ["bicycle crunches", "bicycles"], "abs", "reps", "bicycle-crunch"],
  ["reverse-crunch", "Reverse Crunch", ["reverse crunches"], "abs", "reps", "reverse-crunch"],
  ["sit-up", "Sit-Up", ["sit ups", "situps", "sit up"], "abs", "reps", "bodyweight-situp"],
  ["cable-crunch", "Cable Crunch", ["kneeling cable crunch", "rope crunch"], "abs", "weight_reps", "cable-rope-kneeling-crunch"],
  ["hanging-knee-raise", "Hanging Knee Raise", ["hanging leg raise", "knee raises", "hanging raises"], "abs", "reps", "hanging-knee-raises"],
  ["lying-leg-raise", "Lying Leg Raise", ["leg raise", "leg raises"], "abs", "reps", "laying-leg-raises"],
  ["russian-twist", "Russian Twist", ["russian twists"], "abs", "reps", "russian-twist"],
  ["ab-rollout", "Ab Wheel Rollout", ["ab wheel", "rollout", "rollouts", "ab roller"], "abs", "reps", "barbell-roll-outs"],
  ["mountain-climber", "Mountain Climber", ["mountain climbers"], "abs", "reps", "mountain-climber"],
  ["dead-bug", "Dead Bug", ["dead bugs"], "abs", "reps", "dead-bug"],

  // ── Cardio ────────────────────────────────────────────────────────────────────────────────────
  ["treadmill-run", "Treadmill Run", ["treadmill", "treadmill running", "treadmill jog"], "cardio", "distance_time", "treadmill-jog"],
  ["treadmill-walk", "Treadmill Walk", ["incline walk", "treadmill walking"], "cardio", "distance_time", "treadmill-walk"],
  ["stationary-bike", "Stationary Bike", ["cycling", "exercise bike", "spin bike", "cycle"], "cardio", "distance_time", "stationary-bike"],
  ["rowing-machine", "Rowing Machine", ["rower", "rowing", "erg"], "cardio", "distance_time", "cardio-row-erg-rower"],
  ["elliptical", "Elliptical Trainer", ["elliptical", "cross trainer"], "cardio", "distance_time", "elliptical"],
  ["stair-climber", "Stair Climber", ["stairmaster", "stair master", "stairs"], "cardio", "time", "stair-climber"],
  ["jump-rope", "Jump Rope", ["skipping", "skipping rope", "rope skipping"], "cardio", "time", "jump-rope"],
  ["jumping-jacks", "Jumping Jacks", ["jumping jack", "star jumps"], "cardio", "reps", "cardio-jumping-jacks"],
  ["burpee", "Burpee", ["burpees"], "cardio", "reps", "burpee"],
];
