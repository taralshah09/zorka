// UX N1 · Buttons under a coach reply. The server only names a screen or a meal; the phone decides the route, so a
// reply can never send the user somewhere unexpected. Screen routes reuse the Home brief's hrefs (nextAction.ts).
import { router, type Href } from "expo-router";

import type { CoachAction, CoachScreen } from "@/core/api/types";
import type { IconName } from "@/core/icons/Icon";

const SCREEN_HREF: Record<CoachScreen, Href> = {
  gap: "/gap",
  move: "/gap?tab=move",
  quick_log: "/quick-log",
  log_weight: "/log-weight",
  progress: "/(tabs)/progress",
  checkin: "/progress/checkin",
  steps: "/activity/steps",
  record_walk: { pathname: "/activity/record", params: { kind: "walk" } },
  day: "/day",
  share_day: "/share?card=day",
};

const SCREEN_ICON: Record<CoachScreen, IconName> = {
  gap: "restaurant",
  move: "directions_walk",
  quick_log: "add",
  log_weight: "monitor_weight",
  progress: "show_chart",
  checkin: "calendar_month",
  steps: "footprint",
  record_walk: "directions_walk",
  day: "bar_chart",
  share_day: "ios_share",
};

export function actionIcon(a: CoachAction): IconName {
  if ("text" in a) return "restaurant";
  if (a.type === "start_workout") return "fitness_center";
  return SCREEN_ICON[a.screen] ?? "chevron_right";
}

/** Runs a coach button: opens the screen, logs the meal through the usual text parser, or starts a workout. */
export function useCoachAction(): (a: CoachAction, key?: string) => void {
  return (a, key = "") => {
    switch (a.type) {
      case "open":
        if (SCREEN_HREF[a.screen]) router.push(SCREEN_HREF[a.screen]);
        return;
      case "log_meal":
      case "plan_meal":
      case "save_idea":
      case "ate_meal":
        // Legacy log_meal also opens intent review. A hypothetical suggestion never means consumption.
        router.push({ pathname: "/coach-meal", params: { text: a.text, actionKey: key } });
        return;
      case "start_workout": {
        router.push({ pathname: "/train/prepare", params: { actionKey: key } });
      }
    }
  };
}
