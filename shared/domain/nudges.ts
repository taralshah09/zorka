// P36 · When the coach speaks (D61). Pure rules engine shared by mobile and backend (D24): the phone gathers the facts,
// this decides which notifications to schedule today (and tomorrow morning), and the phone schedules them locally.
// What the coach says comes from the persona templates on the phone; this file only decides when and where taps go.
//
// Constants are the ones accepted at the P36 gate (docs/DECISIONS.md D61). Changing any of them is a product decision.
// LA3 (docs/LIFE_PLAN.md "nudges.ts") adds the day: a nudge that falls inside a block moves to the free minute before it
// (or is dropped), day-type rules turn kinds off, and `planLifeNudges` adds the brief prompt and prep.
import { DAY_RULES, type DayType } from "./dayType.js";
import type { Block } from "./life.js";

export type NudgeKind =
  "morning" | "protein" | "workout" | "slipping" | "streak" | "praise";
/** "plan" (LA2): a life nudge tap opens the brief for tomorrow. */
export type NudgeRoute = "today" | "gap" | "train" | "plan";

export const NUDGE_KINDS: readonly NudgeKind[] = [
  "morning",
  "protein",
  "workout",
  "slipping",
  "streak",
  "praise",
];
/** Default minute of the day for each timed nudge. Praise is sent right away. */
export const NUDGE_MINUTE: Record<Exclude<NudgeKind, "praise">, number> = {
  morning: 8 * 60,
  protein: 16 * 60,
  workout: 18 * 60,
  slipping: 19 * 60 + 30,
  streak: 20 * 60 + 30,
};
/** Lower index wins when the daily cap is reached. */
export const NUDGE_PRIORITY: readonly NudgeKind[] = [
  "morning",
  "workout",
  "protein",
  "slipping",
  "praise",
  "streak",
];
export const NUDGE_ROUTE: Record<NudgeKind, NudgeRoute> = {
  morning: "today",
  protein: "gap",
  workout: "train",
  slipping: "gap",
  streak: "today",
  praise: "today",
};
/** Protein warning: more than this share of the protein target still left. */
export const PROTEIN_WARNING_SHARE = 0.3;
export const DEFAULT_PER_DAY = 1;
export const MIN_PER_DAY = 1;
export const MAX_PER_DAY = 6;

export type NudgeSettings = {
  times?: Partial<Record<Exclude<NudgeKind, "praise">, number>>;
  snoozedUntil?: string | null;
  enabled: boolean;
  perDay: number;
  /** Minutes of the day; quiet hours may wrap past midnight (22:00–07:00). */
  quietStart: number;
  quietEnd: number;
  kinds: Record<NudgeKind, boolean>;
};

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  enabled: false,
  perDay: DEFAULT_PER_DAY,
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  kinds: {
    morning: false,
    protein: false,
    workout: false,
    slipping: false,
    streak: false,
    praise: false,
  },
};

export type NudgeFacts = {
  /** LA3: today's blocks from the brief or the assumed day. Nudges never land inside one. */
  blocks?: Block[];
  /** LA3: today's day type; DAY_RULES[type].nudges turns kinds off. */
  dayType?: DayType;
  coverageComplete?: boolean;
  restToday?: boolean;
  visitFinished?: boolean;
  minuteOfDay: number;
  /** Share of today's protein target still left (0–1, 0 when hit). */
  proteinLeftShare: number;
  /** The P31 rule says "under" at the slipping time if nothing else is eaten. */
  underAtSlipping: boolean;
  hasRoutine: boolean;
  workoutToday: boolean;
  streakCurrent: number;
  loggedToday: boolean;
  allGoalsHit: boolean;
  /** Nudges already delivered today (they count against the cap), and whether praise was one of them. */
  deliveredToday: number;
  praiseSentToday: boolean;
};

export type PlannedNudge = {
  kind: NudgeKind;
  route: NudgeRoute;
  dayOffset: 0 | 1;
  minute: number;
  immediate: boolean;
};

export function inQuietHours(
  minute: number,
  s: Pick<NudgeSettings, "quietStart" | "quietEnd">,
): boolean {
  if (s.quietStart === s.quietEnd) return false;
  return s.quietStart < s.quietEnd
    ? minute >= s.quietStart && minute < s.quietEnd
    : minute >= s.quietStart || minute < s.quietEnd;
}

const clampPerDay = (n: number) =>
  Math.min(MAX_PER_DAY, Math.max(MIN_PER_DAY, Math.round(n)));

function capByPriority(list: PlannedNudge[], cap: number): PlannedNudge[] {
  if (cap <= 0) return [];
  const rank = (k: NudgeKind) => NUDGE_PRIORITY.indexOf(k);
  return [...list]
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .slice(0, cap)
    .sort((a, b) => a.minute - b.minute);
}

/**
 * Today's remaining nudges plus tomorrow's morning plan and streak check. Each one is only planned when its condition
 * holds right now; the phone re-plans whenever the app opens or something is logged, so a protein warning disappears
 * once protein is hit. Quiet hours and the daily cap (minus what was already delivered) always apply.
 */
export function planNudges(
  facts: NudgeFacts,
  settings: NudgeSettings,
): PlannedNudge[] {
  if (!settings.enabled) return [];
  const perDay = clampPerDay(settings.perDay);
  const on = (k: NudgeKind) => settings.kinds[k];
  const now = facts.minuteOfDay;
  const allowedAt = (minute: number) => !inQuietHours(minute, settings);
  const timeFor = (kind: Exclude<NudgeKind, "praise">) => Math.max(0, Math.min(1439, Math.round(settings.times?.[kind] ?? NUDGE_MINUTE[kind])));
  const timed = (
    kind: Exclude<NudgeKind, "praise">,
    dayOffset: 0 | 1,
  ): PlannedNudge => ({
    kind,
    route: NUDGE_ROUTE[kind],
    dayOffset,
    minute: timeFor(kind),
    immediate: false,
  });

  const today: PlannedNudge[] = [];
  if (
    on("praise") &&
    facts.coverageComplete === true &&
    facts.allGoalsHit &&
    !facts.praiseSentToday &&
    allowedAt(now)
  ) {
    today.push({
      kind: "praise",
      route: "today",
      dayOffset: 0,
      minute: now,
      immediate: true,
    });
  }
  const upcoming = (k: Exclude<NudgeKind, "praise">) =>
    on(k) && timeFor(k) > now && allowedAt(timeFor(k));
  if (upcoming("morning")) today.push(timed("morning", 0));
  if (upcoming("protein") && facts.coverageComplete === true && !facts.visitFinished && facts.proteinLeftShare > PROTEIN_WARNING_SHARE)
    today.push(timed("protein", 0));
  if (upcoming("workout") && facts.hasRoutine && !facts.workoutToday && !facts.restToday && timeFor("workout") < 21 * 60 + 30)
    today.push(timed("workout", 0));
  if (upcoming("slipping") && facts.coverageComplete === true && !facts.visitFinished && facts.underAtSlipping && !facts.allGoalsHit)
    today.push(timed("slipping", 0));
  if (upcoming("streak") && facts.streakCurrent > 0 && !facts.loggedToday)
    today.push(timed("streak", 0));

  // Tomorrow: the morning plan, and the streak check (cancelled by the re-plan as soon as something is logged).
  const tomorrow: PlannedNudge[] = [];
  if (on("morning") && allowedAt(timeFor("morning")))
    tomorrow.push(timed("morning", 1));
  if (
    on("streak") &&
    allowedAt(timeFor("streak")) &&
    (facts.streakCurrent > 0 || facts.loggedToday)
  )
    tomorrow.push(timed("streak", 1));

  return [
    ...capByPriority(fitDay(today, facts, settings), perDay - facts.deliveredToday),
    ...capByPriority(tomorrow, perDay),
  ];
}

/** Kinds each day-type nudge tactic keeps (LIFE_PLAN.md table). Missing = every kind. */
export const DAY_NUDGE_KINDS: Partial<Record<(typeof DAY_RULES)[DayType]["nudges"], readonly NudgeKind[]>> = {
  prep_and_morning: ["morning", "praise"],
  prep_only: [],
  minimal: ["morning", "praise"],
  care_only: ["morning"],
};

/**
 * LA3: today's nudges against the day. Day-type tactics turn kinds off; on a late-work day nothing is sent once that
 * work block starts; a nudge inside a block moves to the minute before the block (dropped if that's past, in quiet
 * hours or inside another block). Work and study blocks count only with canMove false, so an office day doesn't push
 * every nudge to 9:29. Immediate nudges (praise) are left alone.
 */
function fitDay(list: PlannedNudge[], facts: NudgeFacts, settings: NudgeSettings): PlannedNudge[] {
  const tactic = facts.dayType ? DAY_RULES[facts.dayType].nudges : "usual";
  const keep = DAY_NUDGE_KINDS[tactic];
  const blocks = facts.blocks ?? [];
  const lateStart =
    tactic === "none_after_work" ? Math.min(...blocks.filter((b) => (b.kind === "work" || b.kind === "study") && b.to > 21 * 60).map((b) => b.from)) : Infinity;
  // Meetings, events, travel and the like hold nudges back; an ordinary work or study block only when it says it's busy.
  const holds = (b: Block) => !(b.kind === "work" || b.kind === "study") || b.canMove === false;
  const inBlock = (m: number) => blocks.find((b) => holds(b) && m >= b.from && m < b.to);
  const out: PlannedNudge[] = [];
  for (const n of list) {
    if (n.immediate) {
      out.push(n);
      continue;
    }
    if (keep && !keep.includes(n.kind)) continue;
    let minute = n.minute;
    const block = inBlock(minute);
    if (block) minute = block.from - 1;
    if (minute >= lateStart) continue;
    if (minute <= facts.minuteOfDay || inQuietHours(minute, settings) || inBlock(minute)) continue;
    out.push(minute === n.minute ? n : { ...n, minute });
  }
  return out;
}

// ── LA2/LA3 · Life nudges: the evening brief prompt and prep ─────────────────────────────────────────

export type LifeNudgeKind = "brief_prompt" | "prep";
export type LifeNudge = { kind: LifeNudgeKind; dayOffset: 0 | 1; minute: number; text: string };
/** At most this many life nudges a day, on top of the coach nudges. */
export const MAX_LIFE_NUDGES_PER_DAY = 3;
/** D73: the evening prompt, unless the user picked another time. */
export const DEFAULT_BRIEF_PROMPT_MINUTE = 21 * 60;

export type LifeNudgeInput = {
  /** Minute of the day now. */
  now: number;
  /** null = the brief prompt is off. */
  briefPromptMinute: number | null;
  /** Tomorrow already has a confirmed brief: no prompt. */
  tomorrowBriefed: boolean;
  /** Reminders from the plans (planDay prep items): today's prep, and tomorrow's evening-before prep. */
  todayReminders: ReadonlyArray<{ kind: "prep"; at: number; dayOffset: -1 | 0; text: string }>;
  tomorrowReminders: ReadonlyArray<{ kind: "prep"; at: number; dayOffset: -1 | 0; text: string }>;
  settings: Pick<NudgeSettings, "enabled" | "quietStart" | "quietEnd">;
};

/**
 * Today's life nudges. The brief prompt has its own switch (briefPromptMinute, D73); prep follows the coach
 * nudge switch (PA: off by default). Quiet hours apply to all of them; MAX_LIFE_NUDGES_PER_DAY caps them, prep first.
 */
export function planLifeNudges(input: LifeNudgeInput): LifeNudge[] {
  const out: LifeNudge[] = [];
  const ok = (m: number) => m > input.now && m < 24 * 60 && !inQuietHours(m, input.settings);
  if (input.settings.enabled) {
    for (const r of input.tomorrowReminders)
      if (r.kind === "prep" && r.dayOffset === -1 && ok(r.at)) out.push({ kind: "prep", dayOffset: 0, minute: r.at, text: r.text });
    for (const r of input.todayReminders) {
      if (r.dayOffset === 0 && ok(r.at)) out.push({ kind: "prep", dayOffset: 0, minute: r.at, text: r.text });
    }
  }
  const prompt = input.briefPromptMinute;
  if (prompt != null && !input.tomorrowBriefed && ok(prompt))
    out.push({ kind: "brief_prompt", dayOffset: 0, minute: prompt, text: "How's tomorrow looking?" });
  const rank: Record<LifeNudgeKind, number> = { prep: 0, brief_prompt: 1 };
  return out
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.minute - b.minute)
    .slice(0, MAX_LIFE_NUDGES_PER_DAY)
    .sort((a, b) => a.minute - b.minute);
}
