// LA5 · Learned patterns (docs/LIFE_PLAN.md "memory.ts", D78): inferring facts from 3 weeks of seeded logs, merging
// without touching user or dismissed facts, and reading active facts for the planner.
import { describe, expect, it } from "vitest";

import {
  activeFacts,
  AUTO_ACTIVE_CONFIDENCE,
  clockText,
  FACT_KEYS,
  inferFacts,
  mergeFacts,
  noteKey,
  type LoggedDay,
  type MemoryFact,
} from "../../shared/domain/memory.js";
import { addDays, datesBetween } from "../../shared/domain/progress.js";

const TODAY = "2026-10-20"; // Tuesday
const at = (h: number, m = 0) => h * 60 + m;

/** 3 weeks: weekday lunch dal + 3 roti at 13:30 (one Wednesday rajma), gym Mon/Wed/Fri at 7:00, 8 glasses, protein short on weekdays. */
function seeded(): LoggedDay[] {
  return datesBetween(addDays(TODAY, -21), addDays(TODAY, -1)).map((date) => {
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekday = wd >= 1 && wd <= 5;
    const lunch = weekday
      ? date === "2026-10-07"
        ? { slot: "lunch" as const, at: at(13, 15), key: "rajma|rice", text: "rajma rice" }
        : { slot: "lunch" as const, at: at(13, 30), key: "dal|roti", text: "dal + 3 roti" }
      : { slot: "lunch" as const, at: at(14), key: "biryani", text: "biryani" };
    return {
      date,
      meals: [{ slot: "breakfast", at: at(8, 30), key: "poha", text: "poha" }, lunch],
      trainedAt: [1, 3, 5].includes(wd) ? at(7) : null,
      proteinG: weekday ? 80 : 120,
      proteinTargetG: 120,
      glasses: 8,
      coverage: "complete",
    };
  });
}

const stored = (over: Partial<MemoryFact> & Pick<MemoryFact, "key">): MemoryFact => ({
  id: over.key,
  kind: "pattern",
  value: {},
  text: "",
  source: "inferred",
  confidence: 0.5,
  evidence: null,
  status: "suggested",
  validFrom: null,
  validUntil: null,
  ...over,
});

describe("inferFacts (3 weeks of seeded logs)", () => {
  const facts = inferFacts({ days: seeded() }, TODAY);
  const byKey = new Map(facts.map((f) => [f.key, f]));

  it("weekday lunch is usually dal + 3 roti around 1:30pm, with evidence", () => {
    const f = byKey.get(FACT_KEYS.usualMeal("lunch", "weekday"))!;
    expect(f.value).toMatchObject({ text: "dal + 3 roti", at: at(13, 30) });
    expect(f.text).toBe("Lunch on weekdays is usually dal + 3 roti around 1:30pm");
    expect(f.evidence?.count).toBeGreaterThanOrEqual(4);
    expect(f.confidence).toBeGreaterThanOrEqual(AUTO_ACTIVE_CONFIDENCE);
  });

  it("weekend lunch is learned separately (6 weekend days of biryani)", () => {
    expect(byKey.get(FACT_KEYS.usualMeal("lunch", "weekend"))!.value).toMatchObject({ text: "biryani" });
    expect(byKey.get(FACT_KEYS.usualMeal("lunch", "weekend"))!.evidence!.count).toBe(6);
  });

  it("training days Mon/Wed/Fri around 7am; first meal around 8:30am; about 8 glasses", () => {
    expect(byKey.get(FACT_KEYS.trainDays)!.value).toEqual({ days: [1, 3, 5] });
    expect(byKey.get(FACT_KEYS.trainTime)!.value).toEqual({ minute: at(7) });
    expect(byKey.get(FACT_KEYS.wakeTime)!.value).toEqual({ firstMealMinute: at(8, 30) });
    expect(byKey.get(FACT_KEYS.waterTypical)!.value).toEqual({ glasses: 8 });
  });

  it("protein often ends about 40 g short", () => {
    expect(byKey.get(FACT_KEYS.proteinShortfall)!.value).toEqual({ typicalShortG: 40 });
  });

  it("nothing from fewer than 4 days, and unknown-coverage days never count as short", () => {
    const few = seeded().slice(-3);
    expect(inferFacts({ days: few }, TODAY)).toEqual([]);
    const unknown = seeded().map((d) => ({ ...d, coverage: "unknown" as const }));
    expect(inferFacts({ days: unknown }, TODAY).some((f) => f.key === FACT_KEYS.proteinShortfall)).toBe(false);
  });

  it("ignores today and anything older than 28 days", () => {
    const old = seeded().map((d) => ({ ...d, date: addDays(d.date, -40) }));
    expect(inferFacts({ days: old }, TODAY)).toEqual([]);
  });
});

describe("mergeFacts", () => {
  const inferred = inferFacts({ days: seeded() }, TODAY);
  const lunch = FACT_KEYS.usualMeal("lunch", "weekday");

  it("new strong facts go active straight away; weaker ones are suggested", () => {
    const changes = mergeFacts([], inferred);
    expect(changes.every((c) => c.type === "insert")).toBe(true);
    const lunchFact = changes.find((c) => c.type === "insert" && c.fact.key === lunch);
    expect(lunchFact?.type === "insert" && lunchFact.fact.status).toBe("active");
  });

  it("a dismissed fact never comes back, and a user's own fact is never overwritten", () => {
    const changes = mergeFacts(
      [stored({ key: lunch, status: "dismissed" }), stored({ key: FACT_KEYS.trainDays, source: "user", status: "active", value: { days: [2, 4] } })],
      inferred,
    );
    expect(changes.some((c) => (c.type === "insert" ? c.fact.key : c.id) === lunch)).toBe(false);
    expect(changes.some((c) => (c.type === "insert" ? c.fact.key : c.id) === FACT_KEYS.trainDays)).toBe(false);
  });

  it("an inferred fact updates in place and may become active; an unchanged one is left alone", () => {
    const f = inferred.find((x) => x.key === lunch)!;
    const changes = mergeFacts([stored({ key: lunch, value: { old: true } })], [f]);
    expect(changes).toEqual([{ type: "update", id: lunch, patch: expect.objectContaining({ value: f.value, status: "active" }) }]);
    const same = stored({ key: lunch, value: f.value, confidence: f.confidence, status: "active" });
    expect(mergeFacts([same], [f])).toEqual([]);
  });
});

describe("activeFacts", () => {
  it("reads active facts only, and event facts only inside their dates", () => {
    const facts: MemoryFact[] = [
      stored({ key: FACT_KEYS.trainDays, status: "active", value: { days: [1, 3, 9] }, text: "Mon, Wed" }),
      stored({ key: FACT_KEYS.trainTime, status: "suggested", value: { minute: 420 } }),
      stored({ key: noteKey("In Pune 22–24 Oct"), kind: "event", source: "chat", status: "active", text: "In Pune 22–24 Oct", validFrom: "2026-10-22", validUntil: "2026-10-24" }),
    ];
    const a = activeFacts(facts, TODAY);
    expect(a.trainDays).toEqual([1, 3]);
    expect(a.trainMinute).toBeNull();
    expect(a.texts).toEqual(["Mon, Wed"]);
    expect(activeFacts(facts, "2026-10-23").texts).toContain("In Pune 22–24 Oct");
  });

  it("note keys are stable slugs; clock text is short", () => {
    expect(noteKey("I'm vegetarian on Tuesdays!")).toBe("note:i-m-vegetarian-on-tuesdays");
    expect(clockText(at(13, 30))).toBe("1:30pm");
    expect(clockText(at(7))).toBe("7am");
    expect(clockText(0)).toBe("12am");
  });
});
