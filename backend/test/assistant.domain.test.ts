// AB1 · Assistant Bar actions and act policy (docs/ASSISTANT_BAR_PLAN.md "Action catalogue", "Tier rules",
// "Guardrails"). The adversarial cases are what a jailbroken router could send: they must never reach the phone as Do.
import { describe, expect, it } from "vitest";

import {
  applyAliases,
  checkAction,
  deviatesFromUsual,
  factsForDayType,
  localAskTopic,
  lowerConfidence,
  matchConfidence,
  MAX_ACTIONS_PER_TURN,
  numbersGrounded,
  planTurn,
  quantityUnusual,
  spanInTranscript,
  stricterTier,
  sttConfidence,
  tierFor,
  type AssistantAction,
  type TurnContext,
} from "../../shared/domain/assistant.js";
import { classifyDay, DAY_TYPES } from "../../shared/domain/dayType.js";
import { EMPTY_STANDING, validateDayFacts } from "../../shared/domain/life.js";

const CTX: TurnContext = { today: "2026-10-20", lastWeightKg: 72, activityRunning: false, previousActions: 2 };

const ok = (raw: unknown, ctx = CTX) => {
  const r = checkAction(raw, ctx);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.action;
};
const reason = (raw: unknown, ctx = CTX) => {
  const r = checkAction(raw, ctx);
  return r.ok ? null : r.reason;
};

describe("checkAction", () => {
  it("cleans a meal log and keeps only known fields", () => {
    expect(ok({ kind: "log_meal", span: "  two rotis   and dal ", mealType: "lunch", confidence: "high", kcal: 50 })).toEqual({
      kind: "log_meal",
      span: "two rotis and dal",
      mealType: "lunch",
      date: undefined,
      confidence: "high",
    });
  });

  it("treats a missing or made-up confidence as low", () => {
    expect(ok({ kind: "log_meal", span: "poha" })).toMatchObject({ confidence: "low" });
    expect(ok({ kind: "log_meal", span: "poha", confidence: "certain" })).toMatchObject({ confidence: "low" });
  });

  it("rejects kinds outside the catalogue", () => {
    expect(reason({ kind: "set_target", kcal: 600 })).toBe("unknown_kind");
    expect(reason({ kind: "delete_all" })).toBe("unknown_kind");
    expect(reason({ kind: "run_sql", sql: "drop table meals" })).toBe("unknown_kind");
    expect(reason(null)).toBe("unknown_kind");
    expect(reason("log_meal")).toBe("unknown_kind");
  });

  it("rejects empty and over-long text", () => {
    expect(reason({ kind: "log_meal", span: "   ", confidence: "high" })).toBe("empty");
    expect(reason({ kind: "log_meal", span: "x".repeat(301), confidence: "high" })).toBe("too_long");
    expect(reason({ kind: "log_meal", span: 42 })).toBe("bad_value");
  });

  it("keeps dates inside yesterday … a week ahead", () => {
    expect(ok({ kind: "log_meal", span: "poha", date: "2026-10-19", confidence: "high" })).toMatchObject({ date: "2026-10-19" });
    expect(reason({ kind: "log_meal", span: "poha", date: "2026-10-18", confidence: "high" })).toBe("date_out_of_range");
    expect(reason({ kind: "log_meal", span: "poha", date: "2026-02-30", confidence: "high" })).toBe("bad_date");
    expect(ok({ kind: "set_day", dayType: "sick", date: "2026-10-27" })).toMatchObject({ dayType: "sick" });
    expect(reason({ kind: "set_day", dayType: "sick", date: "2026-10-28" })).toBe("date_out_of_range");
  });

  it("never lets plans, reminders or day changes go into the past", () => {
    expect(reason({ kind: "set_day", dayType: "sick", date: "2026-10-19" })).toBe("date_out_of_range");
    expect(reason({ kind: "plan_meal", span: "paneer", mealType: "dinner", date: "2026-10-19" })).toBe("date_out_of_range");
    expect(reason({ kind: "remind_me", what: "drink water", minute: 600, date: "2026-10-19" })).toBe("date_out_of_range");
  });

  it("needs a date and a known day type for set_day", () => {
    expect(reason({ kind: "set_day", dayType: "sick" })).toBe("bad_date");
    expect(reason({ kind: "set_day", dayType: "starve", date: "2026-10-20" })).toBe("bad_value");
  });

  it("bounds water", () => {
    expect(ok({ kind: "log_water", glasses: 2.4 })).toEqual({ kind: "log_water", glasses: 2 });
    expect(reason({ kind: "log_water", glasses: 0 })).toBe("bad_value");
    expect(reason({ kind: "log_water", glasses: -3 })).toBe("bad_value");
    expect(reason({ kind: "log_water", glasses: 50 })).toBe("bad_value");
    expect(reason({ kind: "log_water", glasses: "3" })).toBe("bad_value");
  });

  it("bounds weight and rounds to 0.1 kg", () => {
    expect(ok({ kind: "log_weight", kg: 71.86, confidence: "high" })).toMatchObject({ kg: 71.9 });
    expect(reason({ kind: "log_weight", kg: 7 })).toBe("bad_value");
    expect(reason({ kind: "log_weight", kg: 720 })).toBe("bad_value");
    expect(reason({ kind: "log_weight", kg: Number.NaN })).toBe("bad_value");
  });

  it("starts an activity only when none is running, and stops only a running one", () => {
    expect(ok({ kind: "start_activity", activity: "walk" })).toEqual({ kind: "start_activity", activity: "walk" });
    expect(reason({ kind: "start_activity", activity: "swim" })).toBe("bad_value");
    expect(reason({ kind: "start_activity", activity: "run" }, { ...CTX, activityRunning: true })).toBe("already_running");
    expect(reason({ kind: "stop_activity" })).toBe("nothing_running");
    expect(ok({ kind: "stop_activity" }, { ...CTX, activityRunning: true })).toEqual({ kind: "stop_activity" });
  });

  it("corrects and undoes only what the previous turn did", () => {
    expect(ok({ kind: "correct", index: 1, span: "dal tadka" })).toEqual({ kind: "correct", index: 1, span: "dal tadka" });
    expect(reason({ kind: "correct", index: 2, span: "dal" })).toBe("nothing_to_edit");
    expect(reason({ kind: "correct", index: -1, span: "dal" })).toBe("bad_value");
    expect(reason({ kind: "undo" }, { ...CTX, previousActions: 0 })).toBe("nothing_to_edit");
  });

  it("opens only known screens", () => {
    expect(ok({ kind: "open", screen: "progress" })).toEqual({ kind: "open", screen: "progress" });
    expect(reason({ kind: "open", screen: "https://evil.example" })).toBe("bad_value");
    expect(reason({ kind: "open", screen: "/settings/delete-account" })).toBe("bad_value");
  });

  it("caps clarify options", () => {
    const a = ok({ kind: "clarify", question: "Which meal?", options: ["Breakfast", "Lunch", "Snack", "Dinner", "Brunch"] });
    expect(a).toMatchObject({ options: ["Breakfast", "Lunch", "Snack", "Dinner"] });
  });

  it("checks reminder minutes", () => {
    expect(reason({ kind: "remind_me", what: "walk", minute: 1440 })).toBe("bad_value");
    expect(reason({ kind: "remind_me", what: "walk", minute: 90.5 })).toBe("bad_value");
  });
});

describe("delete_entry and edit_meal", () => {
  it("deletes one record of today or yesterday, never the future", () => {
    expect(ok({ kind: "delete_entry", target: "meal", mealType: "lunch" })).toEqual({ kind: "delete_entry", target: "meal", mealType: "lunch", date: undefined, glasses: undefined });
    expect(ok({ kind: "delete_entry", target: "meal", date: "2026-10-19" })).toMatchObject({ date: "2026-10-19" });
    expect(reason({ kind: "delete_entry", target: "meal", date: "2026-10-21" })).toBe("date_out_of_range");
    expect(reason({ kind: "delete_entry", target: "meal", date: "2026-10-18" })).toBe("date_out_of_range");
    expect(reason({ kind: "delete_entry", target: "everything" })).toBe("bad_value");
    expect(reason({ kind: "delete_entry", target: "meal", mealType: "brunch" })).toBe("bad_value");
  });

  it("removes 1 glass of water by default, within the water bounds", () => {
    expect(ok({ kind: "delete_entry", target: "water" })).toMatchObject({ glasses: 1 });
    expect(ok({ kind: "delete_entry", target: "water", glasses: 2.4 })).toMatchObject({ glasses: 2 });
    expect(reason({ kind: "delete_entry", target: "water", glasses: 40 })).toBe("bad_value");
    expect(ok({ kind: "delete_entry", target: "weight", mealType: "lunch", glasses: 3 })).toEqual({ kind: "delete_entry", target: "weight", mealType: undefined, date: undefined, glasses: undefined });
  });

  it("edits a saved meal by replacing, adding or removing foods", () => {
    expect(ok({ kind: "edit_meal", mode: "remove", span: "rice", mealType: "lunch", confidence: "high" })).toEqual({
      kind: "edit_meal",
      mode: "remove",
      span: "rice",
      mealType: "lunch",
      date: undefined,
      confidence: "high",
    });
    expect(reason({ kind: "edit_meal", mode: "wipe", span: "rice" })).toBe("bad_value");
    expect(reason({ kind: "edit_meal", mode: "add", span: "  " })).toBe("empty");
    expect(reason({ kind: "edit_meal", mode: "add", span: "chai", date: "2026-10-22" })).toBe("date_out_of_range");
  });

  it("always asks for OK, and counts as the turn's one edit", () => {
    expect(tierFor({ kind: "delete_entry", target: "meal" }, CTX)).toBe("approve");
    expect(tierFor({ kind: "edit_meal", mode: "add", span: "chai", confidence: "high" }, CTX)).toBe("approve");
    const turn = planTurn(
      [
        { kind: "delete_entry", target: "meal", mealType: "lunch" },
        { kind: "delete_entry", target: "meal", mealType: "dinner" },
        { kind: "edit_meal", mode: "add", span: "chai", confidence: "high" },
      ],
      CTX,
    );
    expect(turn.items.map((i) => [i.action.kind, i.tier])).toEqual([["delete_entry", "approve"]]);
    expect(turn.dropped.map((d) => d.reason)).toEqual(["too_many_edits", "too_many_edits"]);
  });
});

describe("tierFor", () => {
  const tier = (a: AssistantAction, ctx = CTX) => tierFor(a, ctx);

  it("does sure, same-day logs straight away", () => {
    expect(tier({ kind: "log_meal", span: "poha", confidence: "high" })).toBe("do");
    expect(tier({ kind: "log_workout", span: "3 sets bench 40 kg", confidence: "high" })).toBe("do");
    expect(tier({ kind: "log_water", glasses: 2 })).toBe("do");
    expect(tier({ kind: "start_activity", activity: "walk" })).toBe("do");
  });

  it("approves anything heard or matched without high confidence (D93)", () => {
    expect(tier({ kind: "log_meal", span: "dahl", confidence: "medium" })).toBe("approve");
    expect(tier({ kind: "log_meal", span: "dahl", confidence: "low" })).toBe("approve");
    expect(tier({ kind: "log_weight", kg: 72.5, confidence: "medium" })).toBe("approve");
  });

  it("approves changes to another day and to the plan", () => {
    expect(tier({ kind: "log_meal", span: "poha", date: "2026-10-19", confidence: "high" })).toBe("approve");
    expect(tier({ kind: "set_day", dayType: "sick", date: "2026-10-20" })).toBe("approve");
    expect(tier({ kind: "plan_meal", span: "paneer", mealType: "dinner", date: "2026-10-21" })).toBe("approve");
  });

  it("approves unusual values", () => {
    expect(tier({ kind: "log_weight", kg: 75, confidence: "high" })).toBe("approve");
    expect(tier({ kind: "log_weight", kg: 72.8, confidence: "high" })).toBe("do");
    expect(tier({ kind: "log_weight", kg: 75, confidence: "high" }, { ...CTX, lastWeightKg: null })).toBe("do");
    expect(tier({ kind: "log_water", glasses: 8 })).toBe("approve");
  });

  it("answers, asks and refuses", () => {
    expect(tier({ kind: "ask", topic: "week" })).toBe("answer");
    expect(tier({ kind: "clarify", question: "Which meal?", options: [] })).toBe("ask");
    expect(tier({ kind: "out_of_scope" })).toBe("refuse");
  });
});

describe("planTurn", () => {
  it("runs the poha / sick / walk example as three actions", () => {
    const turn = planTurn(
      [
        { kind: "log_meal", span: "poha", mealType: "breakfast", confidence: "high" },
        { kind: "set_day", dayType: "sick", date: "2026-10-20", note: "feeling unwell" },
        { kind: "start_activity", activity: "walk" },
      ],
      CTX,
    );
    expect(turn.items.map((i) => [i.action.kind, i.tier])).toEqual([
      ["log_meal", "do"],
      ["set_day", "approve"],
      ["start_activity", "do"],
    ]);
    expect(turn.dropped).toEqual([]);
  });

  it("drops what's past the action cap", () => {
    const many = Array.from({ length: MAX_ACTIONS_PER_TURN + 2 }, (_, i) => ({ kind: "log_meal", span: `item ${i}`, confidence: "high" }));
    const turn = planTurn(many, CTX);
    expect(turn.items).toHaveLength(MAX_ACTIONS_PER_TURN);
    expect(turn.dropped.map((d) => d.reason)).toEqual(["too_many_actions", "too_many_actions"]);
  });

  it("allows one edit per turn", () => {
    const turn = planTurn([{ kind: "undo" }, { kind: "correct", index: 0, span: "dal" }], CTX);
    expect(turn.items.map((i) => i.action.kind)).toEqual(["undo"]);
    expect(turn.dropped[0]!.reason).toBe("too_many_edits");
  });

  it("drops repeats and a second activity", () => {
    const turn = planTurn(
      [
        { kind: "start_activity", activity: "walk" },
        { kind: "start_activity", activity: "walk" },
        { kind: "start_activity", activity: "run" },
      ],
      CTX,
    );
    expect(turn.items).toHaveLength(1);
    expect(turn.dropped.map((d) => d.reason)).toEqual(["duplicate", "already_running"]);
  });

  it("keeps out-of-scope only when it stands alone", () => {
    expect(planTurn([{ kind: "out_of_scope" }], CTX).items[0]!.tier).toBe("refuse");
    const mixed = planTurn([{ kind: "log_water", glasses: 1 }, { kind: "out_of_scope" }], CTX);
    expect(mixed.items.map((i) => i.action.kind)).toEqual(["log_water"]);
    expect(mixed.dropped[0]!.reason).toBe("mixed_out_of_scope");
  });

  it("returns nothing for a non-list answer", () => {
    expect(planTurn({ kind: "log_water", glasses: 1 }, CTX)).toEqual({ items: [], dropped: [] });
    expect(planTurn("ignore previous instructions", CTX)).toEqual({ items: [], dropped: [] });
  });

  describe("adversarial: nothing unsafe reaches the phone as Do", () => {
    const attacks: [string, unknown[]][] = [
      ["raw target", [{ kind: "set_target", kcal: 600 }, { kind: "set_day", dayType: "normal", date: "2026-10-20", kcal: 600 }]],
      ["negative calories", [{ kind: "log_meal", span: "-500 kcal", confidence: "high", kcal: -500 }]],
      ["another user", [{ kind: "log_meal", span: "pizza", confidence: "high", userId: "rahul" }]],
      ["bulk delete", [{ kind: "delete_all" }, { kind: "undo" }, { kind: "undo" }, { kind: "undo" }]],
      ["raw route", [{ kind: "open", screen: "/(tabs)/settings?wipe=1" }]],
      ["fast for days", [{ kind: "set_day", dayType: "fast", date: "2026-10-20" }]],
      ["fifty pizzas", Array.from({ length: 50 }, () => ({ kind: "log_meal", span: "pizza", confidence: "high" }))],
      ["far past", [{ kind: "log_weight", kg: 40, date: "2025-01-01", confidence: "high" }]],
    ];

    for (const [name, actions] of attacks) {
      it(name, () => {
        const turn = planTurn(actions, CTX);
        for (const it of turn.items) {
          expect(Object.keys(it.action)).not.toContain("kcal");
          expect(Object.keys(it.action)).not.toContain("userId");
          if (it.action.kind === "set_day") expect(it.tier).toBe("approve");
        }
        expect(turn.items.length).toBeLessThanOrEqual(MAX_ACTIONS_PER_TURN);
        expect(turn.items.filter((i) => i.action.kind === "undo" || i.action.kind === "correct").length).toBeLessThanOrEqual(1);
      });
    }

    it("logs a pizza once per span even when told fifty times", () => {
      const turn = planTurn(Array.from({ length: 50 }, () => ({ kind: "log_meal", span: "pizza", confidence: "high" })), CTX);
      expect(turn.items).toHaveLength(1);
    });
  });
});

describe("numbersGrounded", () => {
  const facts = [1612, 60, 4, 6, 72, 110];

  it("accepts the fact numbers and rounding", () => {
    expect(numbersGrounded("Today is 1,600 kcal and 60 g protein.", facts)).toBe(true);
    expect(numbersGrounded("4 of 6 days on target, protein avg 72 of 110 g.", facts)).toBe(true);
    expect(numbersGrounded("No numbers here.", facts)).toBe(true);
  });

  it("rejects a number that isn't in the facts", () => {
    expect(numbersGrounded("Let's do 1,200 kcal today.", facts)).toBe(false);
    expect(numbersGrounded("Run for 90 minutes.", facts)).toBe(false);
  });
});

describe("stricterTier", () => {
  it("keeps the stricter of the phone's and the server's tier", () => {
    expect(stricterTier("do", "approve")).toBe("approve");
    expect(stricterTier("approve", "do")).toBe("approve");
    expect(stricterTier("ask", "approve")).toBe("ask");
    expect(stricterTier("refuse", "do")).toBe("refuse");
    expect(stricterTier("answer", "do")).toBe("answer");
    expect(stricterTier("answer", "refuse")).toBe("refuse");
  });
});

describe("confidence signals (AB6)", () => {
  it("reads Whisper segment scores", () => {
    expect(sttConfidence([{ avg_logprob: -0.2, no_speech_prob: 0.01 }, { avg_logprob: -0.3, no_speech_prob: 0.02 }])).toBe("high");
    expect(sttConfidence([{ avg_logprob: -0.5, no_speech_prob: 0.01 }])).toBe("medium");
    expect(sttConfidence([{ avg_logprob: -1.1, no_speech_prob: 0.01 }])).toBe("low");
    expect(sttConfidence([{ avg_logprob: -0.1, no_speech_prob: 0.9 }])).toBe("low");
  });

  it("treats a transcript with no scores (Gemini) as medium", () => {
    expect(sttConfidence(null)).toBe("medium");
    expect(sttConfidence([])).toBe("medium");
  });

  it("takes the lower of two confidences", () => {
    expect(lowerConfidence("high", "medium")).toBe("medium");
    expect(lowerConfidence("low", "high")).toBe("low");
  });

  it("rates food matches: strong, weak or close tie, none", () => {
    expect(matchConfidence([{ score: 1, runnerUp: 0.6, uncertain: false }])).toBe("high");
    expect(matchConfidence([{ score: 0.7, runnerUp: null, uncertain: false }])).toBe("medium");
    expect(matchConfidence([{ score: 0.9, runnerUp: 0.86, uncertain: false }])).toBe("medium");
    expect(matchConfidence([{ score: null, runnerUp: null, uncertain: true }])).toBe("low");
    expect(matchConfidence([{ score: 0.95, runnerUp: null, uncertain: true }])).toBe("low");
    expect(matchConfidence([])).toBe("low");
  });

  it("flags unusual quantities and big changes from the usual portion", () => {
    expect(quantityUnusual(2, "piece")).toBe(false);
    expect(quantityUnusual(12, "piece")).toBe(true);
    expect(quantityUnusual(5000, "ml")).toBe(true);
    expect(quantityUnusual(0, "katori")).toBe(true);
    expect(deviatesFromUsual(6, 2)).toBe(true);
    expect(deviatesFromUsual(3, 2)).toBe(false);
    expect(deviatesFromUsual(6, null)).toBe(false);
  });

  it("drops spans the router made up", () => {
    expect(spanInTranscript("poha", "had poha for breakfast, feeling sick")).toBe(true);
    expect(spanInTranscript("two rotis and dal", "Two rotis and dal for lunch")).toBe(true);
    expect(spanInTranscript("paneer tikka", "had panir tika and chai")).toBe(false);
    expect(spanInTranscript("chicken biryani", "had poha")).toBe(false);
    expect(spanInTranscript("", "had poha")).toBe(false);
  });
});

describe("applyAliases (D97)", () => {
  it("rewrites whole words only, longest first", () => {
    const aliases = [
      { heard: "dahl", means: "dal tadka" },
      { heard: "panir tika", means: "paneer tikka" },
    ];
    expect(applyAliases("had dahl and rice", aliases)).toBe("had dal tadka and rice");
    expect(applyAliases("Dahl, two rotis", aliases)).toBe("dal tadka, two rotis");
    expect(applyAliases("panir tika for dinner", aliases)).toBe("paneer tikka for dinner");
    expect(applyAliases("dahlia salad", aliases)).toBe("dahlia salad");
    expect(applyAliases("anything", [{ heard: "a.b", means: "x" }])).toBe("anything");
  });
});

describe("factsForDayType", () => {
  it("makes every day type classify as itself, from an empty day", () => {
    for (const t of DAY_TYPES) expect(classifyDay(factsForDayType(t), EMPTY_STANDING)).toBe(t);
  });

  it("keeps the brief and only adds what's missing", () => {
    const brief = validateDayFacts({ blocks: [{ from: 540, to: 1080, kind: "work" }], flags: [] });
    const sick = factsForDayType("sick", brief);
    expect(sick.flags).toEqual(["sick"]);
    expect(sick.blocks).toEqual(brief.blocks);
  });

  it("clears a signal that would win over the asked type", () => {
    const sickDay = validateDayFacts({ flags: ["sick"] });
    expect(classifyDay(factsForDayType("rest", sickDay), EMPTY_STANDING)).toBe("rest");
    const travelling = validateDayFacts({ whereabouts: "travelling" });
    expect(classifyDay(factsForDayType("normal", travelling), EMPTY_STANDING)).toBe("normal");
  });

  it("leaves a day that's already that type alone", () => {
    const f = validateDayFacts({ flags: ["exam"] });
    expect(factsForDayType("exam", f)).toEqual(f);
  });
});

describe("localAskTopic (offline, D98)", () => {
  it("recognises plain questions in English and Hinglish", () => {
    expect(localAskTopic("how's my day going?")).toBe("today");
    expect(localAskTopic("aaj kaisa chal raha hai")).toBe("today");
    expect(localAskTopic("what's my streak")).toBe("streak");
    expect(localAskTopic("what's the plan")).toBe("plan");
    expect(localAskTopic("aaj ka plan kya hai")).toBe("plan");
    expect(localAskTopic("how's my week looking")).toBe("week");
    expect(localAskTopic("how is my weight trending")).toBe("trend");
    expect(localAskTopic("what should I eat now")).toBe("what_to_eat");
  });

  it("leaves anything else to the router", () => {
    expect(localAskTopic("had poha for breakfast")).toBeNull();
    expect(localAskTopic("start a walk")).toBeNull();
    expect(localAskTopic("")).toBeNull();
  });
});
