// AB3 · "Day changed → re-plan" (docs/ASSISTANT_BAR_PLAN.md "How a turn works"). The rules plan follows a new brief at
// once (useDayPlan reads it). The AI re-plan of the week (D85) needs the planner's inputs, which only the Today screen
// holds, so the bar leaves a request here and Today runs it when it's next showing and online.
import { create } from "zustand";

import { kv } from "@/core/storage/kv";

const key = (userId: string) => `zorka.assistantReplan.${userId}`;
export const useReplanVersion = create<{ v: number }>(() => ({ v: 0 }));

export function requestReplan(userId: string) {
  kv.set(key(userId), new Date().toISOString());
  useReplanVersion.setState((s) => ({ v: s.v + 1 }));
}

/** True once per request: the caller runs the re-plan. */
export function takeReplanRequest(userId: string): boolean {
  if (!kv.get(key(userId))) return false;
  kv.remove(key(userId));
  return true;
}
