// P36 · Plans and schedules today's nudges on the phone (D61), and routes notification taps.
// Renders nothing; mounted once in the root layout. Re-plans when the plan's inputs change (something logged, the day
// changes, settings or profile change) while the app is open: every scheduled nudge is cancelled and the new plan is
// scheduled with inexact DATE triggers. Nudges whose time passed since the last plan count as delivered (daily cap).
import type { NotificationResponse } from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { create } from "zustand";

import type { CoachId } from "@/core/api/types";
import { kv, KV_KEYS } from "@/core/storage/kv";
import { nudgeCopy, type LineFacts } from "@/features/coach/lines";
import { useActivityClock } from "@/features/activity/store";
import { useDayGap } from "@/features/gap/gap";
import { lineFacts } from "@/features/gap/situation";
import { useRoutines } from "@/features/gym/routines";
import { useStreak } from "@/features/progress/streak";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { computeGap } from "@shared/domain/gap";
import {
  NUDGE_MINUTE,
  planNudges,
  type NudgeFacts,
  type NudgeKind,
  type NudgeRoute,
  type PlannedNudge,
} from "@shared/domain/nudges";
import { addDays } from "@shared/domain/progress";
import {
  NUDGE_CHANNEL,
  ensureChannel,
  notifAccess,
  nudgeSettings,
  useNudgeSettings,
  useNudgeSettingsVersion,
} from "./settings";
import { Notifications } from "./notifications";

// Notifications is null on web and on a dev client built before P36: nudges are then simply off.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

type LoggedPlan = { userId: string; entries: { kind: NudgeKind; date: string; minute: number }[] };
type DeliveredLog = { date: string; kinds: NudgeKind[] };

const logKey = (userId: string) => `${KV_KEYS.nudgeLog}.${userId}`;
const PLAN_KEY = `${KV_KEYS.nudgeLog}.plan`;

function readJson<T>(k: string): T | null {
  try {
    const raw = kv.get(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Today's delivered nudges: the stored log plus every entry of the last plan whose time has passed. */
function deliveredToday(userId: string, today: string, minute: number): DeliveredLog {
  const log = readJson<DeliveredLog>(logKey(userId));
  const kinds = log?.date === today ? [...log.kinds] : [];
  const plan = readJson<LoggedPlan>(PLAN_KEY);
  if (plan?.userId === userId) {
    for (const e of plan.entries)
      if (e.date === today && e.minute <= minute && !kinds.includes(e.kind)) kinds.push(e.kind);
  }
  return { date: today, kinds };
}

function at(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, Math.floor(minute / 60), minute % 60, 0, 0);
}

async function schedule(
  N: NonNullable<typeof Notifications>,
  userId: string,
  coach: CoachId,
  plan: PlannedNudge[],
  today: string,
  facts: LineFacts,
  delivered: DeliveredLog,
) {
  await N.cancelAllScheduledNotificationsAsync();
  const entries: LoggedPlan["entries"] = [];
  for (const n of plan) {
    const date = n.dayOffset ? addDays(today, n.dayOffset) : today;
    const copy = nudgeCopy(
      coach,
      n.kind,
      n.dayOffset ? { ...facts, proteinLeftG: facts.targetProteinG, kcalLeft: facts.targetKcal } : facts,
    );
    const content = { title: copy.title, body: copy.body, data: { route: n.route, kind: n.kind, userId } };
    if (n.immediate) {
      await N.scheduleNotificationAsync({ content, trigger: null });
      delivered.kinds.push(n.kind);
      continue;
    }
    await N.scheduleNotificationAsync({
      content,
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: at(date, n.minute),
        channelId: NUDGE_CHANNEL,
      },
    });
    entries.push({ kind: n.kind, date, minute: n.minute });
  }
  kv.set(logKey(userId), JSON.stringify(delivered));
  kv.set(PLAN_KEY, JSON.stringify({ userId, entries } satisfies LoggedPlan));
}

/** Where a tapped notification goes. Today needs no navigation; S41 and S22 are pushed once the app is ready. */
export const usePendingRoute = create<{ route: NudgeRoute | null }>(() => ({ route: null }));

function go(route: NudgeRoute) {
  if (route === "gap") router.push("/gap");
  else if (route === "train") router.push("/train");
  else router.navigate("/today");
}

/** Today calls this on focus: a tap that cold-started the app is routed after the launch redirects settle. */
export function consumePendingRoute() {
  const route = usePendingRoute.getState().route;
  if (!route) return;
  usePendingRoute.setState({ route: null });
  if (route !== "today") go(route);
}

export function NudgePlanner() {
  const userId = useActiveUser((s) => s.userId);
  const clock = useActivityClock();
  const dg = useDayGap(clock);
  const streak = useStreak(userId, clock);
  const { profile } = useTargets();
  const { routines } = useRoutines(userId);
  const settings = useNudgeSettings(userId);
  const version = useNudgeSettingsVersion((s) => s.v);
  const coach = profile.data?.coach ?? "calm_mentor";
  const last = useRef<string | null>(null);
  const ready = useRef(false);

  // Taps: a cold start waits for Today (consumePendingRoute); a tap while running navigates at once.
  useEffect(() => {
    const N = Notifications;
    if (!N) return;
    const routeOf = (r: NotificationResponse) => r.notification.request.content.data?.route as NudgeRoute | undefined;
    const initial = N.getLastNotificationResponse();
    if (initial) {
      const route = routeOf(initial);
      if (route) usePendingRoute.setState({ route });
      N.clearLastNotificationResponse();
    }
    const timer = setTimeout(() => (ready.current = true), 1500);
    const sub = N.addNotificationResponseReceivedListener((r) => {
      const route = routeOf(r);
      if (!route) return;
      if (ready.current) go(route);
      else usePendingRoute.setState({ route });
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  const today = dg?.day ?? localDate(new Date(clock));
  const facts: NudgeFacts | null =
    dg && streak
      ? {
          minuteOfDay: dg.minute,
          proteinLeftShare:
            dg.gap.budget.proteinG > 0 ? Math.max(0, dg.gap.remaining.proteinG) / dg.gap.budget.proteinG : 0,
          underAtSlipping:
            computeGap({
              targets: dg.gap.budget,
              eaten: dg.gap.eaten,
              burnedKcal: 0,
              minuteOfDay: NUDGE_MINUTE.slipping,
            }).state === "under",
          hasRoutine: routines.length > 0,
          workoutToday: dg.workoutToday,
          streakCurrent: streak.current,
          loggedToday: streak.todayLogged,
          allGoalsHit: dg.gap.state === "done",
          deliveredToday: 0,
          praiseSentToday: false,
        }
      : null;

  // Everything that changes the plan except the clock; the plan itself drops nudges whose time has passed.
  const signature =
    userId && facts && dg
      ? JSON.stringify([
          version,
          userId,
          today,
          coach,
          settings,
          Math.round(facts.proteinLeftShare * 20),
          facts.underAtSlipping,
          facts.hasRoutine,
          facts.workoutToday,
          facts.streakCurrent,
          facts.loggedToday,
          facts.allGoalsHit,
          Math.round(dg.gap.remaining.kcal / 50),
        ])
      : null;

  useEffect(() => {
    const N = Notifications;
    if (!N || !signature || signature === last.current || !userId || !facts || !dg) return;
    last.current = signature;
    void (async () => {
      try {
        if ((await notifAccess()) !== "granted") return;
        await ensureChannel();
        const s = nudgeSettings(userId);
        const delivered = deliveredToday(userId, today, facts.minuteOfDay);
        const plan = planNudges(
          { ...facts, deliveredToday: delivered.kinds.length, praiseSentToday: delivered.kinds.includes("praise") },
          s,
        );
        await schedule(N, userId, coach, plan, today, lineFacts(dg, streak), delivered);
      } catch {
        last.current = null; // try again on the next change
      }
    })();
    // facts/dg/streak are read through the signature; re-running on every clock tick would re-schedule each second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
