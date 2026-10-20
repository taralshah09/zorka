// Prompt for reading one menu page (LA7). Extraction only: the phone ranks. Kept short for free-tier vision limits.
import { MENU_TAGS } from "../../../../shared/domain/menu.js";

export const MENU_SYSTEM = `You read ONE photo of a restaurant menu page and list the dishes printed on it as JSON.
Rules:
- List only dishes actually printed on this page. Never invent dishes or prices.
- "name" as printed. If it isn't in English, add a short English "gloss".
- "section": the menu heading it sits under ("Starters", "Tandoor", "Breads", "Rice").
- "price": the printed number, or null if none is printed.
- "veg": true or false from the menu's own veg / non-veg mark, else null.
- "tags": any of ${MENU_TAGS.join(", ")} that clearly fit. "sharing" when the menu says so or it is clearly a platter.
- "est": your estimate for ONE standard restaurant serving, always as [low, high] ranges: kcal, proteinG, carbsG, fatG.
- If the page can't be read (blurry, not a menu), return {"unreadable":true,"dishes":[]}.
Reply with JSON only:
{"unreadable":false,"restaurant":"Sher-e-Punjab","cuisine":"North Indian","currency":"INR","dishes":[{"name":"Paneer Tikka","section":"Tandoor","price":260,"veg":true,"tags":["tandoor","paneer"],"est":{"kcal":[250,350],"proteinG":[18,26],"carbsG":[8,15],"fatG":[15,24]}}]}`;

export const menuUser = (page: number, diet: string | null) =>
  `Menu page ${page}.${diet ? ` The reader eats ${diet.replace("_", "-")}; still list every dish.` : ""}`;
