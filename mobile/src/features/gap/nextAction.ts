// P37 · The next-best-action card on Home (S10): one card, one action, from the same situation the coach talks about
// (situation.ts). States: morning empty, under (protein or kcal), over, over late, all goals hit, on track, streak at
// risk, low steps. AB3: the button runs an Assistant Bar action (`execute`) with the bar's own executor, so Home and the
// bar do the same thing the same way; `href` stays for callers that only navigate.
import type { IconName } from "@/core/icons/Icon";
import type { LineFacts, LineSituation } from "@/features/coach/lines";
import { formatInt } from "@/features/targets/format";
import type { Href } from "expo-router";
import type { AssistantAction } from "@shared/domain/assistant";

export type NextAction = {
  eyebrow: string;
  title: string;
  icon: IconName;
  tone: "default" | "warning" | "success";
  /** The button on Home's brief: the one thing to tap. */
  cta: string | null;
  href: Href;
  /** AB3: the action the button runs (the bar's executor). */
  execute?: Extract<AssistantAction, { kind: "open" | "start_activity" }>;
};

export function nextAction(situation: LineSituation, f: LineFacts, eatOptions: number, mealsToday: number): NextAction {
  void eatOptions;
  const quiet: NextAction = { eyebrow: "Done for now", title: "Nothing needs you now. Your records are here whenever you need them.", icon: "check_circle", tone: "success", cta: null, href: "/day", execute: { kind: "open", screen: "day" } };
  if (situation === "over" || situation === "over_late") return { ...quiet, title: "Meal recorded. Continue your usual plan; no need to compensate." };
  if (situation === "done") return { ...quiet, title: "Food targets recorded. You're done for now." };
  if (situation === "protein" || situation === "under") return { eyebrow: "Optional food ideas", title: `Recorded totals are ${formatInt(situation === "protein" ? f.proteinLeftG : f.kcalLeft)} ${situation === "protein" ? "g protein" : "kcal"} below your plan. Want ideas?`, icon: "restaurant", tone: "default", cta: "See food ideas", href: "/gap", execute: { kind: "open", screen: "gap" } };
  if (situation === "steps") return { eyebrow: "Optional", title: "A walk is available if it fits your day.", icon: "directions_walk", tone: "default", cta: "Start a walk", href: "/activity/record?kind=walk", execute: { kind: "start_activity", activity: "walk" } };
  if (mealsToday) return quiet;
  return { eyebrow: situation === "welcome_back" ? "Welcome back" : "When you're ready", title: "Save something you ate. Nothing to catch up on.", icon: "restaurant", tone: "default", cta: "Log a meal", href: "/quick-log", execute: { kind: "open", screen: "quick_log" } };
}
