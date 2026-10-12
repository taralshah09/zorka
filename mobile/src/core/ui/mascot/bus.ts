// Mascot reactions, triggered from anywhere in the app (a meal saved, a workout discarded, a celebration). Every
// mounted <Mascot listen /> plays the latest one. A reaction stays "fresh" for a moment, so a mascot that mounts right
// after the action (e.g. the screen you land on after discarding a workout) still plays it.
import { create } from "zustand";

export type MascotReaction = "blink" | "eyeroll" | "happy" | "cheer" | "wiggle";

/** How long a reaction can still be picked up by a mascot that mounts after it fired. */
export const FRESH_MS = 2500;

type State = { last: { kind: MascotReaction; id: number; at: number } | null };

export const useMascotBus = create<State>(() => ({ last: null }));

let seq = 0;

/** Plays `kind` on every listening mascot. */
export function reactMascot(kind: MascotReaction) {
  useMascotBus.setState({ last: { kind, id: ++seq, at: Date.now() } });
}
