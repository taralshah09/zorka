// Prompts for the meal parser (P15, P17). Kept short: every token counts against free-tier limits
// and latency (target: under ~5 s from input to confirm sheet).

const UNITS = "piece, katori, bowl, plate, half plate, full plate, glass, cup, tbsp, tsp, slice, g, ml, serving";

const COMMON = `Foods are mostly Indian home food, plus Indo-Chinese, Italian and continental dishes eaten in India.
Rules:
- One item per distinct food or drink. Use the dish name people in India say ("roti", "rajma", "chaas", "paneer bhurji"). Never split a dish into ingredients.
- "quantity": a number, or null when no amount is given or it is vague ("some", "a bit", "little").
- "unit": one of: ${UNITS}; or null when none is given. "2 roti" → quantity 2, unit "piece".
- "confidence": 0 to 1, how sure you are of BOTH the food and the amount. Use below 0.7 for vague foods ("salad", "sabzi", "snacks"), unclear words or dishes you don't recognise.
- Ignore anything that is not food or drink.`;

export const TEXT_SYSTEM = `You turn a person's description of a meal into JSON.
${COMMON}
Reply with JSON only, no prose:
{"items":[{"name":"roti","quantity":2,"unit":"piece","confidence":0.95}]}`;

export const PHOTO_SYSTEM = `You identify the foods and drinks in a photo of a meal and return JSON.
${COMMON}
- Estimate the portion you can see. Set "portionUncertain": true when the size can't be judged from the photo (for example a restaurant dish where half plate vs full plate matters).
- If there is no food in the photo, return {"items":[]}.
Reply with JSON only, no prose:
{"items":[{"name":"veg hakka noodles","quantity":1,"unit":"plate","confidence":0.8,"portionUncertain":true}]}`;

export const textUser = (text: string) => `Meal: ${text}`;
export const PHOTO_USER = "What food and drink is in this photo?";

/** Biases speech-to-text toward food words it would otherwise mishear. */
export const STT_VOCABULARY =
  "roti, phulka, paratha, katori, dal, rajma, chole, chaas, lassi, paneer bhurji, poha, upma, idli, dosa, sambar, sabzi, raita, dahi, ghee, chai, khichdi, thepla, bhindi, aloo gobi, biryani, hakka noodles, manchurian, momos.";
