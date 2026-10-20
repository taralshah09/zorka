import { create } from "zustand";
import { kv } from "@/core/storage/kv";
import type { Routine } from "./routines";
export const useRestChoiceVersion = create<{ v: number }>(() => ({ v: 0 }));
const key = (userId: string, day: string) => `zorka.restChoice.${userId}.${day}`;
export const restChosen = (userId: string | null, day: string) => !!userId && kv.get(key(userId, day)) === "rest";
export function chooseRest(userId: string, day: string, rest: boolean) {
  if (rest) kv.set(key(userId, day), "rest"); else kv.remove(key(userId, day));
  useRestChoiceVersion.setState((s) => ({ v: s.v + 1 }));
}
/** A separate preview variant; the saved routine is never edited. */
export function shorterRoutine(routine: Routine): Routine {
  return { ...routine, name: `${routine.name} · shorter`, exercises: routine.exercises.map((e) => ({ ...e, targetSets: Math.max(1, Math.ceil(e.targetSets / 2)) })) };
}
