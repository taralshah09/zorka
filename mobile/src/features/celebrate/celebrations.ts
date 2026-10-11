// P39 · When to celebrate, and what the coach says (S47). The only big animations in the app (brand §9): a 7/30/100-day
// streak, a PR, all goals hit, a phase completed. Each moment shows once per profile (remembered on the phone), so
// going back to Home doesn't replay it.
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";

import type { CoachId } from "@/core/api/types";
import { kv } from "@/core/storage/kv";

export type CelebrationKind = "streak" | "pr" | "day" | "phase";

const SEEN_KEY = "kimbo.celebrated";
const KEEP = 60;

function seen(userId: string): string[] {
  try {
    const raw = kv.get(`${SEEN_KEY}.${userId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Opens S47 for this moment unless it was already shown. `key` names the moment (e.g. "streak:2026-10-12:30",
 * "pr:<workout id>"). Returns true when the overlay opened.
 */
export function celebrate(
  userId: string,
  key: string,
  params: { kind: CelebrationKind; value?: string; id?: string; detail?: string },
): boolean {
  const done = seen(userId);
  if (done.includes(key)) return false;
  kv.set(`${SEEN_KEY}.${userId}`, JSON.stringify([...done, key].slice(-KEEP)));
  router.push({ pathname: "/celebrate", params });
  return true;
}

/** Celebrates `moment` whenever the screen gains focus or the moment changes while it's focused (once per key). */
export function useCelebrateOnFocus(
  userId: string | null,
  moment: { key: string; kind: CelebrationKind; value?: string } | null,
) {
  const key = moment?.key ?? null;
  const kind = moment?.kind ?? null;
  const value = moment?.value;
  useFocusEffect(
    useCallback(() => {
      if (userId && key && kind) celebrate(userId, key, value ? { kind, value } : { kind });
    }, [userId, key, kind, value]),
  );
}

type Facts = { value?: string; detail?: string };

export function celebrationTitle(kind: CelebrationKind, f: Facts): string {
  switch (kind) {
    case "streak":
      return `${f.value ?? ""}-day streak!`;
    case "pr":
      return "New personal record!";
    case "day":
      return "All goals hit!";
    case "phase":
      return "Phase complete!";
  }
}

/** Same three characters as the Home lines (D60): clean, never shaming, no emoji in UI chrome. */
const LINES: Record<CoachId, Record<CelebrationKind, (f: Facts) => string>> = {
  drill_sergeant: {
    streak: (f) => `${f.value} days. No days off. That's discipline.`,
    pr: (f) => `${f.detail ?? "New best"}. Heavier than ever. Now recover and do it again.`,
    day: () => "All targets hit. That's the standard.",
    phase: () => "Phase done. Mission complete. Next objective.",
  },
  calm_mentor: {
    streak: (f) => `${f.value} days in a row. Small steps, kept every day. That's how habits form.`,
    pr: (f) => `${f.detail ?? "A new best"}. Your training is paying off.`,
    day: () => "Everything done today. Well earned.",
    phase: () => "A whole phase, finished. Take a moment to notice how far you've come.",
  },
  desi_legend: {
    streak: (f) => `${f.value} din, ek bhi miss nahi! Legend behaviour!`,
    pr: (f) => `${f.detail ?? "New record"}! Kya baat hai, full power!`,
    day: () => "Every target smashed! That's how legends are made!",
    phase: () => "Phase khatam, goal pakka! Chalo, next chapter!",
  },
};

export function celebrationLine(coach: CoachId | null | undefined, kind: CelebrationKind, f: Facts): string | null {
  return coach ? LINES[coach][kind](f) : null;
}
