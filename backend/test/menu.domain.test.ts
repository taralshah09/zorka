// LA7 · Menu scan ranking (docs/LIFE_PLAN.md "Menu scan", scenario 8): menu dishes → candidates → picks, combos, tweaks
// and "go easy on". The AI only reads the menu; every pick and number here comes from code.
import { describe, expect, it } from "vitest";

import { excluded, scoreCandidate } from "../../shared/domain/eatOptions.js";
import {
  MENU_TREAT_KCAL,
  mergeMenuPages,
  menuToCandidates,
  rankMenu,
  type MenuDish,
  type MenuTag,
} from "../../shared/domain/menu.js";

let n = 0;
const dish = (name: string, section: string, tags: MenuTag[], kcal: [number, number], protein: [number, number], o: Partial<MenuDish> = {}): MenuDish => ({
  id: `d${++n}`,
  page: 1,
  name,
  section,
  veg: true,
  tags,
  // Carbs and fat follow the calories (half from carbs, a third from fat), so a light roti isn't read as pure fat.
  est: {
    kcal,
    proteinG: protein,
    carbsG: [Math.round((kcal[0] * 0.5) / 4), Math.round((kcal[1] * 0.5) / 4)],
    fatG: [Math.round((kcal[0] * 0.3) / 9), Math.round((kcal[1] * 0.3) / 9)],
  },
  ...o,
});

/** Scenario 8: a dhaba, 7 pages (merged here into one list), veg profile. */
const DHABA = [
  dish("Paneer Tikka", "Tandoor", ["tandoor", "paneer"], [220, 300], [22, 28], { price: 260 }),
  dish("Paneer Butter Masala", "Main course", ["paneer", "gravy", "creamy"], [420, 520], [16, 22], { price: 280 }),
  dish("Dal Makhani", "Dal", ["dal", "gravy", "creamy"], [380, 460], [12, 16], { price: 220 }),
  dish("Dal Tadka", "Dal", ["dal", "gravy"], [150, 200], [8, 11], { price: 180 }),
  dish("Butter Naan", "Breads", ["bread"], [280, 340], [6, 8], { price: 60 }),
  dish("Tandoori Roti", "Breads", ["bread", "tandoor"], [90, 110], [3, 4], { price: 25 }),
  dish("Jeera Rice", "Rice", ["rice"], [300, 380], [5, 7], { price: 160 }),
  dish("Green Salad", "Salads", ["salad"], [40, 60], [1, 3], { price: 80 }),
  dish("Veg Pakora", "Starters", ["fried"], [350, 450], [6, 9], { price: 150 }),
  dish("Chicken Tikka", "Tandoor", ["tandoor", "chicken"], [250, 320], [30, 38], { veg: false, price: 320 }),
  dish("Gulab Jamun", "Desserts", ["dessert"], [280, 340], [3, 5], { price: 90 }),
  dish("Sweet Lassi", "Drinks", ["drink"], [250, 320], [7, 9], { price: 90 }),
];

const rank = { excluded, scoreCandidate };
const LEFT = { kcal: 650, proteinG: 45, carbsG: 80, fatG: 25 };

describe("menuToCandidates", () => {
  it("ranks on the midpoint and keeps the range; non-veg and unknown dishes carry their diet", () => {
    const [tikka, , , , , , , , , chicken] = menuToCandidates(DHABA);
    expect(tikka).toMatchObject({ source: "menu", macros: { kcal: 260, proteinG: 25 }, range: { kcal: [220, 300], proteinG: [22, 28] }, estimate: true, diet: "veg", price: 260 });
    expect(chicken!.diet).toBe("non_veg");
    expect(menuToCandidates([dish("Mystery", "X", [], [100, 200], [5, 10], { veg: null })])[0]!.diet).toBeNull();
  });

  it("a strong food-database match replaces the AI estimate; a weak one doesn't", () => {
    const match = (score: number) => () => ({ macros: { kcal: 240, proteinG: 26, carbsG: 8, fatG: 12 }, score });
    expect(menuToCandidates(DHABA.slice(0, 1), { match: match(0.9) })[0]).toMatchObject({ matched: true, estimate: false, macros: { kcal: 240 } });
    expect(menuToCandidates(DHABA.slice(0, 1), { match: match(0.6) })[0]).toMatchObject({ matched: false, macros: { kcal: 260 } });
  });

  it("sharing halves every dish; a platter is always shown as half", () => {
    expect(menuToCandidates(DHABA.slice(0, 1), { sharing: true })[0]).toMatchObject({ macros: { kcal: 130 }, range: { kcal: [110, 150] }, price: 130 });
    const platter = dish("Tandoori Platter", "Tandoor", ["tandoor", "chicken", "sharing"], [800, 1000], [70, 90], { veg: false });
    expect(menuToCandidates([platter])[0]!.macros.kcal).toBe(450);
  });

  it("pages merge by dish name; a later page fills a missing price", () => {
    const a = [dish("Paneer Tikka", "Tandoor", [], [1, 2], [1, 2])];
    const b = [dish("paneer  tikka!", "Tandoor", [], [1, 2], [1, 2], { price: 250 }), dish("Dal Tadka", "Dal", [], [1, 2], [1, 2])];
    const merged = mergeMenuPages([a, b]);
    expect(merged.map((d) => d.name)).toEqual(["Paneer Tikka", "Dal Tadka"]);
    expect(merged[0]!.price).toBe(250);
  });
});

describe("rankMenu · scenario 8 (dhaba, veg, 650 kcal and 45 g protein left)", () => {
  const picks = rankMenu({ candidates: menuToCandidates(DHABA), diet: "veg", budget: null, remaining: LEFT, intent: "on_plan", rank });
  const names = (list: { name: string }[]) => list.map((d) => d.name);

  it("picks include paneer tikka; never non-veg, dessert, a fried snack or a side; one per section", () => {
    expect(names(picks.picks)).toContain("Paneer Tikka");
    expect(names(picks.picks)).not.toContain("Chicken Tikka");
    for (const p of picks.picks) expect(p.tags.some((t) => ["bread", "rice", "dessert", "drink"].includes(t))).toBe(false);
    expect(new Set(picks.picks.map((p) => p.section)).size).toBe(picks.picks.length);
    expect(picks.picks.length).toBeLessThanOrEqual(3);
  });

  it("a combo like paneer tikka + 2 tandoori roti + dal fits what's left", () => {
    const combo = picks.combos.find((c) => c.items[0]!.dish.name === "Paneer Tikka")!;
    expect(combo.items.map((i) => [i.dish.name, i.quantity])).toEqual(
      expect.arrayContaining([["Paneer Tikka", 1], ["Tandoori Roti", 2], ["Dal Tadka", 1]]),
    );
    expect(combo.macros.kcal).toBeLessThanOrEqual(650 * 1.1);
    expect(combo.price).toBe(260 + 50 + 180 + (combo.items.some((i) => i.dish.name === "Green Salad") ? 80 : 0));
  });

  it("tweaks: tandoori roti, not butter naan; pick rice or roti", () => {
    const codes = picks.tweaks.map((t) => t.code);
    expect(codes).toContain("swap_bread");
    expect(codes).toContain("pick_rice_or_bread");
  });

  it("go easy on: dal makhani and butter naan, with their ranges", () => {
    expect(names(picks.goEasy)).toEqual(expect.arrayContaining(["Dal Makhani", "Butter Naan"]));
    expect(picks.goEasy.find((d) => d.name === "Butter Naan")!.range.kcal).toEqual([280, 340]);
  });

  it("300 kcal left shows lighter picks than 900 left", () => {
    const at = (kcal: number) => rankMenu({ candidates: menuToCandidates(DHABA), diet: "veg", budget: null, remaining: { ...LEFT, kcal }, intent: "on_plan", rank });
    const heaviest = (p: ReturnType<typeof at>) => Math.max(...p.picks.map((d) => d.macros.kcal));
    expect(heaviest(at(300))).toBeLessThan(heaviest(at(900)));
    for (const d of at(300).picks) expect(d.macros.kcal).toBeLessThanOrEqual(330);
  });

  it("'It's a treat' allows more and reports the allowance for the weekly ledger", () => {
    const treat = rankMenu({ candidates: menuToCandidates(DHABA), diet: "veg", budget: null, remaining: { ...LEFT, kcal: 200 }, intent: "treat", rank });
    expect(treat.treatKcal).toBe(MENU_TREAT_KCAL);
    expect(treat.picks.length).toBeGreaterThan(0);
  });

  it("a veg profile never sees a non-veg pick, even with nothing else on the menu", () => {
    const meat = DHABA.filter((d) => d.veg === false);
    expect(rankMenu({ candidates: menuToCandidates(meat), diet: "veg", budget: null, remaining: LEFT, intent: "on_plan", rank }).picks).toEqual([]);
  });

  it("a tight budget ranks by protein per rupee when prices exist", () => {
    const cheap = dish("Soya Chaap Tikka", "Tandoor A", ["tandoor"], [240, 280], [20, 26], { price: 30 });
    const dear = dish("Malai Paneer Tikka", "Tandoor B", ["tandoor", "paneer"], [240, 280], [20, 26], { price: 38 });
    const order = (budget: "tight" | null) =>
      rankMenu({ candidates: menuToCandidates([dear, cheap]), diet: "veg", budget, remaining: LEFT, intent: "on_plan", rank }).picks.map((d) => d.name);
    expect(order("tight")[0]).toBe("Soya Chaap Tikka");
  });

  it("avoid chips drop matching dishes", () => {
    const p = rankMenu({ candidates: menuToCandidates(DHABA), diet: "veg", budget: null, remaining: LEFT, intent: "on_plan", rank, avoid: ["no paneer"] });
    expect(names(p.picks).some((x) => /paneer/i.test(x))).toBe(false);
  });

  it("fried with a tandoor version on the menu suggests the swap", () => {
    const menu = [
      dish("Chicken Pakora", "Starters", ["fried", "chicken"], [400, 500], [25, 30], { veg: false }),
      dish("Chicken Tikka", "Tandoor", ["tandoor", "chicken"], [250, 320], [30, 38], { veg: false }),
    ];
    const p = rankMenu({ candidates: menuToCandidates(menu), diet: "non_veg", budget: null, remaining: LEFT, intent: "on_plan", rank });
    expect(p.tweaks.find((t) => t.code === "swap_tandoor")?.dishIds).toHaveLength(2);
  });
});
