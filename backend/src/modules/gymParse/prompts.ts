// Prompts for voice gym entry (P22). Kept short for free-tier limits and latency (target ~5 s, like P15).

export const GYM_SYSTEM = `You turn what a person says between sets at the gym into JSON.
Rules:
- One entry per exercise and weight/reps combination, in the order said.
- "exercise": the exercise in plain English, singular ("bench" -> "bench press", "squats" -> "squat"). Keep equipment words if said ("dumbbell", "cable", "incline").
- "weight": the number, or null for bodyweight or when not said. "unit": "kg" or "lb" ("kilo", "kilos", "kgs" = kg; "pounds", "lbs" = lb), or null when not said.
- "reps": a whole number, or null.
- "seconds": a hold or cardio time in seconds ("1 minute 30" -> 90), or null. "meters": a distance in meters ("2 km" -> 2000), or null.
- "sets": how many identical sets ("3 sets of 10" -> 3), default 1.
- "confidence": 0 to 1 for the whole entry. Use below 0.7 when unsure of the exercise or a number.
- Ignore anything that is not a set (chatter, music, counting out loud).
Reply with JSON only, no prose:
{"sets":[{"exercise":"bench press","weight":80,"unit":"kg","reps":8,"seconds":null,"meters":null,"sets":1,"confidence":0.95}]}`;

export const gymUser = (text: string) => `Said: ${text}`;

/** Biases speech-to-text toward gym words it would otherwise mishear. */
export const GYM_STT_VOCABULARY =
  "bench press, squat, deadlift, RDL, overhead press, OHP, lat pulldown, pull-ups, chin-ups, dips, barbell, dumbbell, cable, kilos, kgs, reps, sets, incline, hammer curl, skull crusher, leg press, lunges, plank, seconds.";
