// P37 · "Welcome back" (S48, IDEATION Flow C): shown on Home when the last manual log was 5+ days before today and
// nothing is logged yet today. No guilt; dismissed for the day with "Log today's first meal" or the close button.
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { kv, KV_KEYS } from "@/core/storage/kv";
import { loggedDates } from "@/features/progress/queries";
import { dayNumber } from "@shared/domain/progress";
import type { Streak } from "@shared/domain/streak";
import { restartHelp } from "@shared/domain/restart";
const visitKey = (userId: string) => `zorka.visits.${userId}`;
function visits(userId: string): string[] { try { return JSON.parse(kv.get(visitKey(userId)) ?? "[]"); } catch { return []; } }
export function recordVisit(userId: string | null, day: string) {
  if (userId) kv.set(visitKey(userId), JSON.stringify([...new Set([...visits(userId), day])].sort().slice(-90)));
}
export function useRecordVisit(userId: string | null, day: string) {
  useFocusEffect(useCallback(() => { recordVisit(userId, day); }, [userId, day]));
}

export const AWAY_DAYS = 5;

const seenKey = (userId: string) => `${KV_KEYS.welcomeBackSeen}.${userId}`;

export function useWelcomeBack(userId: string | null, today: string, streak: Streak | null) {
  const [dismissed, setDismissed] = useState(0);
  const pastLogs = userId ? loggedDates(userId).filter((d) => d < today) : [];
  const pastVisits = userId ? visits(userId).filter((d) => d < today) : [];
  const restart = restartHelp(today, pastLogs.at(-1) ?? null, pastVisits.at(-1) ?? null);
  const show = useMemo(() => {
    void dismissed;
    if (!userId || !streak || streak.todayLogged) return false;
    if (kv.get(seenKey(userId)) === today) return false;
    const past = loggedDates(userId).filter((d) => d < today);
    const last = past[past.length - 1];
    return !!last && dayNumber(today) - dayNumber(last) >= AWAY_DAYS;
  }, [userId, today, streak, dismissed]);
  // A freeze covered at least one of the days away and the streak survived.
  const freezeUsed =
    !!streak && streak.current > 0 && streak.days.slice(-AWAY_DAYS - 1).some((d) => d.state === "frozen");
  return {
    restart,
    show,
    freezeUsed,
    dismiss: () => {
      if (userId) kv.set(seenKey(userId), today);
      setDismissed((n) => n + 1);
    },
  };
}
