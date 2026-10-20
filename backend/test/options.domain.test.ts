// Life plan domain core · access- and budget-aware food (docs/LIFE_PLAN.md "options.ts"): filters, the tight-budget
// cost term, PROTEIN_STAPLES, achievableProteinG and the step-up line. P32 behaviour without the new fields is unchanged.
import { describe, expect, it } from "vitest";

import {
  accessForSource,
  achievableProteinG,
  costScore,
  excluded,
  PROTEIN_STAPLES,
  proteinStepUp,
  rankEatOptions,
  scoreCandidate,
  TIGHT_MAX_INR_PER_SERVING,
  UNKNOWN_COST_SCORE,
  usableStaples,
  type EatCandidate,
  type RankContext,
} from "../../shared/domain/eatOptions.js";
import { EMPTY_STANDING, type Standing } from "../../shared/domain/life.js";
import { EXPO_WED, facts, FLIGHT_THU, HOSTEL, HOSTEL_DAY, OFFICE } from "./fixtures/lifeScenarios.js";

const cand = (over: Partial<EatCandidate> & Pick<EatCandidate, "id" | "name">): EatCandidate => ({
  source: "home",
  macros: { kcal: 400, proteinG: 25, carbsG: 40, fatG: 12 },
  diet: "veg",
  category: null,
  cuisine: null,
  mealTypes: [],
  timesLogged: 0,
  estimate: false,
  ...over,
});

const CTX: RankContext = {
  remaining: { kcal: 700, proteinG: 50, carbsG: 80, fatG: 20 },
  budgetKcal: 2000,
  focus: "protein",
  diet: "veg",
  mealType: "dinner",
  cuisineShare: {},
};

describe("filters before ranking (LA3)", () => {
  const messOnly = cand({ id: "m", name: "Mess thali", access: ["mess"] });
  const anywhere = cand({ id: "a", name: "Dal rice" });
  const kitchen = cand({ id: "k", name: "Home-made paneer bhurji", needsKitchen: true });
  const pricey = cand({ id: "p", name: "Whey shake", costInrPerServing: 60 });

  it("access: drops a candidate the slot can't reach; untagged candidates and unknown access pass", () => {
    expect(excluded(messOnly, { ...CTX, access: "home" })).toBe("access");
    expect(excluded(messOnly, { ...CTX, access: "mess" })).toBeNull();
    expect(excluded(messOnly, { ...CTX, access: "unknown" })).toBeNull();
    expect(excluded(anywhere, { ...CTX, access: "packed" })).toBeNull();
  });

  it("kitchen: drops needsKitchen only when hasKitchen is false", () => {
    expect(excluded(kitchen, { ...CTX, hasKitchen: false })).toBe("kitchen");
    expect(excluded(kitchen, { ...CTX, hasKitchen: null })).toBeNull();
    expect(excluded(kitchen, CTX)).toBeNull();
  });

  it(`tight budget: drops items over ₹${TIGHT_MAX_INR_PER_SERVING}`, () => {
    expect(excluded(pricey, { ...CTX, budget: "tight" })).toBe("cost");
    expect(excluded(pricey, { ...CTX, budget: "careful" })).toBeNull();
    expect(excluded({ ...pricey, costInrPerServing: TIGHT_MAX_INR_PER_SERVING }, { ...CTX, budget: "tight" })).toBeNull();
  });

  it("diet still comes first", () => {
    expect(excluded(cand({ id: "c", name: "Chicken", diet: "non_veg", access: ["home"] }), { ...CTX, access: "mess" })).toBe("diet");
  });
});

describe("tight-budget ranking (LA3)", () => {
  it("cost score is protein per rupee, saturating; unknown price is neutral", () => {
    expect(costScore({ macros: { kcal: 100, proteinG: 15, carbsG: 0, fatG: 0 }, costInrPerServing: 10 })).toBe(1);
    expect(costScore({ macros: { kcal: 100, proteinG: 6, carbsG: 0, fatG: 0 }, costInrPerServing: 8 })).toBeCloseTo(0.5);
    expect(costScore({ macros: { kcal: 100, proteinG: 6, carbsG: 0, fatG: 0 } })).toBe(UNKNOWN_COST_SCORE);
  });

  it("without a tight budget, scores are exactly what P32 gave", () => {
    const c = cand({ id: "x", name: "Rajma chawal", costInrPerServing: 5 });
    const { costInrPerServing: _drop, ...plain } = c;
    expect(scoreCandidate(c, CTX)).toBe(scoreCandidate(plain, CTX));
    expect(scoreCandidate(c, { ...CTX, budget: "comfortable" })).toBe(scoreCandidate(plain, CTX));
  });

  it("with a tight budget, protein per rupee breaks the tie", () => {
    const cheap = cand({ id: "cheap", name: "Soya curry", costInrPerServing: 15 });
    const dear = cand({ id: "dear", name: "Paneer tikka", costInrPerServing: 38 });
    expect(rankEatOptions([dear, cheap], CTX).map((o) => o.id)).toEqual(["dear", "cheap"]); // input order on a tie
    expect(rankEatOptions([dear, cheap], { ...CTX, budget: "tight" }).map((o) => o.id)).toEqual(["cheap", "dear"]);
  });
});

describe("protein staples", () => {
  it("every staple has a price, protein and a slot; ids are unique", () => {
    expect(new Set(PROTEIN_STAPLES.map((s) => s.id)).size).toBe(PROTEIN_STAPLES.length);
    for (const s of PROTEIN_STAPLES) {
      expect(s.costInr).toBeGreaterThan(0);
      expect(s.macros.proteinG).toBeGreaterThan(0);
      expect(s.macros.kcal).toBeGreaterThan(s.macros.proteinG * 4 - 1);
    }
  });

  it("covers the plan's list: eggs, soya, chana, peanuts, curd, sattu, dal, milk, paneer, chicken, whey", () => {
    const names = PROTEIN_STAPLES.map((s) => s.name.toLowerCase()).join(" | ");
    for (const w of ["egg", "soya", "chana", "peanut", "curd", "sattu", "dal", "milk", "paneer", "chicken", "whey"])
      expect(names).toContain(w);
  });

  it("usable staples respect diet, kitchen, fridge, travel and a tight budget", () => {
    const ids = (standing: Standing, diet: "veg" | "non_veg" | "jain", f = HOSTEL_DAY) =>
      usableStaples({ standing, facts: f, staples: PROTEIN_STAPLES, diet }).map((s) => s.id);
    const hostel = ids(HOSTEL, "veg");
    expect(hostel).not.toContain("whey_1");
    expect(hostel).not.toContain("eggs_2");
    expect(hostel).not.toContain("dal_bowl"); // kitchen
    expect(hostel).not.toContain("curd_200"); // fridge
    expect(hostel).toContain("soya_30");
    expect(ids(OFFICE, "non_veg")).toEqual(PROTEIN_STAPLES.map((s) => s.id));
    expect(ids(OFFICE, "jain")).toEqual(PROTEIN_STAPLES.filter((s) => s.diet === "jain").map((s) => s.id));
    const travel = ids(OFFICE, "non_veg", FLIGHT_THU);
    expect(travel.every((id) => PROTEIN_STAPLES.find((s) => s.id === id)!.portable)).toBe(true);
  });
});

describe("achievable protein", () => {
  it("hostel, tight, veg, mess for every meal: about 75 (scenario 3)", () => {
    expect(achievableProteinG({ standing: HOSTEL, facts: HOSTEL_DAY, staples: PROTEIN_STAPLES, diet: "veg" })).toBe(75);
  });

  it("the brief's access wins over the standing meal source; no brief uses the source", () => {
    const home = { ...HOSTEL, mealSource: "home_family" as const };
    expect(achievableProteinG({ standing: home, facts: HOSTEL_DAY, staples: [], diet: "veg" })).toBe(75);
    expect(achievableProteinG({ standing: home, facts: null, staples: [], diet: "veg" })).toBe(85);
    expect(accessForSource("mixed")).toBe("unknown");
    expect(accessForSource(null)).toBe("unknown");
  });

  it("a comfortable home cook reaches well past a usual base; non-veg plates carry more", () => {
    const veg = achievableProteinG({ standing: OFFICE, facts: null, staples: PROTEIN_STAPLES, diet: "veg" });
    const nonVeg = achievableProteinG({ standing: OFFICE, facts: null, staples: PROTEIN_STAPLES, diet: "non_veg" });
    expect(veg).toBe(85 + 24 + 18); // whey + paneer
    expect(nonVeg).toBeGreaterThan(veg);
  });

  it("nothing answered: unknown access, one staple a day", () => {
    expect(achievableProteinG({ standing: EMPTY_STANDING, facts: null, staples: PROTEIN_STAPLES, diet: "veg" })).toBe(75 + 24);
  });

  it("an away day's packed meals count less than home", () => {
    const a = achievableProteinG({ standing: OFFICE, facts: EXPO_WED, staples: [], diet: "veg" });
    expect(a).toBe(20 + 20 + 10 + 30);
  });
});

describe("protein step-up", () => {
  const input = { standing: HOSTEL, facts: HOSTEL_DAY, staples: PROTEIN_STAPLES, diet: "veg" as const };

  it("cheapest protein per rupee that this person can use", () => {
    expect(proteinStepUp({ ...input, gapG: 35 })).toEqual({
      staple: PROTEIN_STAPLES.find((s) => s.id === "soya_30"),
      proteinG: 16,
      costInr: 10,
    });
  });

  it("none without a gap or without a usable staple", () => {
    expect(proteinStepUp({ ...input, gapG: 0 })).toBeNull();
    expect(proteinStepUp({ ...input, gapG: 20, staples: [] })).toBeNull();
  });

  it("a comfortable budget gets the most protein instead", () => {
    const s = proteinStepUp({ standing: OFFICE, facts: facts({}), staples: PROTEIN_STAPLES, diet: "non_veg", gapG: 30 });
    expect(s?.staple.id).toBe("chicken_150");
  });
});
