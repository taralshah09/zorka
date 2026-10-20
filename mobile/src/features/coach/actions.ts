// UX N1 · Buttons under a coach reply. The server only names a screen or a meal; the phone decides the route, so a
// reply can never send the user somewhere unexpected. AB7 (D89): the buttons now run through the Assistant Bar: a
// screen opens with the bar's route map, and a meal is said to Zorka as a turn ("I ate …", "I'll have …"), so it gets
// the same checks, tiers and Undo as anything said to the bar.
import { router } from "expo-router";
import { Alert } from "react-native";

import type { CoachAction } from "@/core/api/types";
import type { IconName } from "@/core/icons/Icon";
import { SCREEN_HREF, SCREEN_ICON } from "@/features/assistant/executors";
import { rememberFact } from "@/features/life/memory";
import { useActiveUser } from "@/features/users/activeUser";

export function actionIcon(a: CoachAction): IconName {
  if (a.type === "plan_day") return "calendar_month";
  if (a.type === "remember_fact") return "auto_awesome";
  if ("text" in a) return "restaurant";
  if (a.type === "start_workout") return "fitness_center";
  return SCREEN_ICON[a.screen] ?? "chevron_right";
}

/**
 * Runs a coach button. `say` sends words to Zorka as a new turn (the thread passes it); without it a meal button
 * opens the typed-meal screen with the words filled in.
 */
export function useCoachAction(say?: (text: string) => void): (a: CoachAction, key?: string) => void {
  return (a, key = "") => {
    switch (a.type) {
      case "open":
        if (SCREEN_HREF[a.screen]) router.push(SCREEN_HREF[a.screen]);
        return;
      case "log_meal":
      case "ate_meal":
        // A suggestion is never consumption on its own: "I ate …" still goes through the turn's checks and tiers.
        if (say) say(`I ate ${a.text}`);
        else router.push({ pathname: "/log/type", params: { text: a.text, actionKey: key } });
        return;
      case "plan_meal":
      case "save_idea":
        if (say) say(`I'll have ${a.text} later`);
        else router.push({ pathname: "/log/type", params: { text: a.text, actionKey: key } });
        return;
      case "start_workout": {
        router.push({ pathname: "/train/prepare", params: { actionKey: key } });
        return;
      }
      case "plan_day":
        // LA6: the brief for that date, pre-filled with what the user said.
        router.push({ pathname: "/plan/tomorrow", params: { date: a.date, text: a.text } });
        return;
      case "remember_fact": {
        // D78: a fact from chat is saved only after the user says yes.
        const userId = useActiveUser.getState().userId;
        if (!userId) return;
        Alert.alert("Remember this?", a.text, [
          { text: "Not now", style: "cancel" },
          { text: "Remember", onPress: () => rememberFact(userId, a.text) },
        ]);
        return;
      }
    }
  };
}
