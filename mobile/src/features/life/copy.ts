// Copy for the life plan. The planner gives codes and numbers (D72); these templates turn them into sentences. The coach
// persona may rephrase them in chat, but the numbers always come from the plan.
import type { DayType } from "@shared/domain/dayType";
import type { MealAccess, Whereabouts, BlockKind, DayFlag } from "@shared/domain/life";
import type { DayPlan, PlanItem, PlanWhy } from "@shared/domain/planDay";
import type { Cause, DayLedgerInput, WeekDay, WeekPlan } from "@shared/domain/week";
import { MEAL_LABEL } from "@/features/food/format";
import { minuteLabel } from "./standing";

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  normal: "Usual day",
  busy: "Busy day",
  away: "Away day",
  travel: "Travel day",
  late_work: "Late work",
  feast: "Event day",
  exam: "Exam day",
  sick: "Sick day",
  rest: "Rest day",
};

export const WHEREABOUTS_LABEL: Record<Whereabouts, string> = {
  home: "Around home",
  away_local: "Out in the city",
  travelling: "Travelling",
  other_city: "Another city",
};

export const ACCESS_LABEL: Record<MealAccess, string> = {
  home: "Home",
  mess: "Mess",
  canteen: "Canteen",
  eat_out: "Eating out",
  packed: "Packed",
  event_food: "Event food",
  unknown: "Not sure",
};

export const BLOCK_LABEL: Record<BlockKind, string> = {
  work: "Work",
  travel: "Travel",
  event: "Event",
  social: "Social",
  study: "Study",
  sleep: "Sleep",
  other: "Busy",
};

export const FLAG_LABEL: Record<DayFlag, string> = {
  sick: "Feeling sick",
  exam: "Exam",
  fasting: "Fasting",
  feast: "Big meal / event",
  rest_day: "Rest day",
  no_gym_access: "No gym",
};

const WHY: Partial<Record<PlanWhy, string>> = {
  assumed_day: "No brief for this day, so this assumes a usual day. Tell me if not.",
  event_allowance: "Event day: a bigger allowance, already made room for this week.",
  event_prebank: "A little lighter to make room for an event later this week.",
  over_spread: "A little lighter: an earlier day went over.",
  under_spread: "A little more: an earlier day came in under.",
  missed_protein_spread: "A bit more protein to make up an earlier day.",
  achievable_protein: "Protein set to what your meals today can realistically give.",
  chosen_target: "You picked this day's numbers.",
  chosen_spread: "Moved a little because you picked another day's numbers.",
  missed_steps_spread: "A few more steps to make up an earlier day.",
  busy_steps_flex: "Fewer steps today; the rest moves to other days.",
  away_no_steps: "You'll likely walk plenty out there, so no step reminders.",
  travel_no_steps: "No step goal on a travel day.",
  sick_care: "Rest and eat at maintenance. Nothing moves because you're unwell.",
  session_moved: "A workout moved here because another day couldn't hold it.",
  session_planned: "Workout planned.",
  event_food: "Event food: start with the protein, then enjoy it.",
  lunch_walk: "A short walk at lunch instead of the late evening.",
  no_window_for_workout: "No free window long enough for a workout today.",
};

export const whyText = (codes: readonly PlanWhy[]) => codes.map((c) => WHY[c]).filter((t): t is string => !!t);

export function itemTitle(item: PlanItem): string {
  switch (item.kind) {
    case "meal":
      return item.usual ? `${MEAL_LABEL[item.slot]}: ${item.title}` : `${MEAL_LABEL[item.slot]} · ${ACCESS_LABEL[item.access]}`;
    case "workout":
      return `${item.name} · ${item.minutes} min`;
    case "walk":
      return `Walk · ${item.minutes} min`;
    case "prep":
      return item.text;
  }
}

/** "Your meals give about 109 g of the 120 g. Add 1 scoop whey (≈ ₹60) for 24 g more." null when the meals reach it. */
export function stepUpLine(plan: DayPlan): string | null {
  const s = plan.protein.stepUp;
  if (!s) return null;
  return `Your meals give about ${plan.protein.achievableG} g of the ${plan.targets.proteinG} g. Add ${s.staple.name} (≈ ₹${s.costInr}) for ${s.proteinG} g more.`;
}

export const itemTime = (item: PlanItem) => (item.kind === "prep" && item.dayOffset === -1 ? `Night before, ${minuteLabel(item.at)}` : minuteLabel(item.at));

/** "Can't fit 400 kcal this week without going too low. Letting it go." and friends. */
export function forgivenLines(week: WeekPlan): string[] {
  const out: string[] = [];
  const f = week.forgiven;
  if (week.why.includes("forgiven_kcal") && f.kcal < 0) out.push(`Can't fit ${Math.abs(f.kcal)} kcal this week without going too low. Letting it go.`);
  if (week.why.includes("forgiven_kcal") && f.kcal > 0) out.push(`${f.kcal} kcal under this week. No need to make it up.`);
  const missedProtein = f.proteinG - (week.limits?.proteinG ?? 0);
  if (missedProtein > 0) out.push(`${missedProtein} g protein can't fit this week. That's fine.`);
  if (week.why.includes("forgiven_steps")) out.push(`${f.steps.toLocaleString("en-IN")} steps won't fit this week. Letting them go.`);
  if (f.sessions > 0) {
    const done = week.sessionsDone + (week.days.filter((d) => d.train && !d.past).length);
    out.push(`${week.sessionsTarget} workouts won't fit this week. ${done} is still a good week.`);
  }
  return out;
}

export const weekdayShort = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00Z`).getUTCDay()]!;

// ── "Since Tuesday…": what moved on a day and why, from the ledger's adjust records (week.ts) ─────────────────────

const GUARD_LABEL: Record<"kcal" | "proteinG" | "steps" | "train", string> = { kcal: "calories", proteinG: "protein", steps: "steps", train: "workout" };

/** Who planned the day, for the plan card. */
export function sourceLine(plan: DayPlan): string {
  if (plan.source !== "ai") return "Planned by Zorka's rules";
  const back = plan.ai?.fellBack ?? [];
  return back.length
    ? `Planned by AI · ${back.map((m) => GUARD_LABEL[m]).join(" and ")} kept to the rules so your week adds up`
    : "Planned by AI · checked against safe limits";
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
/** "today", "yesterday", "tomorrow", else the weekday ("Tuesday"). */
export function dayName(date: string, today: string): string {
  const diff = dayNum(date) - dayNum(today);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  return WEEKDAY_LONG[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}
const list = (names: string[]) => {
  const u = [...new Set(names)];
  return u.length <= 1 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} and ${u.at(-1)}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Sentences for a planned day's changes, e.g. "Since Tuesday came in short on protein, today's protein is raised to
 * 162 g from 135 g to keep your week's average." Every number comes from the ledger.
 */
export function adjustLines(d: WeekDay, today: string, eatenProteinG?: number | null): string[] {
  const sick = sickLine(d, today, eatenProteinG);
  return sick ? [sick, ...changeLines(d, today)] : changeLines(d, today);
}

/**
 * D86 · A sick day's protein: "Since you're unwell today, try to have at least 81 g of your usual 135 g protein…".
 * Once today's meals reach the minimum it says so. null on other days.
 */
export function sickLine(d: WeekDay, today: string, eatenProteinG?: number | null): string | null {
  const s = d.sick;
  if (!s || d.past) return null;
  const isToday = d.date === today;
  const eaten = isToday && eatenProteinG != null ? Math.round(eatenProteinG) : null;
  if (eaten != null && eaten >= s.minG)
    return `You've had ${eaten} g protein, past today's ${s.minG} g minimum. That's enough while you're unwell. Rest up, your week stays on track.`;
  const when = isToday ? "Since you're unwell today" : `Since you'll be unwell ${dayName(d.date, today)}`;
  return (
    `${when}, try to have at least ${s.minG} g of your usual ${s.baseG} g protein. Reach that and the rest is let go: ` +
    `nothing extra moves to the coming days, and your week stays on track.` +
    (eaten != null && eaten > 0 ? ` ${eaten} g so far, ${s.minG - eaten} g to go.` : "")
  );
}

function changeLines(d: WeekDay, today: string): string[] {
  // D85: an AI-planned day explains itself; the guard's changes are said plainly.
  if (d.ai) {
    const out = d.ai.reason ? [d.ai.reason] : [];
    if (d.ai.guarded.length) out.push(`Adjusted to stay within safe limits (${d.ai.guarded.map((m) => GUARD_LABEL[m]).join(", ")}).`);
    return out;
  }
  const a = d.adjust;
  if (!a) return [];
  const subj = dayName(d.date, today);
  const poss = `${subj}'s`;
  // Weekday names keep their capital; "today" / "tomorrow" stay lower case mid-sentence.
  const names = (causes: Cause[], kinds: Cause["kind"][]) => causes.filter((c) => kinds.includes(c.kind)).map((c) => dayName(c.date, today));
  const out: string[] = [];

  const picked = (x: { causes: Cause[] } | undefined) => !!x?.causes.some((c) => c.date === d.date && c.kind === "chosen");
  const others = (causes: Cause[]) => causes.filter((c) => c.date !== d.date);
  const chosenBy = (causes: Cause[]) => names(others(causes), ["chosen"]);

  if (a.proteinG && picked(a.proteinG)) {
    const p = a.proteinG;
    out.push(
      `You set ${poss} protein to ${p.to} g (usually ${p.from} g).` +
        (p.to < p.from && p.movedTo?.length ? ` The other ${p.from - p.to} g moves to ${list(p.movedTo.map((x) => dayName(x, today)))}.` : ""),
    );
  } else if (a.proteinG) {
    const p = a.proteinG;
    const self = p.causes.some((c) => c.date === d.date && c.kind === "limited");
    if (self && p.to > p.from) {
      out.push(`${cap(poss)} meals can realistically give ${p.from} g of protein. To keep your week's average, aim for ${p.to} g; an add-on covers the rest.`);
    } else if (p.to < p.from) {
      const rest = p.from - p.to;
      out.push(
        `${cap(poss)} meals can realistically give ${p.to} g of protein (usually ${p.from} g).` +
          (p.movedTo?.length ? ` The other ${rest} g moves to ${list(p.movedTo.map((x) => dayName(x, today)))}.` : " The rest can't fit this week, so it's let go."),
      );
    } else {
      const short = names(p.causes, ["short"]);
      const limited = names(others(p.causes), ["limited"]);
      const chose = chosenBy(p.causes);
      const why = [
        short.length ? `${list(short)} came in short on protein` : null,
        limited.length ? `${list(limited)} can't reach the usual protein` : null,
        chose.length ? `you set ${list(chose)} lower` : null,
      ].filter(Boolean).join(" and ");
      out.push(`Since ${why || "an earlier day came in short"}, ${poss} protein is raised to ${p.to} g from ${p.from} g to keep your week's average.`);
    }
  }
  if (a.kcal && picked(a.kcal)) {
    const k = a.kcal;
    out.push(
      `You set ${subj} to ${fmt(k.to)} kcal (usually ${fmt(k.from)}).` +
        (k.movedTo?.length ? ` The difference is shared by ${list(k.movedTo.map((x) => dayName(x, today)))}.` : ""),
    );
  } else if (a.kcal) {
    const k = a.kcal;
    const chose = chosenBy(k.causes);
    const over = names(k.causes, ["over"]);
    const events = names(k.causes, ["event"]);
    const under = names(k.causes, ["under"]);
    if (k.to < k.from) {
      const why = [
        over.length ? `${list(over)} went over` : null,
        events.length ? `${list(events)} ${events.length === 1 ? "is an event day" : "are event days"}` : null,
        chose.length ? `you set ${list(chose)} higher` : null,
      ].filter(Boolean).join(" and ");
      out.push(`Since ${why || "the week needs it"}, ${subj} is ${fmt(k.to)} kcal instead of ${fmt(k.from)} to keep your week's average.`);
    } else {
      const why = under.length ? `${list(under)} came in under` : chose.length ? `you set ${list(chose)} lower` : "an earlier day came in under";
      out.push(`Since ${why}, ${subj} is raised to ${fmt(k.to)} kcal from ${fmt(k.from)}.`);
    }
  }
  if (a.steps && picked(a.steps)) {
    const s = a.steps;
    out.push(
      `You set ${poss} step goal to ${fmt(s.to)} (usually ${fmt(s.from)}).` +
        (s.to < s.from && s.movedTo?.length ? ` The rest moves to ${list(s.movedTo.map((x) => dayName(x, today)))}.` : ""),
    );
  } else if (a.steps) {
    const s = a.steps;
    if (s.to < s.from)
      out.push(
        `Less room to walk ${subj}, so the step goal is ${fmt(s.to)} instead of ${fmt(s.from)}` +
          (s.movedTo?.length ? `; the rest moves to ${list(s.movedTo.map((x) => dayName(x, today)))}.` : "."),
      );
    else {
      const short = names(s.causes, ["short"]);
      const busy = names(s.causes, ["busy"]);
      const chose = chosenBy(s.causes);
      const why = [
        short.length ? `${list(short)} fell short on steps` : null,
        busy.length ? `${list(busy)} ${busy.length === 1 ? "has" : "have"} less room to walk` : null,
        chose.length ? `you set ${list(chose)} lower` : null,
      ].filter(Boolean).join(" and ");
      out.push(`Since ${why || "an earlier day fell short"}, ${poss} step goal is ${fmt(s.to)} from ${fmt(s.from)}.`);
    }
  }
  if (a.train) {
    const from = list(a.train.movedFrom.map((x) => dayName(x, today)));
    out.push(a.train.missed ? `You missed ${from}'s workout, so it's planned ${subj}.` : `${cap(from)} has no room for a workout, so it moves to ${subj}.`);
  }
  return out;
}

/** Why codes the adjust lines already explain (so the generic line isn't repeated). */
export const ADJUST_CODES: readonly PlanWhy[] = [
  "achievable_protein",
  "chosen_target",
  "chosen_spread",
  "missed_protein_spread",
  "over_spread",
  "under_spread",
  "event_prebank",
  "missed_steps_spread",
  "busy_steps_flex",
  "session_moved",
];

// ── "How this is counted": the week's arithmetic behind one day's numbers (plan/tomorrow) ──────────────────────────

export type BreakdownMetric = "proteinG" | "kcal" | "steps";
const METRIC_TITLE: Record<BreakdownMetric, string> = { proteinG: "Protein", kcal: "Calories", steps: "Steps" };
const unit = (m: BreakdownMetric, n: number) => (m === "proteinG" ? `${fmt(n)} g` : m === "kcal" ? `${fmt(n)} kcal` : `${fmt(n)} steps`);
const signed = (m: BreakdownMetric, n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${unit(m, Math.abs(n))}`;
const baseOf = (r: DayLedgerInput, m: BreakdownMetric) => Math.round(m === "proteinG" ? r.baseProteinG : m === "kcal" ? r.baseKcal : r.baseSteps);

/**
 * One block per metric: the usual number and the week's total, how earlier days counted, what the other days left are
 * planned at, what's left to make up, and where this day lands. Every number comes from the ledger.
 */
export function breakdownLines(
  week: WeekPlan,
  ledger: readonly DayLedgerInput[],
  date: string,
  today: string,
): { metric: BreakdownMetric; title: string; lines: string[] }[] {
  const row = ledger.find((r) => r.date === date);
  const day = week.days.find((d) => d.date === date);
  if (!row || !day) return [];
  const short = (d: string) => weekdayShort(d);
  const out: { metric: BreakdownMetric; title: string; lines: string[] }[] = [];
  for (const m of ["proteinG", "kcal", "steps"] as const) {
    const value = day[m];
    if (value == null) continue;
    const base = baseOf(row, m);
    const lines: string[] = [];
    const past = week.days.filter((d) => d.past);
    const off = past.filter((d) => d[m] != null && d[m] !== base);
    if (past.length)
      lines.push(
        off.length
          ? `So far: ${off.map((d) => `${short(d.date)} ${unit(m, d[m]!)} (${signed(m, d[m]! - base)})`).join(" · ")}. Other days counted on target.`
          : "So far: every earlier day counted on target (a day with no log counts as on target).",
      );
    if (date !== today && week.days.some((d) => d.date === today))
      lines.push("Today counts at its target until the day is over; then what's left moves on.");
    const rest = week.days.filter((d) => !d.past && d.date !== date && d.date !== today && d[m] != null);
    if (rest.length) lines.push(`Rest of the week: ${rest.map((d) => `${short(d.date)} ${fmt(d[m]!)}`).join(" · ")}`);
    const owed = week.owed?.[m] ?? 0;
    if (m === "kcal" && owed !== 0) lines.push(`To keep the week's average: ${unit(m, Math.abs(owed))} ${owed > 0 ? "more" : "less"} to share over the days left.`);
    else if (m !== "kcal" && owed > 0) lines.push(`To keep the week's average: ${unit(m, owed)} to make up over the days left.`);
    lines.push(`${cap(dayName(date, today))}: ${unit(m, base)} ${value === base ? "(no change)" : `→ ${unit(m, value)} (${signed(m, value - base)})`}`);
    const letGo = m === "proteinG" ? week.forgiven.proteinG - (week.limits?.proteinG ?? 0) : m === "steps" ? week.forgiven.steps - (week.limits?.steps ?? 0) : 0;
    if (letGo > 0) lines.push(`${unit(m, letGo)} can't fit this week without overdoing a day, so it's let go.`);
    out.push({ metric: m, title: `${METRIC_TITLE[m]}: ${unit(m, base)} a day, ${unit(m, base * week.days.length)} this week`, lines });
  }
  return out;
}
