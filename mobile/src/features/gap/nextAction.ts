// P37 · The next-best-action card on Home (S10): one card, one action, from the same situation the coach talks about
// (situation.ts). States: morning empty, under (protein or kcal), over, over late, all goals hit, on track, streak at
// risk, low steps.
import type { IconName } from "@/core/icons/Icon";
import type { LineFacts, LineSituation } from "@/features/coach/lines";
import { formatInt } from "@/features/targets/format";

export type NextAction = {
  eyebrow: string;
  title: string;
  icon: IconName;
  tone: "default" | "warning" | "success";
  href: "/gap" | "/gap?tab=move" | "/quick-log" | "/coming-soon";
};

const ways = (n: number) => (n > 1 ? `${n} ways to close it` : n === 1 ? "1 way to close it" : "see your options");

export function nextAction(situation: LineSituation, f: LineFacts, eatOptions: number, mealsToday: number): NextAction {
  switch (situation) {
    case "streak_risk":
      return {
        eyebrow: "Streak at risk",
        title: `Log anything to keep your ${f.streak}-day streak`,
        icon: "local_fire_department",
        tone: "warning",
        href: "/quick-log",
      };
    case "over":
      return {
        eyebrow: "Close the gap · balance it",
        title: f.walkMinutes
          ? `${formatInt(f.overKcal)} kcal over · a ${f.walkMinutes}-minute walk helps`
          : `${formatInt(f.overKcal)} kcal over · calm ways to balance it`,
        icon: "directions_walk",
        tone: "warning",
        href: "/gap?tab=move",
      };
    case "over_late":
      return {
        eyebrow: "Close the gap · balance it",
        title: `${formatInt(f.overKcal)} kcal over · tomorrow can ease by ${formatInt(f.easeKcal)}`,
        icon: "bedtime",
        tone: "warning",
        href: "/gap?tab=move",
      };
    case "done":
      return {
        eyebrow: "All goals hit",
        title: "Every target done today. Share your day",
        icon: "trophy",
        tone: "success",
        href: "/coming-soon",
      };
    case "protein":
      return {
        eyebrow: "Close the gap",
        title: `${formatInt(f.proteinLeftG)} g protein left · ${ways(eatOptions)}`,
        icon: "egg",
        tone: "default",
        href: "/gap",
      };
    case "under":
      return {
        eyebrow: "Close the gap",
        title: `${formatInt(f.kcalLeft)} kcal left · ${ways(eatOptions)}`,
        icon: "restaurant",
        tone: "default",
        href: "/gap",
      };
    case "steps":
      return {
        eyebrow: "Move a little",
        title: `${formatInt(f.stepsLeft)} steps to go · a ${f.walkForSteps}-minute walk`,
        icon: "directions_walk",
        tone: "default",
        href: "/gap?tab=move",
      };
    case "on_track":
      return mealsToday
        ? {
            eyebrow: "On track ✓",
            title: "Nothing to fix. Log your next meal when you eat",
            icon: "check_circle",
            tone: "success",
            href: "/quick-log",
          }
        : {
            eyebrow: "Next action",
            title: "Log your first meal of the day",
            icon: "restaurant",
            tone: "default",
            href: "/quick-log",
          };
    case "morning":
    case "welcome_back":
      return {
        eyebrow: "Next action",
        title: "Log your first meal of the day",
        icon: "restaurant",
        tone: "default",
        href: "/quick-log",
      };
  }
}
