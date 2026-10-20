// LA2/LA3 · Nudges that respect the day (docs/LIFE_PLAN.md "nudges.ts"): blocks, day types, the brief prompt, prep and
// water refills. The P36 rules without blocks or a day type are unchanged (gap.domain.test.ts).
import { describe, expect, it } from "vitest";

import { DEFAULT_NUDGE_SETTINGS, MAX_LIFE_NUDGES_PER_DAY, planLifeNudges, planNudges, type NudgeFacts } from "../../shared/domain/nudges.js";
import { at } from "./fixtures/lifeScenarios.js";

const ON = {
  ...DEFAULT_NUDGE_SETTINGS,
  enabled: true,
  perDay: 6,
  kinds: { morning: true, protein: true, workout: true, slipping: true, streak: true, praise: true },
};
const facts = (over: Partial<NudgeFacts> = {}): NudgeFacts => ({
  minuteOfDay: at(7, 30),
  proteinLeftShare: 1,
  underAtSlipping: true,
  hasRoutine: true,
  workoutToday: false,
  streakCurrent: 5,
  loggedToday: false,
  allGoalsHit: false,
  deliveredToday: 0,
  praiseSentToday: false,
  coverageComplete: true,
  ...over,
});
const today = (f: NudgeFacts) => planNudges(f, ON).filter((n) => n.dayOffset === 0);

describe("nudges respect blocks and day types", () => {
  it("a nudge inside an event moves to the minute before it", () => {
    const n = today(facts({ blocks: [{ from: at(15), to: at(19), kind: "event" }] }));
    expect(n.find((x) => x.kind === "protein")!.minute).toBe(at(14, 59));
    expect(n.find((x) => x.kind === "workout")!.minute).toBe(at(14, 59));
  });

  it("an ordinary work block doesn't move nudges; a busy one does", () => {
    const work = { from: at(9, 30), to: at(18), kind: "work" as const };
    expect(today(facts({ blocks: [work] })).find((x) => x.kind === "protein")!.minute).toBe(at(16));
    expect(today(facts({ blocks: [{ ...work, canMove: false }] })).find((x) => x.kind === "protein")!.minute).toBe(at(9, 29));
  });

  it("away day: only the morning nudge; travel: none", () => {
    expect(today(facts({ dayType: "away" })).map((n) => n.kind)).toEqual(["morning"]);
    expect(today(facts({ dayType: "travel" }))).toEqual([]);
  });

  it("late meeting: nothing once the late work block starts (scenario 2)", () => {
    const n = today(facts({ dayType: "late_work", blocks: [{ from: at(18), to: at(23), kind: "work" }] }));
    expect(n.every((x) => x.minute < at(18))).toBe(true);
    expect(n.map((x) => x.kind)).toEqual(["morning", "protein"]);
  });

  it("sick: care only (the morning check-in)", () => {
    expect(today(facts({ dayType: "sick" })).map((n) => n.kind)).toEqual(["morning"]);
  });

  it("a moved nudge that would land in the past is dropped", () => {
    const n = today(facts({ minuteOfDay: at(15, 30), blocks: [{ from: at(15), to: at(21), kind: "social" }] }));
    expect(n.some((x) => x.kind === "protein" || x.kind === "workout" || x.kind === "slipping")).toBe(false);
  });
});

describe("planLifeNudges", () => {
  const base = {
    now: at(18),
    briefPromptMinute: at(21) as number | null,
    tomorrowBriefed: false,
    todayReminders: [] as Parameters<typeof planLifeNudges>[0]["todayReminders"],
    tomorrowReminders: [] as Parameters<typeof planLifeNudges>[0]["tomorrowReminders"],
    settings: { enabled: true, quietStart: at(22), quietEnd: at(7) },
  };

  it("the evening brief prompt at 21:00, unless tomorrow is briefed, it's off, or it already passed", () => {
    expect(planLifeNudges(base)).toEqual([{ kind: "brief_prompt", dayOffset: 0, minute: at(21), text: "How's tomorrow looking?" }]);
    expect(planLifeNudges({ ...base, tomorrowBriefed: true })).toEqual([]);
    expect(planLifeNudges({ ...base, briefPromptMinute: null })).toEqual([]);
    expect(planLifeNudges({ ...base, now: at(21, 5) })).toEqual([]);
  });

  it("the brief prompt has its own switch; prep and refills follow the nudge switch", () => {
    const prep = { kind: "prep" as const, at: at(21, 30), dayOffset: -1 as const, text: "Pack chana and a 1 L bottle" };
    const off = { ...base, settings: { ...base.settings, enabled: false }, tomorrowReminders: [prep] };
    expect(planLifeNudges(off).map((n) => n.kind)).toEqual(["brief_prompt"]);
    expect(planLifeNudges({ ...base, tomorrowReminders: [prep] }).map((n) => [n.kind, n.minute])).toEqual([
      ["brief_prompt", at(21)],
      ["prep", at(21, 30)],
    ]);
  });

  it("today's prep and refill reminders; quiet hours; at most 3 a day", () => {
    const todayReminders = [
      { kind: "prep" as const, at: at(18, 30), dayOffset: 0 as const, text: "Leaving soon" },
      { kind: "water" as const, at: at(19), dayOffset: 0 as const, text: "Refill", code: "refill" },
      { kind: "water" as const, at: at(20), dayOffset: 0 as const, text: "Top up", code: "top_up" },
      { kind: "prep" as const, at: at(22, 30), dayOffset: 0 as const, text: "Too late" },
    ];
    const tomorrowReminders = [{ kind: "prep" as const, at: at(21, 30), dayOffset: -1 as const, text: "Pack" }];
    const out = planLifeNudges({ ...base, todayReminders, tomorrowReminders });
    expect(out).toHaveLength(MAX_LIFE_NUDGES_PER_DAY);
    expect(out.map((n) => n.kind)).toEqual(["prep", "brief_prompt", "prep"]);
    expect(out.some((n) => n.minute >= at(22))).toBe(false);
  });
});
