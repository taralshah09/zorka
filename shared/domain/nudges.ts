// P36 · When the coach speaks (D61). Pure rules engine shared by mobile and backend (D24): the phone gathers the facts,
// this decides which notifications to schedule today (and tomorrow morning), and the phone schedules them locally.
// What the coach says comes from the persona templates on the phone; this file only decides when and where taps go.
//
// Constants are the ones accepted at the P36 gate (docs/DECISIONS.md D61). Changing any of them is a product decision.

export type NudgeKind =
  "morning" | "protein" | "workout" | "slipping" | "streak" | "praise";
export type NudgeRoute = "today" | "gap" | "train";

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
  "streak",
  "protein",
  "slipping",
  "workout",
  "morning",
  "praise",
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
export const DEFAULT_PER_DAY = 4;
export const MIN_PER_DAY = 1;
export const MAX_PER_DAY = 6;

export type NudgeSettings = {
  enabled: boolean;
  perDay: number;
  /** Minutes of the day; quiet hours may wrap past midnight (22:00–07:00). */
  quietStart: number;
  quietEnd: number;
  kinds: Record<NudgeKind, boolean>;
};

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  enabled: true,
  perDay: DEFAULT_PER_DAY,
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  kinds: {
    morning: true,
    protein: true,
    workout: true,
    slipping: true,
    streak: true,
    praise: true,
  },
};

export type NudgeFacts = {
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
  const timed = (
    kind: Exclude<NudgeKind, "praise">,
    dayOffset: 0 | 1,
  ): PlannedNudge => ({
    kind,
    route: NUDGE_ROUTE[kind],
    dayOffset,
    minute: NUDGE_MINUTE[kind],
    immediate: false,
  });

  const today: PlannedNudge[] = [];
  if (
    on("praise") &&
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
    on(k) && NUDGE_MINUTE[k] > now && allowedAt(NUDGE_MINUTE[k]);
  if (upcoming("morning")) today.push(timed("morning", 0));
  if (upcoming("protein") && facts.proteinLeftShare > PROTEIN_WARNING_SHARE)
    today.push(timed("protein", 0));
  if (upcoming("workout") && facts.hasRoutine && !facts.workoutToday)
    today.push(timed("workout", 0));
  if (upcoming("slipping") && facts.underAtSlipping && !facts.allGoalsHit)
    today.push(timed("slipping", 0));
  if (upcoming("streak") && facts.streakCurrent > 0 && !facts.loggedToday)
    today.push(timed("streak", 0));

  // Tomorrow: the morning plan, and the streak check (cancelled by the re-plan as soon as something is logged).
  const tomorrow: PlannedNudge[] = [];
  if (on("morning") && allowedAt(NUDGE_MINUTE.morning))
    tomorrow.push(timed("morning", 1));
  if (
    on("streak") &&
    allowedAt(NUDGE_MINUTE.streak) &&
    (facts.streakCurrent > 0 || facts.loggedToday)
  )
    tomorrow.push(timed("streak", 1));

  return [
    ...capByPriority(today, perDay - facts.deliveredToday),
    ...capByPriority(tomorrow, perDay),
  ];
}
